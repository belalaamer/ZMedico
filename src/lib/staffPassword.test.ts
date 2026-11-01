import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  MIN_STAFF_PASSWORD_LENGTH,
  staffPasswordMinimumCopy,
  staffPasswordTooShort,
  staffPasswordTooShortCopy,
} from "./staffPassword";

describe("the shared staff password floor", () => {
  it("is the eight characters the patient surfaces already require", () => {
    expect(MIN_STAFF_PASSWORD_LENGTH).toBe(8);
    expect(staffPasswordTooShortCopy("en")).toBe("Password must be at least 8 characters");
  });

  it("treats an empty field as 'generate one' rather than a short password", () => {
    expect(staffPasswordTooShort("")).toBe(false);
    expect(staffPasswordTooShort("   ")).toBe(false);
  });

  it("refuses a supplied password below the floor", () => {
    expect(staffPasswordTooShort("sevensv")).toBe(true);
    expect(staffPasswordTooShort("x")).toBe(true);
  });

  it("trims exactly like the Edge functions before measuring", () => {
    // The setters store body.password.trim(), so "  sevensv  " becomes seven
    // characters on the server. The screen must not call that acceptable.
    expect(staffPasswordTooShort("  sevensv  ")).toBe(true);
    expect(staffPasswordTooShort("eightchr")).toBe(false);
    expect(staffPasswordTooShort("  eightchr  ")).toBe(false);
  });

  it("names the floor in both languages", () => {
    expect(staffPasswordTooShortCopy("ar")).toBe("كلمة المرور يجب ألا تقل عن 8 أحرف");
    expect(staffPasswordMinimumCopy("en")).toBe("At least 8 characters.");
    expect(staffPasswordMinimumCopy("ar")).toBe("8 أحرف على الأقل.");
  });
});

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function loadFunction(name: string) {
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8").replace(/^import .*;\r?\n/gm, "");
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;
}

const denoRuntime = (assign: (handler: (request: Request) => Promise<Response>) => void) => ({
  env: {
    get: (key: string) =>
      key === "SUPABASE_ANON_KEY" ? "anon" : key === "SUPABASE_SERVICE_ROLE_KEY" ? "service" : "https://local.test",
  },
  serve: (handler: (request: Request) => Promise<Response>) => assign(handler),
});

const ownerRoles = async () => ({ roles: ["system_owner"], error: null });
const isAdministrator = (roles: string[]) => roles.includes("system_owner") || roles.includes("admin");

function bootCreate(createUser: ReturnType<typeof vi.fn>) {
  let handler!: (request: Request) => Promise<Response>;
  const upserts: string[] = [];
  const service = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        ilike: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
      upsert: async () => {
        upserts.push(table);
        return { error: null };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    auth: { admin: { createUser, deleteUser: vi.fn(async () => ({ error: null })) } },
  };
  const user = { auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) } };
  new Function(
    "Deno",
    "createClient",
    "requireActiveSession",
    "allocateEmployeeId",
    "readUserRoles",
    "isAdministrator",
    loadFunction("admin-create-user"),
  )(
    denoRuntime((value) => { handler = value; }),
    (_url: string, key: string) => (key === "anon" ? user : service),
    async () => null,
    vi.fn(),
    ownerRoles,
    isAdministrator,
  );
  return async (body: Record<string, unknown>) => {
    const response = await handler(
      new Request("https://local.test", {
        method: "POST",
        headers: { Authorization: "Bearer test-only" },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: await response.json(), createUser, upserts };
  };
}

function bootReset(updateUserById: ReturnType<typeof vi.fn>) {
  let handler!: (request: Request) => Promise<Response>;
  const service = {
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { email: "target@example.invalid" } }, error: null }),
        updateUserById,
      },
    },
  };
  const user = { auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) } };
  new Function(
    "Deno",
    "createClient",
    "corsPreflight",
    "jsonResponse",
    "requireActiveSession",
    "readUserRoles",
    "isAdministrator",
    loadFunction("admin-reset-password"),
  )(
    denoRuntime((value) => { handler = value; }),
    (_url: string, key: string) => (key === "anon" ? user : service),
    () => new Response("ok"),
    jsonResponse,
    async () => null,
    ownerRoles,
    isAdministrator,
  );
  return async (body: Record<string, unknown>) => {
    const response = await handler(
      new Request("https://local.test", {
        method: "POST",
        headers: { Authorization: "Bearer test-only" },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: await response.json(), updateUserById };
  };
}

const createBody = (extra: Record<string, unknown> = {}) => ({
  email: "new@example.invalid",
  role: "admin",
  ...extra,
});

describe("the admin Edge functions enforce the same floor", () => {
  it("create: refuses a seven-character password instead of silently generating one", async () => {
    const createUser = vi.fn();
    const result = await bootCreate(createUser)(createBody({ password: "sevensv" }));
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Password must be at least 8 characters" });
    expect(createUser).not.toHaveBeenCalled();
    expect(result.upserts).toEqual([]);
  });

  it("create: passes an eight-character password through to Auth", async () => {
    const createUser = vi.fn(async () => ({ data: { user: null }, error: { code: "TEST_STOP", message: "stop" } }));
    await bootCreate(createUser)(createBody({ password: "eightchr" }));
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ password: "eightchr", email_confirm: true }));
  });

  it("create: an absent or blank password is still generated, never rejected", async () => {
    for (const extra of [{}, { password: "   " }]) {
      const createUser = vi.fn(async (_options: { password: string }) => ({ data: { user: null }, error: { code: "TEST_STOP", message: "stop" } }));
      await bootCreate(createUser)(createBody(extra));
      expect(createUser.mock.calls[0][0].password).toHaveLength(32);
    }
  });

  it("reset: refuses a seven-character password instead of silently generating one", async () => {
    const updateUserById = vi.fn();
    const result = await bootReset(updateUserById)({ user_id: "target", password: "sevensv" });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Password must be at least 8 characters" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("reset: passes an eight-character password through and reports it as supplied", async () => {
    const updateUserById = vi.fn(async () => ({ error: null }));
    const result = await bootReset(updateUserById)({ user_id: "target", password: "eightchr" });
    expect(updateUserById).toHaveBeenCalledWith("target", { password: "eightchr", email_confirm: true });
    expect(result.body).toMatchObject({ password: "eightchr", password_was_generated: false });
  });

  it("reset: an absent password is still generated, and is flagged as generated", async () => {
    const updateUserById = vi.fn(async (_id: string, _patch: { password: string }) => ({ error: null }));
    const result = await bootReset(updateUserById)({ user_id: "target" });
    expect(updateUserById.mock.calls[0][1].password).toHaveLength(32);
    expect(result.body).toMatchObject({ password_was_generated: true });
  });
});

describe("the floor cannot drift between the screens and the functions", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("declares the same number on both sides", () => {
    for (const name of ["admin-create-user", "admin-reset-password"]) {
      expect(read(`supabase/functions/${name}/index.ts`)).toContain(
        "const MIN_STAFF_PASSWORD_LENGTH = 8;",
      );
    }
    expect(MIN_STAFF_PASSWORD_LENGTH).toBe(8);
  });

  it("asks the shared rule before every staff password write", () => {
    const userManagement = read("src/pages/settings/UserManagement.tsx");
    expect(userManagement).toContain("staffPasswordTooShort(cPassword)");
    expect(userManagement).toContain("staffPasswordTooShort(rPassword)");
    expect(userManagement.match(/minLength=\{MIN_STAFF_PASSWORD_LENGTH\}/g)).toHaveLength(2);
    expect(read("src/pages/hr/Staff.tsx")).toContain("staffPasswordTooShort(newUser.password)");
    expect(read("src/pages/hr/Staff.tsx")).toContain("minLength={MIN_STAFF_PASSWORD_LENGTH}");
  });

  it("leaves the sign-in pre-check at six so older accounts can still sign in", () => {
    // Raising this alongside the setters would lock out every account whose
    // password was created under the old policy. It is a cheap length probe
    // before GoTrue, not the creation policy.
    expect(read("supabase/functions/login-by-identifier/index.ts")).toContain("password.length < 6");
  });

  it("retires the old six-character copy from the staff dialogs", () => {
    for (const path of ["src/pages/settings/UserManagement.tsx", "src/pages/hr/Staff.tsx"]) {
      expect(read(path)).not.toMatch(/at least 6|Minimum 6|6 أحرف/);
    }
  });
});
