// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";

// E9 drives the real `send-reminder` body against a provider that stops answering.
// The Edge runtime (Deno) has `AbortSignal.timeout`; the jsdom this suite runs in
// does not, so the deadline is injected as a stand-in with the same contract, and
// the runtime half is proven separately in Deno. See the PR's evidence table.
const SOURCE_PATH = "supabase/functions/send-reminder/index.ts";

type Row = Record<string, unknown>;

type Write = { id: string; payload: Row };

type TickInput = {
  reminders?: Row[];
  env?: Record<string, string>;
  provider?: (url: string, init: RequestInit) => Promise<Response>;
};

const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://local.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SUPABASE_ANON_KEY: "anon-key",
  SEND_REMINDER_CRON_SECRET: "cron-secret",
  SEND_REMINDER_PROVIDER_TIMEOUT_MS: "25",
  SEND_REMINDER_TICK_DEADLINE_MS: "120000",
};

const REMINDER: Row = {
  id: "rem-1",
  branch_id: "branch-1",
  patient_id: "patient-1",
  reminder_type: "sms",
  message_en: "Your appointment is tomorrow.",
  message_ar: "",
  scheduled_time: "2026-10-29T08:00:00.000Z",
  status: "pending",
  event_type: "appointment_reminder",
  payload: null,
  attempt_count: 0,
};

const SETTINGS: Row = {
  sms_enabled: true,
  sms_provider: "twilio",
  twilio_account_sid: "AC1",
  twilio_auth_token: "token",
  twilio_from_sms: "+15005550006",
  send_appointment_reminders: true,
};

const PATIENT: Row = { phone: "+201000000000", email: null, whatsapp_opt_in: false };

// Same contract as `AbortSignal.timeout(ms)`: an already-aborted-able signal whose
// reason is a `TimeoutError` DOMException once the deadline passes.
function timeoutStandIn(): { timeout: (ms: number) => AbortSignal } {
  return {
    timeout: (ms: number) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      }, ms);
      controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      return controller.signal;
    },
  };
}

// A provider that accepts the request and never answers. It rejects with the
// signal's own reason, which is what separates "the deadline fired" from
// "the harness hung".
function hangingProvider(): (url: string, init: RequestInit) => Promise<Response> {
  return (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init.signal;
      if (!signal) {
        reject(new Error("the provider call carries no deadline; the tick would be killed by the platform"));
        return;
      }
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
}

type TickResult = {
  status: number;
  outcome: Record<string, unknown>;
  writes: Write[];
  providerCalls: { url: string; init: RequestInit; startedAt: number }[];
};

async function runTick(input: TickInput): Promise<TickResult> {
  const reminders = input.reminders ?? [REMINDER];
  const writes: Write[] = [];
  const providerCalls: TickResult["providerCalls"] = [];

  const client = {
    from(table: string) {
      if (table === "reminders") {
        return {
          select() {
            const query: Record<string, unknown> = {
              eq: () => query,
              lte: () => query,
              limit: () => query,
              then: (resolve: (value: { data: Row[]; error: null }) => void) => {
                resolve({ data: reminders, error: null });
              },
            };
            return query;
          },
          update(payload: Row) {
            const entry: Write = { id: "", payload };
            writes.push(entry);
            return {
              eq: (_column: string, value: string) => {
                entry.id = value;
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "notification_settings") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: SETTINGS, error: null }) }) }) };
      }
      if (table === "patients") {
        return { select: () => ({ eq: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({ data: PATIENT, error: null }) }) }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  let handler!: (request: Request) => Promise<Response>;
  const env: Record<string, string | undefined> = { ...BASE_ENV, ...input.env };
  const deno = {
    env: { get: (name: string) => env[name] },
    serve: (fn: (request: Request) => Promise<Response>) => {
      handler = fn;
    },
  };
  const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  const source = readFileSync(SOURCE_PATH, "utf8").replace(/^import .*;\r?\n/gm, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const provider =
    input.provider ??
    (async () => {
      throw new Error("no provider stub was configured for this tick");
    });
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {}, startedAt: Date.now() };
    providerCalls.push(call);
    return provider(call.url, call.init);
  });

  new Function("Deno", "createClient", "corsPreflight", "jsonResponse", "AbortSignal", compiled)(
    deno,
    () => client,
    () => new Response("preflight"),
    jsonResponse,
    timeoutStandIn(),
  );

  const response = await handler(
    new Request("https://local.invalid", {
      method: "POST",
      headers: { Authorization: "Bearer cron-secret", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  return { status: response.status, outcome: (await response.json()) as Record<string, unknown>, writes, providerCalls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("leaves a reminder whose provider request times out pending and retryable", async () => {
  const tick = await runTick({ provider: hangingProvider() });

  expect(tick.status).toBe(200);
  expect(tick.outcome).toMatchObject({ processed: 1, sent: 0, failed: 0, deferred: 1 });
  expect(tick.outcome.results).toEqual([{ id: "rem-1", ok: false, deferred: true, error: "Twilio request timed out" }]);
  expect(tick.providerCalls[0]?.init.signal?.aborted).toBe(true);

  expect(tick.writes.map((write) => write.id)).toEqual(["rem-1"]);
  const update = tick.writes[0]?.payload ?? {};
  expect(update.status).toBeUndefined();
  expect(update).toMatchObject({
    provider_status: "unknown",
    error_message: "Twilio request timed out",
    destination_phone: "+201000000000",
    attempt_count: 1,
  });
});

it("applies the configured provider deadline to the request it sends", async () => {
  const tick = await runTick({
    env: { SEND_REMINDER_PROVIDER_TIMEOUT_MS: "40" },
    provider: hangingProvider(),
  });

  const call = tick.providerCalls[0];
  expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  expect(Date.now() - (call?.startedAt ?? 0)).toBeGreaterThanOrEqual(40);
  expect(tick.outcome).toMatchObject({ deferred: 1, failed: 0 });
});

it("still retires a provider error that is not a timeout", async () => {
  const tick = await runTick({
    provider: async () => {
      throw new Error("ECONNREFUSED");
    },
  });

  expect(tick.outcome).toMatchObject({ processed: 1, sent: 0, failed: 1 });
  expect(tick.outcome.deferred).toBeUndefined();
  expect(tick.writes[0]?.payload).toMatchObject({
    status: "failed",
    provider_status: "failed",
    error_message: "Twilio request failed",
  });
});

it("records a normal send when the provider answers in time", async () => {
  const tick = await runTick({
    provider: async () => new Response(JSON.stringify({ sid: "SM1", status: "sent" }), { status: 200 }),
  });

  expect(tick.outcome).toMatchObject({ processed: 1, sent: 1, failed: 0 });
  expect(tick.outcome.deferred).toBeUndefined();
  expect(tick.writes[0]?.payload).toMatchObject({
    status: "sent",
    provider_status: "accepted",
    provider_message_id: "SM1",
  });
});

it("stops between rows once the tick deadline passes, and never sends the untried row twice", async () => {
  const tick = await runTick({
    reminders: [REMINDER, { ...REMINDER, id: "rem-2" }],
    env: { SEND_REMINDER_PROVIDER_TIMEOUT_MS: "40", SEND_REMINDER_TICK_DEADLINE_MS: "10" },
    provider: hangingProvider(),
  });

  expect(tick.outcome).toMatchObject({
    processed: 1,
    sent: 0,
    failed: 0,
    deferred: 2,
    stopped_early: true,
    not_attempted: 1,
  });
  expect(tick.providerCalls).toHaveLength(1);
  expect(tick.writes.map((write) => write.id)).toEqual(["rem-1"]);
});

it("gives every outbound provider call its own deadline", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  expect(source.match(/await fetch\(/g)).toHaveLength(4);
  expect(source.match(/signal: AbortSignal\.timeout\(providerTimeoutMs\(\)\)/g)).toHaveLength(4);
});
