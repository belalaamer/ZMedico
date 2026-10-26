import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: "actor-one" as string | null,
  canonicalEnabled: true,
  userRoles: vi.fn(),
  rolePermissions: vi.fn(),
  canonical: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.actor ? { id: mocks.actor } : null }),
}));
vi.mock("@/lib/authz/useAuthzState", () => ({ useAuthzState: () => ({ fingerprint: null }) }));
vi.mock("@/lib/authz/canonicalFlag", () => ({ isCanonicalAuthzEnabled: () => mocks.canonicalEnabled }));
vi.mock("@/lib/authz/canonicalPermissions", () => ({
  fetchCanonicalPermissions: (id: string) => mocks.canonical(id),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "staff_profiles_self") {
        return { select: () => ({ neq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { status: "active" }, error: null }) }) }) }) };
      }
      if (table === "user_roles") return { select: () => ({ eq: () => mocks.userRoles() }) };
      if (table === "role_permissions") return { select: () => ({ in: () => mocks.rolePermissions() }) };
      throw new Error(`unexpected table read: ${table}`);
    },
  },
}));

import { usePermissions } from "./usePermissions";

let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

function authDebugLogs() {
  return [...info.mock.calls, ...warn.mock.calls]
    .map((call) => call.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" "))
    .filter((line) => line.includes("[auth-debug]"));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEV", false);
  mocks.actor = "actor-one";
  mocks.canonicalEnabled = true;
  mocks.userRoles.mockResolvedValue({ data: [{ role: "receptionist" }], error: null });
  mocks.rolePermissions.mockResolvedValue({ data: [{ role: "receptionist", module: "appointments", actions: ["view"] }], error: null });
  mocks.canonical.mockResolvedValue({ appointments: new Set(["view"]) });
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  cleanup();
});

describe("auth bootstrap logging is a development tool only", () => {
  it("stays silent on the canonical grant path in a production build, and still grants", async () => {
    const { result } = renderHook(usePermissions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.can("appointments")).toBe(true);
    expect(authDebugLogs()).toEqual([]);
  });

  it("stays silent when canonical permissions are denied, and access remains denied", async () => {
    mocks.canonical.mockRejectedValue({ code: "42501", message: "private" });
    const { result } = renderHook(usePermissions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.can("appointments")).toBe(false);
    expect(authDebugLogs()).toEqual([]);
  });

  it("stays silent on the legacy catalog path, and still grants from its rows", async () => {
    mocks.canonicalEnabled = false;
    const { result } = renderHook(usePermissions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.can("appointments")).toBe(true);
    expect(authDebugLogs()).toEqual([]);
  });

  it("stays silent when the legacy catalog throws and defaults take over", async () => {
    mocks.canonicalEnabled = false;
    mocks.rolePermissions.mockRejectedValue(new Error("transport closed"));
    const { result } = renderHook(usePermissions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.can("appointments")).toBe(true);
    expect(authDebugLogs()).toEqual([]);
  });

  it("stays silent when the role lookup reports an error", async () => {
    mocks.canonicalEnabled = false;
    mocks.userRoles.mockResolvedValue({ data: null, error: { message: "row-level security", code: "42501" } });
    const { result } = renderHook(usePermissions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.can("appointments")).toBe(false);
    expect(authDebugLogs()).toEqual([]);
  });

  it("stays silent when the role lookup throws", async () => {
    mocks.userRoles.mockRejectedValue(new Error("aborted"));
    const { result } = renderHook(usePermissions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(authDebugLogs()).toEqual([]);
  });

  it("keeps the same diagnostics available in development", async () => {
    vi.stubEnv("DEV", true);
    const { result } = renderHook(usePermissions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    const lines = authDebugLogs().join("\n");
    expect(lines).toContain("user_roles fetch completed");
    expect(lines).toContain("canonical permissions loaded");
    expect(result.current.can("appointments")).toBe(true);
  });

  it("keeps the failure diagnostics in development too", async () => {
    vi.stubEnv("DEV", true);
    mocks.userRoles.mockResolvedValue({ data: null, error: { message: "row-level security", code: "42501" } });
    const { result } = renderHook(usePermissions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(authDebugLogs().join("\n")).toContain("user_roles fetch error");
  });
});
