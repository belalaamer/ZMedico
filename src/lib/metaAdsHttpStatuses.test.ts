// @vitest-environment jsdom
import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";

// E12 drives the real `meta-ads-connection` body. Before the fix the handler
// answered every rejection with `400`, so these tests assert the status *and*
// that the message text a clinic already reads is untouched.
//
// `crypto.subtle` is injected as a stand-in with the same contract (node's AES-GCM
// behind the WebCrypto shapes this file uses): jsdom does not provide SubtleCrypto,
// Deno does, and the token has to be really encrypted here or the `test` action
// cannot be reached at all. See src/lib/sendReminderProviderTimeout.test.ts for the
// same harness convention.
const SOURCE_PATH = "supabase/functions/meta-ads-connection/index.ts";

const BASE_URL = "https://local.invalid";
const ANON_KEY = "anon-key";
const SERVICE_ROLE_KEY = "service-role";
const ENCRYPTION_SECRET = "a-dedicated-encryption-secret";

type Row = Record<string, unknown>;
type Query = { data: Row | Row[] | null; error: { message: string } | null };
type Write = { payload: Row };

type Fixtures = {
  authError?: boolean;
  roles?: Row[];
  rolesError?: boolean;
  branchAllowed?: boolean;
  connections?: Row[];
  connectionError?: boolean;
  updateError?: boolean;
  upsertError?: boolean;
  meta?: () => Promise<Response>;
};

const CONNECTION: Row = {
  id: "conn-1",
  branch_id: "branch-1",
  provider: "meta_ads",
  ad_account_id: "act_123",
  business_id: null,
  currency: "EGP",
  timezone: "Africa/Cairo",
  api_version: "v20.0",
  status: "configured",
  token_fingerprint: "fp",
  last_tested_at: null,
  last_successful_sync_at: null,
  last_attempted_sync_at: null,
  last_error_code: null,
  last_error_message: null,
};

const cryptoStandIn = {
  getRandomValues: <T extends Uint8Array>(bytes: T): T => {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + 11) % 256;
    return bytes;
  },
  subtle: {
    digest: async (_alg: string, data: Uint8Array) =>
      new Uint8Array(createHash("sha256").update(Buffer.from(data)).digest()),
    importKey: async (_fmt: string, raw: Uint8Array) => new Uint8Array(raw),
    encrypt: async (params: { iv: Uint8Array }, key: Uint8Array, plain: Uint8Array) => {
      const cipher = createCipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(params.iv));
      const body = Buffer.concat([cipher.update(Buffer.from(plain)), cipher.final()]);
      return new Uint8Array(Buffer.concat([body, cipher.getAuthTag()]));
    },
    decrypt: async (params: { iv: Uint8Array }, key: Uint8Array, sealed: Uint8Array) => {
      const bytes = Buffer.from(sealed);
      const plain = createDecipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(params.iv));
      plain.setAuthTag(bytes.subarray(bytes.length - 16));
      return new Uint8Array(Buffer.concat([plain.update(bytes.subarray(0, bytes.length - 16)), plain.final()]));
    },
  },
};

async function call(
  body: Row,
  fx: Fixtures = {},
  options: { authorization?: string | null; env?: Record<string, string | undefined> } = {},
): Promise<{ status: number; body: Row; writes: Write[] }> {
  const writes: Write[] = [];
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: BASE_URL,
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    META_ADS_ENCRYPTION_KEY: ENCRYPTION_SECRET,
    ...options.env,
  };

  const chain = (get: () => Query) => {
    const one = async () => {
      const result = get();
      return Array.isArray(result.data) ? { data: result.data[0] ?? null, error: result.error } : result;
    };
    const query: Record<string, unknown> = {
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: one,
      single: one,
      then: (resolve: (value: Query) => void) => resolve(get()),
    };
    return query;
  };

  const ok = (data: Row | Row[] | null = null): Query => ({ data, error: null });
  const fail = (message: string): Query => ({ data: null, error: { message } });

  const queryFor = (table: string, op: string, payload?: Row): Record<string, unknown> => {
    if (op === "update" || op === "upsert") {
      writes.push({ payload: payload ?? {} });
      const result: Query = (op === "update" ? fx.updateError : fx.upsertError) ? fail("write rejected") : ok(CONNECTION);
      const query = chain(() => result);
      return op === "upsert" ? { ...query, select: () => query } : query;
    }
    if (table === "user_roles") return chain(() => (fx.rolesError ? fail("roles unreadable") : ok(fx.roles ?? [{ role: "admin" }])));
    return chain(() => (fx.connectionError ? fail("connection read failed") : ok(fx.connections ?? [CONNECTION])));
  };

  const client = (key: string) => ({
    auth: {
      getUser: async () =>
        fx.authError ? { data: { user: null }, error: { message: "invalid token" } } : { data: { user: { id: "user-1" } }, error: null },
    },
    rpc: async (name: string) =>
      name === "user_has_branch_access"
        ? { data: fx.branchAllowed === false ? false : true, error: null }
        : { data: null, error: null },
    from: (table: string) => ({
      select: () => queryFor(table, "select"),
      update: (payload: Row) => queryFor(table, "update", payload),
      upsert: (payload: Row) => queryFor(table, "upsert", payload),
    }),
  });

  let handler: ((request: Request) => Promise<Response>) | undefined;
  const deno = {
    env: { get: (name: string) => env[name] },
    serve: (fn: (request: Request) => Promise<Response>) => {
      handler = fn;
      return { shutdown: async () => {} };
    },
  };

  vi.stubGlobal("fetch", vi.fn(async () => (fx.meta ? await fx.meta() : new Response(JSON.stringify({ data: [{}] }), { status: 200 }))));

  const source = readFileSync(SOURCE_PATH, "utf8").replace(/^import .*;$/gm, "");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  });
  // The harness strips every `import` line, so a cross-module symbol the shipped
  // source uses has to arrive as an injected parameter or it is a ReferenceError
  // -- which this function's own catch would report as a 400. The session guard is
  // injected as a pass-through here; its own statuses are proven by
  // edgeSessionGuard.test.ts, and this file's contract test proves the catch
  // honours any status an error carries, so 401/503 survive into the response.
  new Function("Deno", "createClient", "crypto", "requireActiveSessionOrThrow", outputText)(
    deno,
    (url: string, key: string) => client(key),
    cryptoStandIn,
    async () => {},
  );

  if (!handler) throw new Error("the module never registered a Deno.serve handler");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.authorization !== null) headers.Authorization = options.authorization ?? `Bearer ${ANON_KEY}`;
  const response = await handler(
    new Request(`${BASE_URL}/functions/v1/meta-ads-connection`, { method: "POST", headers, body: JSON.stringify(body) }),
  );
  return { status: response.status, body: (await response.json()) as Row, writes };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("says 401 when there is no session at all", async () => {
  const ran = await call({ action: "get", branch_id: "branch-1" }, {}, { authorization: null });
  expect(ran).toMatchObject({ status: 401, body: { error: "Authentication required" } });
});

it("says 401 when the bearer does not resolve to a user", async () => {
  const ran = await call({ action: "get", branch_id: "branch-1" }, { authError: true });
  expect(ran).toMatchObject({ status: 401, body: { error: "Authentication required" } });
});

it("says 403 to a signed-in non-admin, with the message the settings page shows", async () => {
  const ran = await call({ action: "get", branch_id: "branch-1" }, { roles: [{ role: "reception" }] });
  expect(ran).toMatchObject({ status: 403, body: { error: "Meta Ads connection requires admin access" } });
});

it("says 403 for a branch that is not the caller's", async () => {
  const ran = await call({ action: "get", branch_id: "branch-9" }, { branchAllowed: false });
  expect(ran).toMatchObject({ status: 403, body: { error: "Branch access denied" } });
});

it("says 404 for a connection that does not exist, not 400", async () => {
  const ran = await call({ action: "test", connection_id: "missing" }, { connections: [] });
  expect(ran).toMatchObject({ status: 404, body: { error: "Meta Ads connection not found" } });
});

it("says 500 when the function itself is missing its secrets", async () => {
  const ran = await call({ action: "get", branch_id: "branch-1" }, {}, { env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });
  expect(ran).toMatchObject({ status: 500, body: { error: "Supabase function secrets are not configured" } });
});

it("says 503 when the permission read fails, which is not the caller's fault", async () => {
  const ran = await call({ action: "get", branch_id: "branch-1" }, { rolesError: true });
  expect(ran).toMatchObject({ status: 503, body: { error: "Unable to verify permissions" } });
});

it("says 500 when the connection read fails", async () => {
  const ran = await call({ action: "get", connection_id: "conn-1" }, { connectionError: true });
  expect(ran).toMatchObject({ status: 500, body: { error: "connection read failed" } });
});

it("says 400 for a client mistake it cannot classify", async () => {
  const ran = await call({ action: "list" });
  expect(ran).toMatchObject({ status: 400, body: { error: "branch_id or connection_id is required" } });

  const unsupported = await call({ action: "report", branch_id: "branch-1" });
  expect(unsupported).toMatchObject({ status: 400, body: { error: "Unsupported action" } });

  const noToken = await call({ action: "test", connection_id: "conn-1" }, { connections: [{ ...CONNECTION, token_ciphertext: null, token_iv: null }] });
  expect(noToken).toMatchObject({ status: 400, body: { error: "No Meta token is configured" } });
});

it("says 502 when Meta rejects the stored token", async () => {
  const saved = await call({
    action: "save",
    branch_id: "branch-1",
    ad_account_id: "act_123",
    access_token: "EAAGthis-is-a-real-shaped-long-meta-token",
  });
  expect(saved.status).toBe(200);
  // The token round-trips through real AES-GCM and never reaches the row in clear.
  const stored = saved.writes[0].payload;
  expect(typeof stored.token_ciphertext).toBe("string");
  expect(String(stored.token_ciphertext)).not.toContain("EAAG");

  const tested = await call(
    { action: "test", connection_id: "conn-1" },
    {
      connections: [storedConnection(saved)],
      meta: async () =>
        new Response(JSON.stringify({ error: { code: 190, message: "Error validating access token: expired" } }), { status: 400 }),
    },
  );
  expect(tested.status).toBe(502);
  expect(String(tested.body.error)).toContain("Error validating access token: expired");
});

it("says 500, not 400, when the token no longer unlocks with the configured secret", async () => {
  const saved = await call({
    action: "save",
    branch_id: "branch-1",
    ad_account_id: "act_123",
    access_token: "EAAGthis-is-a-real-shaped-long-meta-token",
  });

  const afterRotation = await call(
    { action: "test", connection_id: "conn-1" },
    { connections: [storedConnection(saved)] },
    { env: { META_ADS_ENCRYPTION_KEY: "a-different-but-still-long-enough-secret" } },
  );
  expect(afterRotation).toMatchObject({
    status: 500,
    body: { error: "Stored Meta token could not be decrypted with the configured encryption secret" },
  });

  const tooShort = await call(
    { action: "save", branch_id: "branch-1", ad_account_id: "act_123", access_token: "EAAGthis-is-a-real-shaped-long-meta-token" },
    {},
    { env: { META_ADS_ENCRYPTION_KEY: "short" } },
  );
  expect(tooShort).toMatchObject({ status: 500, body: { error: "Meta encryption secret is not configured" } });
});

// The `save` stub echoes the shipped row, so hand its own ciphertext back as the
// stored connection instead of inventing one the decrypt path would reject.
function storedConnection(saved: { writes: Write[] }): Row {
  return { ...CONNECTION, token_ciphertext: saved.writes[0].payload.token_ciphertext, token_iv: saved.writes[0].payload.token_iv };
}

it("keeps the shipped source on the contract these tests assume", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  expect(source).toContain("return jsonResponse({ error: errorMessage(error) }, statusFrom(error));");
  expect(source.match(/throw new EdgeHttpError\(/g)?.length).toBeGreaterThanOrEqual(14);
  expect(source).not.toMatch(/jsonResponse\(\{ error: errorMessage\(error\) \}, 400\)/);
});
