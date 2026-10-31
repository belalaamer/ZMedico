import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Regression cover for the "Forbidden: admin only" incident: the admin
// functions probed has_role() with the service-role client, which the
// ZMED-274 probe hardening refuses unless the deprecated singular JWT
// claim GUC is present. The gates now read user_roles directly and treat
// system_owner as an administrator, exactly like the frontend.

function loadStaffRoles() {
  const source = readFileSync("supabase/functions/_shared/staff-roles.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  new Function("module", "exports", compiled)(mod, mod.exports);
  return mod.exports as {
    readUserRoles: (client: unknown, userId: string) => Promise<{ roles: string[] | null; error: unknown }>;
    isAdministrator: (roles: string[]) => boolean;
  };
}

const staffRoles = loadStaffRoles();
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function loadFunction(name: string) {
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8").replace(/^import .*;\r?\n/gm, "");
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;
}

function roleResult(fixture: string[] | "error") {
  if (fixture === "error") return { data: null, error: { code: "42501", message: "private" } };
  return { data: fixture.map((role) => ({ role })), error: null };
}

async function runCreate(caller: string[] | "error", body: Record<string, unknown>) {
  let handler!: (request: Request) => Promise<Response>;
  const createUser = vi.fn(async () => ({ data: { user: null }, error: { code: "TEST_STOP", message: "stop" } }));
  const writes: string[] = [];
  const service = {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: async (column: string, value: string) => column === "user_id" ? roleResult(caller) : { data: [], error: null },
        ilike: () => ({ limit: async () => ({ data: [], error: null }) }),
        maybeSingle: async () => ({ data: null, error: null }),
      }),
      upsert: async () => { writes.push(table); return { error: null }; },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    auth: { admin: { createUser } },
  };
  const user = { auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) }, rpc: vi.fn() };
  const deno = {
    env: { get: (key: string) => key === "SUPABASE_ANON_KEY" ? "anon" : key === "SUPABASE_SERVICE_ROLE_KEY" ? "service" : "https://local.test" },
    serve: (value: typeof handler) => { handler = value; },
  };
  new Function("Deno", "createClient", "requireActiveSession", "allocateEmployeeId", "readUserRoles", "isAdministrator", loadFunction("admin-create-user"))(
    deno, (_url: string, key: string) => key === "anon" ? user : service, async () => null, vi.fn(), staffRoles.readUserRoles, staffRoles.isAdministrator,
  );
  const response = await handler(new Request("https://local.test", { method: "POST", headers: { Authorization: "Bearer test-only" }, body: JSON.stringify(body) }));
  return { response, body: await response.json(), createUser, writes };
}

async function runDelete(caller: string[] | "error", target: string[] | "error") {
  let handler!: (request: Request) => Promise<Response>;
  const deleteUser = vi.fn(async () => ({ error: null }));
  const service = {
    from: () => ({
      select: (columns: string) => ({
        eq: async (column: string, value: string) => columns === "role" ? roleResult(value === "actor" ? caller : target) : { count: 2, error: null },
      }),
      insert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    auth: { admin: { deleteUser } },
  };
  const user = { auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) } };
  const deno = {
    env: { get: (key: string) => key === "SUPABASE_ANON_KEY" ? "anon" : key === "SUPABASE_SERVICE_ROLE_KEY" ? "service" : "https://local.test" },
    serve: (value: typeof handler) => { handler = value; },
  };
  new Function("Deno", "createClient", "corsPreflight", "jsonResponse", "requireActiveSession", "readUserRoles", "isAdministrator", loadFunction("admin-delete-user"))(
    deno, (_url: string, key: string) => key === "anon" ? user : service, () => new Response("ok"), jsonResponse, async () => null, staffRoles.readUserRoles, staffRoles.isAdministrator,
  );
  const response = await handler(new Request("https://local.test", { method: "POST", headers: { Authorization: "Bearer test-only" }, body: JSON.stringify({ user_id: "target" }) }));
  return { response, body: await response.json(), deleteUser };
}

async function runReset(caller: string[] | "error", target: string[] | "error") {
  let handler!: (request: Request) => Promise<Response>;
  const updateUserById = vi.fn(async () => ({ error: null }));
  const service = {
    from: () => ({
      select: (columns: string) => ({
        eq: async (column: string, value: string) => columns === "role" ? roleResult(value === "actor" ? caller : target) : { data: [], error: null },
      }),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "target@example.invalid" } }, error: null }), updateUserById } },
  };
  const user = { auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) } };
  const deno = {
    env: { get: (key: string) => key === "SUPABASE_ANON_KEY" ? "anon" : key === "SUPABASE_SERVICE_ROLE_KEY" ? "service" : "https://local.test" },
    serve: (value: typeof handler) => { handler = value; },
  };
  new Function("Deno", "createClient", "corsPreflight", "jsonResponse", "requireActiveSession", "readUserRoles", "isAdministrator", loadFunction("admin-reset-password"))(
    deno, (_url: string, key: string) => key === "anon" ? user : service, () => new Response("ok"), jsonResponse, async () => null, staffRoles.readUserRoles, staffRoles.isAdministrator,
  );
  const response = await handler(new Request("https://local.test", { method: "POST", headers: { Authorization: "Bearer test-only" }, body: JSON.stringify({ user_id: "target" }) }));
  return { response, body: await response.json(), updateUserById };
}

describe("admin Edge role gates read user_roles directly", () => {
  it.each(["admin-create-user", "admin-delete-user", "admin-reset-password"])("never probes has_role with the service client: %s", (name) => {
    const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8");
    expect(source).not.toMatch(/rpc\(\s*"has_role"/);
    expect(source).toContain("readUserRoles");
  });

  it("treats a system_owner as an administrator when creating users", async () => {
    const result = await runCreate(["system_owner"], { email: "new@example.invalid", role: "admin" });
    expect(result.createUser).toHaveBeenCalledOnce();
  });

  it("denies a caller who holds no administrator role", async () => {
    const result = await runCreate(["receptionist"], { email: "new@example.invalid", role: "admin" });
    expect(result.response.status).toBe(403);
    expect(result.body).toEqual({ error: "Forbidden: admin only" });
    expect(result.createUser).not.toHaveBeenCalled();
    expect(result.writes).toEqual([]);
  });

  it("fails closed with 503 when the caller roles cannot be read", async () => {
    const result = await runCreate("error", { email: "new@example.invalid", role: "admin" });
    expect(result.response.status).toBe(503);
    expect(result.body).toEqual({ error: "Unable to verify administrator access" });
    expect(result.createUser).not.toHaveBeenCalled();
  });

  it("keeps system_owner creation owner-only", async () => {
    const denied = await runCreate(["admin"], { email: "new@example.invalid", role: "system_owner" });
    expect(denied.response.status).toBe(403);
    expect(denied.body).toEqual({ error: "Only the System Owner may create another System Owner" });
    const allowed = await runCreate(["system_owner"], { email: "new@example.invalid", role: "system_owner" });
    expect(allowed.createUser).toHaveBeenCalledOnce();
  });

  it("sees a target system_owner instead of silently treating the probe as false", async () => {
    const result = await runDelete(["admin"], ["system_owner"]);
    expect(result.response.status).toBe(403);
    expect(result.body).toEqual({ error: "Only the System Owner may delete another System Owner" });
    expect(result.deleteUser).not.toHaveBeenCalled();
  });

  it("fails closed when the target roles cannot be read", async () => {
    const result = await runDelete(["system_owner"], "error");
    expect(result.response.status).toBe(500);
    expect(result.body).toEqual({ error: "Unable to verify target role" });
    expect(result.deleteUser).not.toHaveBeenCalled();
  });

  it("keeps deleting a plain user working for a system_owner", async () => {
    const result = await runDelete(["system_owner"], []);
    expect(result.response.status).toBe(200);
    expect(result.deleteUser).toHaveBeenCalledOnce();
  });

  it("protects a system_owner password from an administrator", async () => {
    const result = await runReset(["admin"], ["system_owner"]);
    expect(result.response.status).toBe(403);
    expect(result.body).toEqual({ error: "Only the System Owner may reset another System Owner password" });
    expect(result.updateUserById).not.toHaveBeenCalled();
  });

  it("keeps resetting a plain user working for a system_owner", async () => {
    const result = await runReset(["system_owner"], []);
    expect(result.response.status).toBe(200);
    expect(result.updateUserById).toHaveBeenCalledOnce();
  });
});
