// @vitest-environment jsdom
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";

// E10/E12 drive the real `whatsapp-webhook` body. The two runtime pieces this
// suite cannot inherit from jsdom are injected as stand-ins with the same
// contract, exactly as in src/lib/sendReminderProviderTimeout.test.ts:
//   - `AbortSignal.timeout` exists in Deno, not in jsdom;
//   - `crypto.subtle` HMAC is node:crypto behind the same shape, so the
//     webhook's signature check is genuinely exercised rather than stubbed out.
const SOURCE_PATH = "supabase/functions/whatsapp-webhook/index.ts";

const APP_SECRET = "app-secret";
const SERVICE_ROLE_KEY = "service-role";
const SUPABASE_URL = "https://local.invalid";

const BASE_ENV: Record<string, string> = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  WHATSAPP_APP_SECRET: APP_SECRET,
  WHATSAPP_VERIFY_TOKEN: "verify-token",
};

type Row = Record<string, unknown>;
type Query = { data: Row | Row[] | null; error: { message: string; code?: string } | null };
type TableFx = Partial<Record<"select" | "insert" | "update", Query>>;
type Write = { table: string; payload: Row };

const OK: Query = { data: null, error: null };
const ERRORED: Query = { data: null, error: { message: "connection reset" } };

type Harness = {
  writes: Write[];
  invokes: { url: string; init: RequestInit }[];
  status: number;
  body: Row;
};

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

// Same shape as the WebCrypto calls verifySignature() makes.
const cryptoStandIn = {
  subtle: {
    importKey: async (_alg: string, keyMaterial: Uint8Array) => keyMaterial,
    sign: async (_alg: string, key: Uint8Array, data: Uint8Array) =>
      new Uint8Array(createHmac("sha256", Buffer.from(key)).update(Buffer.from(data)).digest()),
  },
};

function inboundPayload(): Row {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "PN1" },
              messages: [{ id: "wamid.1", from: "201000000000", type: "text", text: { body: "I need a session tomorrow" } }],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(): Row {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "PN1" },
              statuses: [{ id: "wamid.9", status: "delivered" }],
            },
          },
        ],
      },
    ],
  };
}

type Invoke = (url: string, init: RequestInit) => Promise<Response>;

async function run(
  payload: Row,
  options: {
    tables?: Record<string, TableFx>;
    invoke?: Invoke;
    signature?: string;
  } = {},
): Promise<Harness> {
  const writes: Write[] = [];
  const invokes: Harness["invokes"] = [];
  const tasks: Promise<unknown>[] = [];
  const tables = options.tables ?? {};

  const chain = (result: Query) => {
    const query: Record<string, unknown> = {
      eq: () => query,
      neq: () => query,
      is: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => result,
      single: async () => result,
      then: (resolve: (value: Query) => void) => resolve(result),
    };
    return query;
  };

  const client = {
    from(table: string) {
      const fxFor = tables[table] ?? {};
      const pick = (op: "select" | "insert" | "update"): Query => fxFor[op] ?? OK;
      return {
        select: () => chain(pick("select")),
        insert: (payload: Row) => {
          writes.push({ table, payload });
          const query = chain(pick("insert"));
          return { ...query, select: () => chain(pick("insert")) };
        },
        update: (payload: Row) => {
          writes.push({ table, payload });
          return chain(pick("update"));
        },
      };
    },
  };

  let handler: ((request: Request) => Promise<Response>) | undefined;
  const deno = {
    env: { get: (name: string) => BASE_ENV[name] },
    serve: (fn: (request: Request) => Promise<Response>) => {
      handler = fn;
      return { shutdown: async () => {} };
    },
  };

  vi.stubGlobal("EdgeRuntime", { waitUntil: (task: Promise<unknown>) => tasks.push(task) });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      invokes.push({ url, init });
      return options.invoke
        ? options.invoke(url, init)
        : new Response(JSON.stringify({ ok: true, text: "answered" }), { status: 200 });
    }),
  );

  const source = readFileSync(SOURCE_PATH, "utf8").replace(/^import .*;$/gm, "");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  });

  new Function("Deno", "createClient", "AbortSignal", "crypto", outputText)(
    deno,
    () => client,
    timeoutStandIn(),
    cryptoStandIn,
  );

  if (!handler) throw new Error("the module never registered a Deno.serve handler");

  const rawBody = JSON.stringify(payload);
  const response = await handler(
    new Request(`${SUPABASE_URL}/functions/v1/whatsapp-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": options.signature ?? `sha256=${createHmac("sha256", APP_SECRET).update(rawBody).digest("hex")}`,
      },
      body: rawBody,
    }),
  );
  await Promise.allSettled(tasks);

  return { writes, invokes, status: response.status, body: (await response.json()) as Row };
}

// The conversation lookup and the inbound write always succeed unless a test
// overrides them, so every case below starts from a working webhook.
const INBOUND_TABLES = {
  channel_accounts: { select: { data: { id: "account-1", tenant_id: "tenant-1", branch_id: "branch-1" }, error: null } },
  conversations: { select: { data: { id: "conv-1" }, error: null } },
  messages: { insert: { data: { id: "msg-1" }, error: null } },
};

function handoffs(writes: Write[]): Write[] {
  return writes.filter(
    (write) => write.table === "conversations" && write.payload.status === "human_active",
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("stores the inbound message and invokes the orchestrator with a deadline", async () => {
  const ran = await run(inboundPayload(), { tables: INBOUND_TABLES });

  expect(ran.status).toBe(200);
  expect(ran.writes.some((write) => write.table === "messages" && write.payload.external_message_id === "wamid.1")).toBe(true);
  expect(ran.invokes).toHaveLength(1);
  expect(ran.invokes[0].url).toBe(`${SUPABASE_URL}/functions/v1/ai-agent-respond`);
  expect(ran.invokes[0].init.headers).toMatchObject({ Authorization: `Bearer ${SERVICE_ROLE_KEY}` });
  // Before E10 the webhook never read this response; the deadline is what makes
  // "the orchestrator is wedged" an event it can act on instead of silence.
  expect(ran.invokes[0].init.signal).toBeInstanceOf(AbortSignal);
});

it("hands the conversation to a human when the orchestrator reports a failed turn", async () => {
  const ran = await run(inboundPayload(), {
    tables: INBOUND_TABLES,
    invoke: async () =>
      new Response(JSON.stringify({ ok: false, reason: "settings_load_error", handed_off: false }), { status: 500 }),
  });

  // 200 to Meta either way -- the handoff is the part that must not be lost.
  expect(ran.status).toBe(200);
  expect(handoffs(ran.writes)).toHaveLength(1);
  expect(String(handoffs(ran.writes)[0].payload.handoff_reason)).toMatch(/^ai_turn_failed: .*settings_load_error/);
  expect(handoffs(ran.writes)[0].payload.handoff_at).toBeTruthy();
});

it("leaves a deliberately skipped turn alone", async () => {
  const ran = await run(inboundPayload(), {
    tables: INBOUND_TABLES,
    invoke: async () =>
      new Response(JSON.stringify({ ok: true, skipped: true, reason: "ai_disabled_or_not_configured" }), { status: 200 }),
  });

  expect(handoffs(ran.writes)).toEqual([]);
});

it("does not overwrite the reason when the orchestrator handed off itself", async () => {
  const ran = await run(inboundPayload(), {
    tables: INBOUND_TABLES,
    invoke: async () =>
      new Response(JSON.stringify({ ok: false, reason: "provider_error", handed_off: true }), { status: 500 }),
  });

  expect(handoffs(ran.writes)).toEqual([]);
});

it("hands off when the invoke itself dies", async () => {
  const ran = await run(inboundPayload(), {
    tables: INBOUND_TABLES,
    invoke: async () => {
      throw new TypeError("network unreachable");
    },
  });

  expect(handoffs(ran.writes)).toHaveLength(1);
  expect(String(handoffs(ran.writes)[0].payload.handoff_reason)).toContain("invoke_error=TypeError");
});

it("hands off when the orchestrator answers something that is not a turn result", async () => {
  const ran = await run(inboundPayload(), { tables: INBOUND_TABLES, invoke: async () => new Response("<html>502</html>", { status: 502 }) });

  expect(handoffs(ran.writes)).toHaveLength(1);
  expect(String(handoffs(ran.writes)[0].payload.handoff_reason)).toContain("unparsable_response");
});

it("refuses a payload whose signature does not match", async () => {
  const raw = inboundPayload();
  const ran = await run(raw, {
    tables: INBOUND_TABLES,
    signature: `sha256=${createHmac("sha256", "the-wrong-secret").update(JSON.stringify(raw)).digest("hex")}`,
  });

  expect(ran.status).toBe(401);
  expect(ran.writes).toEqual([]);
  expect(ran.invokes).toEqual([]);
});

it("counts a delivery status only when both writes landed", async () => {
  const both = await run(statusPayload(), { tables: {} });
  expect(both.body).toMatchObject({ received: true, updated: 1 });

  // The old `!error || !portalError` scored a half-written delivery as a success,
  // so `updated` -- a number Meta's payload is answered with -- claimed a delivery
  // the portal table never recorded.
  const oneSided = await run(statusPayload(), {
    tables: { reminders: { update: OK }, patient_portal_delivery_events: { update: ERRORED } },
  });
  expect(oneSided.body).toMatchObject({ received: true, updated: 0 });

  const neither = await run(statusPayload(), {
    tables: { reminders: { update: ERRORED }, patient_portal_delivery_events: { update: ERRORED } },
  });
  expect(neither.body).toMatchObject({ received: true, updated: 0 });
});

it("keeps the shipped source on the contract these tests assume", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  expect(source).toContain("if (!error && !portalError) updated++;");
  expect(source).toContain("signal: AbortSignal.timeout(AI_AGENT_INVOKE_TIMEOUT_MS)");
  expect(source).toContain("reportUnansweredTurn(supabase, conversationId, detail)");
  expect(source).toContain("rt.waitUntil(task)");
});
