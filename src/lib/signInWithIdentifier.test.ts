import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ password: vi.fn(), invoke: vi.fn(), session: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signInWithPassword: api.password, setSession: api.session }, functions: { invoke: api.invoke } } }));
import { signInWithIdentifier } from "./signInWithIdentifier";
beforeEach(() => vi.resetAllMocks());
describe("identifier login transport boundaries", () => {
  it.each(["email", "identifier", "session"])("returns an error rather than rejecting when %s transport throws", async (stage) => {
    api.password.mockRejectedValue(new Error("sensitive provider details"));
    api.invoke.mockImplementation(async () => { if (stage === "identifier") throw new Error("sensitive provider details"); return { data: { access_token: "test-access", refresh_token: "test-refresh" }, error: null }; });
    api.session.mockRejectedValue(new Error("sensitive provider details"));
    const result = await signInWithIdentifier(stage === "email" ? "USER@example.invalid" : "username", "synthetic-password");
    expect(result.data.session).toBeNull(); expect(result.error).toBeTruthy();
    expect(result.error?.message).not.toContain("sensitive");
  });
  it("normalizes email and does not call the identifier endpoint", async () => {
    const result = { data: { user: { id: "test-user" }, session: { user: { id: "test-user" } } }, error: null };
    api.password.mockResolvedValue(result);
    expect(await signInWithIdentifier(" USER@example.invalid ", "synthetic-password")).toEqual(result);
    expect(api.password).toHaveBeenCalledWith({ email: "user@example.invalid", password: "synthetic-password" });
    expect(api.invoke).not.toHaveBeenCalled();
  });
  it("does not install missing or non-string endpoint tokens", async () => {
    for (const data of [null, {}, { access_token: {}, refresh_token: "test-refresh" }, { access_token: "test-access", refresh_token: "" }]) {
      api.invoke.mockResolvedValue({ data, error: null });
      const result = await signInWithIdentifier("username", "synthetic-password");
      expect(result.error).toBeTruthy(); expect(result.data.session).toBeNull();
    }
    expect(api.session).not.toHaveBeenCalled();
  });
  it("does not echo endpoint failure details or retry automatically", async () => {
    api.invoke.mockResolvedValue({ data: null, error: new Error("sensitive provider details") });
    const result = await signInWithIdentifier("username", "synthetic-password");
    expect(result.error?.message).not.toContain("sensitive"); expect(api.invoke).toHaveBeenCalledTimes(1);
    expect(api.session).not.toHaveBeenCalled();
  });
  it("installs valid identifier tokens once", async () => {
    api.invoke.mockResolvedValue({ data: { access_token: "test-access", refresh_token: "test-refresh" }, error: null });
    const result = { data: { user: { id: "test-user" }, session: { user: { id: "test-user" } } }, error: null };
    api.session.mockResolvedValue(result);
    expect(await signInWithIdentifier(" username ", "synthetic-password")).toEqual(result);
    expect(api.session).toHaveBeenCalledExactlyOnceWith({ access_token: "test-access", refresh_token: "test-refresh" });
  });
});
