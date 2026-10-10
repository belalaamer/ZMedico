import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createShadowProbe } from "./createShadowProbe";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), can: vi.fn(() => false) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "qa-user" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: mocks.can, loading: false }) }));
vi.mock("@/lib/authz/useAuthorization", () => ({ useAuthorization: () => ({ authz: {}, loading: false }) }));

describe("shadow recording failures remain isolated from permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  function mount(record: () => unknown, resolve?: () => unknown) {
    mocks.rpc.mockImplementation((name: string) => name === "authz_has_permissions"
      ? resolve ? resolve() : Promise.resolve({ data: [{ permission_key: "settings.org.update", allowed: true }], error: null })
      : record());
    const probe = createShadowProbe({ slice: "settings", probeName: "QA", keyLegacyMap: {
      "settings.org.update": { module: "settings", action: "edit" },
    } });
    return renderHook(() => probe.useProbe("/settings"));
  }

  it("reports a resolved database error without logging its message", async () => {
    mount(() => Promise.resolve({ error: { code: "42501", message: "private fixture detail" } }));
    await waitFor(() => expect(console.debug).toHaveBeenCalledWith("[shadow:settings] record failed", {
      key: "settings.org.update", code: "42501",
    }));
    expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain("private fixture detail");
    expect(mocks.can).toHaveReturnedWith(false);
  });

  it("does not write guessed decisions when the batch resolver fails", async () => {
    const record = vi.fn();
    mount(record, () => Promise.resolve({ data: null, error: {
      code: "42501", message: "private fixture detail", details: "private diagnostic context",
    } }));
    await waitFor(() => expect(console.debug).toHaveBeenCalledWith("[shadow:settings] batch resolver failed", { code: "42501" }));
    expect(record).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain("private");
  });

  it("does not expose arbitrary strings disguised as error codes", async () => {
    mount(() => Promise.resolve({ error: { code: "private fixture detail" } }));
    await waitFor(() => expect(console.debug).toHaveBeenCalledWith("[shadow:settings] record failed", {
      key: "settings.org.update", code: "TRANSPORT_ERROR",
    }));
  });

  it.each(["rejected", "synchronous"])("contains a %s transport failure", async kind => {
    mount(() => {
      if (kind === "synchronous") throw new Error("private fixture detail");
      return Promise.reject(new Error("private fixture detail"));
    });
    await waitFor(() => expect(console.debug).toHaveBeenCalledWith("[shadow:settings] record failed", {
      key: "settings.org.update", code: "TRANSPORT_ERROR",
    }));
    expect(mocks.can).toHaveReturnedWith(false);
  });

  it("does not report an error on successful recording or duplicate on rerender", async () => {
    const hook = mount(() => Promise.resolve({ error: null }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    hook.rerender();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(console.debug).not.toHaveBeenCalled();
  });
});
