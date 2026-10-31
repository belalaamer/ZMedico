import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  InactiveSessionError,
  activeSessionVerdict,
  requireActiveSession,
  requireActiveSessionOrThrow,
  sessionGuardResponse,
  type SessionRpcClient,
} from "../../supabase/functions/_shared/active-session.ts";

const GUARDED_FUNCTIONS = [
  "admin-create-user",
  "admin-delete-user",
  "admin-export",
  "admin-reset-password",
  "ai-admin-settings",
  "manage-custom-domain",
  "meta-ads-connection",
  "meta-ads-sync",
  "patient-portal-invite",
  "patient-portal-reset-password",
  "send-patient-portal-message",
];

const PRIVILEGE_MARKER = /from\("user_roles"\)|rpc\("has_role"/;
const GUARD_CALL = /await\s+(?:requireActiveSessionOrThrow|requireActiveSession|sessionGuardResponse)\s*\(/;

function source(name: string) {
  return readFileSync(`supabase/functions/${name}/index.ts`, "utf8");
}

function rpcClient(error: unknown): SessionRpcClient {
  return { rpc: async () => ({ error }) };
}

async function jsonOf(response: Response) {
  return (await response.json()) as { error: string };
}

describe("Edge session guard coverage", () => {
  it("guards every staff-facing function before it resolves privileges", () => {
    for (const name of GUARDED_FUNCTIONS) {
      const text = source(name);
      expect(text, name).toMatch(/_shared\/active-session\.ts/);
      const guardIndex = text.search(GUARD_CALL);
      const privilegeIndex = text.search(PRIVILEGE_MARKER);
      expect(guardIndex, `${name} calls the session guard`).toBeGreaterThan(-1);
      expect(privilegeIndex, `${name} resolves a role`).toBeGreaterThan(-1);
      expect(guardIndex, `${name} guards before its role lookup`).toBeLessThan(privilegeIndex);
    }
  });

  it("guards before the service-role client is built in the handler", () => {
    for (const name of GUARDED_FUNCTIONS) {
      // send-patient-portal-message builds its service client inside a sender
      // helper whose definition precedes the handler that authorizes it.
      if (name === "send-patient-portal-message") continue;
      const text = source(name);
      const serviceIndex = text.search(/createClient\([^)]*service/i);
      if (serviceIndex === -1) continue;
      expect(text.search(GUARD_CALL), `${name} guards before service-role access`).toBeLessThan(serviceIndex);
    }
  });
});

describe("requireActiveSession decisions", () => {
  it("accepts only a clean assert_active_session result", async () => {
    expect(await activeSessionVerdict(rpcClient(null))).toBe("active");
    expect(await requireActiveSession(rpcClient(null))).toBeNull();
  });

  it("maps the permission codes to 401", async () => {
    for (const code of ["42501", "PT401", "PGRST301"]) {
      const response = await requireActiveSession(rpcClient({ code }));
      expect(response, code).not.toBeNull();
      expect(response!.status, code).toBe(401);
      expect(await jsonOf(response!), code).toEqual({ error: "Unauthorized" });
    }
  });

  it("fails closed on every other error shape", async () => {
    const failures: unknown[] = [{ code: "42883" }, { message: "schema cache" }, "boom", {}, undefined];
    for (const error of failures) {
      const response = await requireActiveSession(rpcClient(error));
      expect(response, JSON.stringify(error)).not.toBeNull();
      expect(response!.status, JSON.stringify(error)).toBe(503);
      expect(await jsonOf(response!), JSON.stringify(error)).toEqual({ error: "Unable to verify active session" });
    }
  });

  it("fails closed when the RPC call itself throws", async () => {
    const client: SessionRpcClient = {
      rpc: async () => {
        throw new Error("gateway reset");
      },
    };
    expect(await activeSessionVerdict(client)).toBe("unavailable");
    const response = await requireActiveSession(client);
    expect(response!.status).toBe(503);
  });

  it("keeps each function's own headers by rejecting through its serializer", async () => {
    const seen: Array<{ body: unknown; status: number }> = [];
    const response = await sessionGuardResponse(rpcClient({ code: "42501" }), (body, status) => {
      seen.push({ body, status });
      return new Response(JSON.stringify({ native: true }), { status, headers: { "X-Native": "1" } });
    });
    expect(seen).toEqual([{ body: { error: "Unauthorized" }, status: 401 }]);
    expect(response!.headers.get("X-Native")).toBe("1");
    expect(await sessionGuardResponse(rpcClient(null), () => new Response("unused"))).toBeNull();
  });

  it("throws a status-carrying error for functions that signal failure by exception", async () => {
    const cases: Array<{ error: unknown; status: 401 | 503 }> = [
      { error: { code: "42501" }, status: 401 },
      { error: { code: "42883" }, status: 503 },
      { error: undefined, status: 503 },
    ];
    for (const { error, status } of cases) {
      const thrown = await requireActiveSessionOrThrow(rpcClient(error)).then(() => null, (e) => e);
      expect(thrown, String(status)).toBeInstanceOf(InactiveSessionError);
      expect((thrown as InactiveSessionError).status).toBe(status);
      expect((thrown as InactiveSessionError).message).toBe(
        status === 401 ? "Unauthorized" : "Unable to verify active session",
      );
    }
    await expect(requireActiveSessionOrThrow(rpcClient(null))).resolves.toBeUndefined();
  });
});
