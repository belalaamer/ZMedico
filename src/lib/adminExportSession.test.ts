import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { requireActiveSession } from "../../supabase/functions/_shared/active-session";
import { corsPreflight, jsonResponse } from "../../supabase/functions/_shared/cors";

async function run(
  sessionError: unknown,
  throws = false,
  roles = ["admin"],
  branchId: string | null = "branch",
  roleError: unknown = null,
  scopeGranted: unknown = true,
  scopeError: unknown = null,
) {
  let handler!: (req: Request) => Promise<Response>;
  const serviceCalls: string[] = [];
  const traces: Array<{ table: string; method: string; args: unknown[] }> = [];
  const from = (table: string) => {
    serviceCalls.push(table);
    let roleRows = roles.map(role => ({ role }));
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "limit", "insert"]) chain[method] = (...args: unknown[]) => { traces.push({ table, method, args }); if (table === "user_roles" && method === "in" && args[0] === "role") roleRows = roleRows.filter(row => (args[1] as string[]).includes(row.role)); return chain; };
    chain.maybeSingle = () => Promise.resolve(table === "user_roles" ? { data: roleRows.length === 1 ? roleRows[0] : null, error: roleError ?? (roleRows.length > 1 ? { code: "PGRST116" } : null) } : { data: null, error: null });
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "user_roles" ? roleRows : [{ id: "synthetic-patient" }], error: table === "user_roles" ? roleError : null }).then(resolve);
    return chain;
  };
  const rpc = vi.fn((name: string, args?: unknown) => {
    void args;
    if (name === "user_has_branch_access") return Promise.resolve({ data: scopeGranted, error: scopeError });
    if (throws) return Promise.reject(new Error("transport"));
    return Promise.resolve({ error: sessionError });
  });
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "actor" } }, error: null }) }, rpc };
  const createClient = vi.fn((_url: string, key: string) => key === "anon" ? client : { from });
  const deno = { env: { get: (key: string) => key === "SUPABASE_ANON_KEY" ? "anon" : key === "SUPABASE_SERVICE_ROLE_KEY" ? "service" : "https://example.test" }, serve: (fn: typeof handler) => { handler = fn; } };
  const source = readFileSync("supabase/functions/admin-export/index.ts", "utf8").replace(/^import .*;\r?\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("Deno", "createClient", "requireActiveSession", "corsPreflight", "jsonResponse", compiled)(deno, createClient, requireActiveSession, corsPreflight, jsonResponse);
  const response = await handler(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer synthetic-token" }, body: JSON.stringify({ table: "patients", branch_id: branchId }) }));
  return { response, createClient, serviceCalls, client, traces };
}

it.each([{ code: "42501" }, { code: "PT401" }])("rejects an Auth-recognized but inactive session before service access %j", async error => {
  const result = await run(error);
  expect(result.response.status).toBe(401);
  expect(result.client.auth.getUser).toHaveBeenCalledOnce();
  expect(result.createClient).toHaveBeenCalledOnce();
  expect(result.serviceCalls).toEqual([]);
});

it("does not export or write audit when required database contract is missing", async () => {
  const result = await run({ code: "PGRST202" });
  expect(result.response.status).toBe(503);
  expect(result.createClient).toHaveBeenCalledOnce();
  expect(result.serviceCalls).toEqual([]);
});

it("does not export on session-verification transport failure", async () => {
  const result = await run(null, true);
  expect(result.response.status).toBe(503);
  expect(result.serviceCalls).toEqual([]);
});

it("retains authorized branch-scoped export, proving scope through the caller's own JWT client", async () => {
  const result = await run(null);
  expect(result.response.status).toBe(200);
  expect(result.client.rpc).toHaveBeenCalledWith("assert_active_session");
  expect(result.client.rpc).toHaveBeenCalledWith("user_has_branch_access", { _branch: "branch" });
  expect(result.serviceCalls).toEqual(["user_roles", "audit_logs", "patients", "audit_logs"]);
  expect(result.traces).toContainEqual({ table: "user_roles", method: "eq", args: ["user_id", "actor"] });
  expect(result.traces).toContainEqual({ table: "user_roles", method: "in", args: ["role", ["admin", "system_owner"]] });
  expect(result.traces).toContainEqual({ table: "patients", method: "eq", args: ["branch_id", "branch"] });
});

it("branch scope is never resolved on the service-role client", async () => {
  const result = await run(null);
  expect(result.serviceCalls).not.toContain("staff_branches");
  expect(result.serviceCalls).not.toContain("tenant_branches");
});

it("ordinary admin cannot export a foreign branch: denied before audit or data", async () => {
  const result = await run(null, false, ["admin"], "foreign-branch", null, false);
  expect(result.response.status).toBe(403);
  expect(result.client.rpc).toHaveBeenCalledWith("user_has_branch_access", { _branch: "foreign-branch" });
  expect(result.serviceCalls).toEqual(["user_roles"]);
});

it("a scope check that errors denies export before audit or data", async () => {
  const result = await run(null, false, ["admin"], "branch", null, null, { message: "could not find function user_has_branch_access" });
  expect(result.response.status).toBe(403);
  expect(result.serviceCalls).toEqual(["user_roles"]);
});

it("a scope check that returns anything other than explicit true denies export", async () => {
  for (const granted of [null, false, 0, "true"]) {
    const result = await run(null, false, ["admin"], "branch", null, granted);
    expect(result.response.status).toBe(403);
    expect(result.serviceCalls).toEqual(["user_roles"]);
  }
});

it.each([{ roles: ["admin", "system_owner"] }, { roles: ["system_owner", "admin"] }])("supports both legitimate administrator roles in any row order: %j", async ({ roles }) => {
  const result = await run(null, false, roles, null);
  expect(result.response.status).toBe(200);
  expect(result.serviceCalls).toEqual(["user_roles", "audit_logs", "patients", "audit_logs"]);
});

it("single system owner retains global export", async () => {
  const result = await run(null, false, ["system_owner"], null);
  expect(result.response.status).toBe(200);
});

it("ordinary admin still requires a branch", async () => {
  const result = await run(null, false, ["admin"], null);
  expect(result.response.status).toBe(400);
  expect(result.serviceCalls).toEqual(["user_roles"]);
});

it("role lookup failure denies export before audit/data", async () => {
  const result = await run(null, false, ["system_owner"], null, { code: "57014" });
  expect(result.response.status).toBe(403);
  expect(result.serviceCalls).toEqual(["user_roles"]);
});

it("active non-administrator cannot export", async () => {
  const result = await run(null, false, ["doctor"]);
  expect(result.response.status).toBe(403);
  expect(result.serviceCalls).toEqual(["user_roles"]);
});
