// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";

// E10 drives the real `ai-agent-respond` body through the repo's Edge-function
// harness (transpile, then execute with stubbed clients), so every assertion lands
// on the shipped source rather than on a copy of its logic.
const SOURCE_PATH = "supabase/functions/ai-agent-respond/index.ts";

type Row = Record<string, unknown>;
type Query = { data: Row | Row[] | null; error: { message: string; code?: string } | null };
type TableFx = Partial<Record<"select" | "insert" | "update", Query>>;
type Write = { table: string; payload: Row };
type Loaded = { writes: Write[]; handler: (request: Request) => Promise<Response> };

const OK: Query = { data: null, error: null };
const NO_ROWS: Query = { data: [], error: null };

const CONVERSATION: Row = {
  id: "conv-1",
  tenant_id: "tenant-1",
  branch_id: "branch-1",
  channel_account_id: "account-1",
  external_contact_id: "201000000000",
  status: "ai_active",
  state: null,
};

const AI_SETTINGS: Row = { ai_enabled: true, language: "en", tone: "friendly", booking_enabled: true };
const PROVIDER_CONFIG: Row = { provider: "gemini", model: "gemini-2.0-flash", temperature: 0.2, secret_id: "secret-1" };
const HISTORY: Query = { data: [{ sender_type: "patient", direction: "inbound", content: "I need a session tomorrow", created_at: "2026-10-30T08:00:00.000Z" }], error: null };

const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://local.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  // Without a token the send is never attempted, so the delivery tests below would
  // pass for the wrong reason.
  WHATSAPP_ACCESS_TOKEN: "wa-token",
};

type Provider = { generate: (input: unknown) => Promise<{ text: string; toolCalls: unknown[] }> };

function load(
  fx: Record<string, TableFx> = {},
  env: Record<string, string> = BASE_ENV,
  provider?: Provider,
  vault?: Query,
): Loaded {
  const writes: Write[] = [];
  let handler: ((request: Request) => Promise<Response>) | undefined;

  const chain = (result: Query) => {
    const query: Record<string, unknown> = {
      eq: () => query,
      neq: () => query,
      in: () => query,
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
      const fxFor = fx[table] ?? {};
      const pick = (op: "select" | "insert" | "update"): Query =>
        fxFor[op] ?? (op === "select" && table === "messages" ? NO_ROWS : OK);
      const selectAfterInsert = () => chain(pick("insert"));
      return {
        select: () => chain(pick("select")),
        insert: (payload: Row) => {
          writes.push({ table, payload });
          const query = chain(pick("insert"));
          return { ...query, select: selectAfterInsert };
        },
        update: (payload: Row) => {
          writes.push({ table, payload });
          return chain(pick("update"));
        },
      };
    },
    rpc: async () => vault ?? { data: "gemini-api-key", error: null },
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
  };

  const deno = {
    env: { get: (name: string) => env[name] },
    serve: (fn: (request: Request) => Promise<Response>) => {
      handler = fn;
      return { shutdown: async () => {} };
    },
  };

  const source = readFileSync(SOURCE_PATH, "utf8").replace(/^import .*;$/gm, "");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  });

  const getAIProvider = vi.fn(() => provider ?? {
    generate: async () => ({ text: "Thursday at 9:00 is open.", toolCalls: [] as unknown[] }),
  });
  const dispatchTool = vi.fn(async () => ({ result: { handed_off: true }, success: true }));

  new Function("Deno", "createClient", "getAIProvider", "dispatchTool", "TOOL_DEFINITIONS", outputText)(
    deno,
    () => client,
    getAIProvider,
    dispatchTool,
    [],
  );

  if (!handler) throw new Error("the module never registered a Deno.serve handler");
  return { writes, handler };
}

async function turn(ran: Loaded, authorization = "Bearer service-role"): Promise<{ status: number; body: Row }> {
  const response = await ran.handler(
    new Request("https://local.invalid/functions/v1/ai-agent-respond", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify({ conversation_id: "conv-1" }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Row };
}

function healthy(extra: Record<string, TableFx> = {}): Record<string, TableFx> {
  return {
    conversations: { select: { data: CONVERSATION, error: null } },
    ai_tenant_settings: { select: { data: AI_SETTINGS, error: null } },
    ai_provider_config: { select: { data: PROVIDER_CONFIG, error: null } },
    messages: { select: HISTORY, insert: { data: { id: "msg-1" }, error: null } },
    channel_accounts: { select: { data: { external_account_id: "PN1" }, error: null } },
    ...extra,
  };
}

function handedOff(writes: Write[]): Write | undefined {
  return writes.find((write) => write.table === "conversations" && write.payload.status === "human_active");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("answers a settings load failure as a failure and hands the conversation to a human", async () => {
  const ran = load(healthy({ ai_tenant_settings: { select: { data: null, error: { message: "boom" } } } }));
  const result = await turn(ran);
  expect(result.status).toBe(500);
  expect(result.body).toMatchObject({ ok: false, reason: "settings_load_error", handed_off: true });
  expect(String(handedOff(ran.writes)?.payload.handoff_reason)).toMatch(/^ai_turn_failed:/);
  expect(handedOff(ran.writes)?.payload.handoff_at).toBeTruthy();
});

it("separates a conversation that cannot be read from one that does not exist", async () => {
  const missing = load({ conversations: { select: { data: null, error: null } } });
  expect(await turn(missing)).toMatchObject({ status: 404, body: { ok: false, reason: "conversation_not_found" } });
  expect(missing.writes).toEqual([]);

  const unreadable = load({ conversations: { select: { data: null, error: { message: "connection reset" } } } });
  expect(await turn(unreadable)).toMatchObject({ status: 500, body: { ok: false, reason: "conversation_load_error" } });
  expect(unreadable.writes).toEqual([]);
});

it("answers a provider-config load failure as a failure", async () => {
  const ran = load(healthy({ ai_provider_config: { select: { data: null, error: { message: "unreadable" } } } }));
  expect(await turn(ran)).toMatchObject({ status: 500, body: { ok: false, reason: "provider_config_load_error" } });
  expect(handedOff(ran.writes)).toBeTruthy();
});

it("answers a history load failure as a failure, not as an empty success", async () => {
  const ran = load(healthy({ messages: { select: { data: null, error: { message: "history unreadable" } } } }));
  expect(await turn(ran)).toMatchObject({ status: 500, body: { ok: false, reason: "history_load_error", handed_off: true } });
  expect(handedOff(ran.writes)).toBeTruthy();
});

it("keeps a deliberately skipped turn a 200 and leaves the conversation alone", async () => {
  const ran = load(healthy({ ai_tenant_settings: { select: { data: { ai_enabled: false }, error: null } } }));
  expect(await turn(ran)).toMatchObject({ status: 200, body: { ok: true, skipped: true, reason: "ai_disabled_or_not_configured" } });
  expect(ran.writes).toEqual([]);
});

it("keeps an unconfigured provider a skip, but a Vault read failure a failure", async () => {
  const notConfigured = load(healthy({ ai_provider_config: { select: { data: null, error: null } } }));
  expect(await turn(notConfigured)).toMatchObject({ status: 200, body: { ok: true, skipped: true, reason: "ai_provider_not_configured" } });

  const secretUnreadable = load(healthy(), BASE_ENV, undefined, { data: null, error: { message: "vault unreadable" } });
  expect(await turn(secretUnreadable)).toMatchObject({ status: 500, body: { ok: false, reason: "provider_secret_load_error" } });
  expect(handedOff(secretUnreadable.writes)).toBeTruthy();
});

it("hands off when the model call itself blows up", async () => {
  const ran = load(healthy(), BASE_ENV, {
    generate: async () => {
      throw new Error("Gemini responded 503");
    },
  });
  expect(await turn(ran)).toMatchObject({ status: 500, body: { ok: false, reason: "provider_error", handed_off: true } });
  expect(handedOff(ran.writes)).toBeTruthy();
});

it("reports a failed WhatsApp delivery as a failed turn", async () => {
  const ran = load(healthy());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid access token" } }), { status: 400 })),
  );
  expect(await turn(ran)).toMatchObject({ status: 502, body: { ok: false, reason: "whatsapp_send_failed", handed_off: true } });
  expect(handedOff(ran.writes)).toBeTruthy();
});

it("still answers 200 when the turn really was produced and delivered", async () => {
  const ran = load(healthy());
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 })));
  expect(await turn(ran)).toMatchObject({ status: 200, body: { ok: true, text: "Thursday at 9:00 is open." } });
  expect(handedOff(ran.writes)).toBeUndefined();
});

it("leaves the patient-message write intact on the success path", async () => {
  const ran = load(healthy());
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 })));
  await turn(ran);
  expect(ran.writes.some((write) => write.table === "messages" && write.payload.sender_type === "ai")).toBe(true);
});

it("keeps refusing a caller that is not the internal service", async () => {
  const ran = load(healthy());
  expect(await turn(ran, "Bearer someone-elses-token")).toMatchObject({ status: 403 });
  expect(ran.writes).toEqual([]);
});
