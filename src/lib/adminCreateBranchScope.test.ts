import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const branch = "11111111-2222-4333-8444-555555555555";

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
async function run({ allowed = true as boolean | null, scopeError = null as unknown, throws = false,
  role = "doctor", branchId = branch as string | null } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const writes: string[] = [];
  const createUser = vi.fn().mockResolvedValue({ data: { user: null }, error: { code: "TEST_STOP" } });
  const chain = { upsert: vi.fn(async () => { writes.push("allowlist"); return { error: null }; }),
    delete: () => ({ eq: async () => ({ error: null }) }) };
  const roleRows = { select: () => ({ eq: async (column: string, value: string) => ({
    data: column === "user_id" && value === "actor" ? [{ role: "admin" }] : [], error: null }) }) };
  const user = { auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) },
    rpc: vi.fn(async (name: string) => {
      expect(name).toBe("user_has_branch_access");
      if (throws) throw new Error("private transport details");
      return { data: allowed, error: scopeError };
    }) };
  const service = { rpc: vi.fn(async () => ({ data: true, error: null })),
    from: vi.fn((table: string) => table === "user_roles" ? roleRows : chain), auth: { admin: { createUser } } };
  const createClient = (_url: string, key: string) => key === "anon" ? user : service;
  const deno = { env: { get: (key: string) => key === "SUPABASE_ANON_KEY" ? "anon" : key === "SUPABASE_SERVICE_ROLE_KEY" ? "service" : "https://local.test" },
    serve: (value: typeof handler) => { handler = value; } };
  const source = readFileSync("supabase/functions/admin-create-user/index.ts", "utf8").replace(/^import .*;\r?\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;
  const roles = loadStaffRoles();
  new Function("Deno", "createClient", "requireActiveSession", "allocateEmployeeId", "readUserRoles", "isAdministrator", compiled)(deno, createClient, async () => null, vi.fn(), roles.readUserRoles, roles.isAdministrator);
  const response = await handler(new Request("https://local.test", { method: "POST", headers: { Authorization: "Bearer native-test" }, body: JSON.stringify({ email: "owned@example.invalid", role, branch_id: branchId }) }));
  return { response, body: await response.json(), writes, user, service, createUser };
}

it.each([false, null])("denies a foreign or missing branch authorization before provisioning: %s", async allowed => {
  const result = await run({ allowed });
  expect(result.response.status).toBe(403);
  expect(result.writes).toEqual([]);
  expect(result.createUser).not.toHaveBeenCalled();
});

it("checks scope using the caller JWT client, not the service client", async () => {
  const result = await run();
  expect(result.user.rpc).toHaveBeenCalledExactlyOnceWith("user_has_branch_access", { _branch: branch });
  expect(result.service.rpc.mock.calls).not.toContainEqual(["user_has_branch_access", { _branch: branch }]);
  expect(result.writes).toEqual(["allowlist"]);
  expect(result.createUser).toHaveBeenCalledOnce();
});

it.each([{ code: "PGRST202" }, { code: "57014" }])("fails closed on scope dependency failure %j", async scopeError => {
  const result = await run({ scopeError });
  expect(result.response.status).toBe(503);
  expect(result.body).toEqual({ error: "Unable to verify branch access" });
  expect(result.writes).toEqual([]);
});

it("fails closed on rejected branch-check transport", async () => {
  const result = await run({ throws: true });
  expect(result.response.status).toBe(503);
  expect(result.body).toEqual({ error: "Unable to verify branch access" });
  expect(result.writes).toEqual([]);
});

it("validates the supplied branch UUID before privileged writes", async () => {
  const result = await run({ branchId: "not-a-branch" });
  expect(result.response.status).toBe(400);
  expect(result.body).toEqual({ error: "Invalid branch" });
  expect(result.writes).toEqual([]);
});

it("also checks an explicitly selected branch when creating an admin", async () => {
  const result = await run({ role: "admin", allowed: false });
  expect(result.response.status).toBe(403);
  expect(result.writes).toEqual([]);
});

it("retains branchless administrator provisioning without inventing a branch", async () => {
  const result = await run({ role: "admin", branchId: null });
  expect(result.user.rpc).not.toHaveBeenCalled();
  expect(result.writes).toEqual(["allowlist"]);
});
