import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ password: vi.fn(), invoke: vi.fn(), session: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signInWithPassword: api.password, setSession: api.session }, functions: { invoke: api.invoke } } }));
import { signInWithIdentifier, identifierLoginErrorText } from "./signInWithIdentifier";
beforeEach(() => vi.resetAllMocks());
const httpErrorBody = (status: number, error: string) => ({
  name: "FunctionsHttpError",
  message: "Edge Function returned a non-2xx status code",
  context: { status, json: async () => ({ error }) },
});
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
  it("names a lockout and an outage instead of blaming the credentials", async () => {
    api.invoke.mockResolvedValue({ data: null, error: httpErrorBody(429, "Too many attempts. Try again later.") });
    const limited = await signInWithIdentifier("username", "synthetic-password");
    expect(limited.error?.code).toBe("identifier_login_rate_limited");
    expect(identifierLoginErrorText(limited.error, "en")).toContain("Too many sign-in attempts");
    expect(identifierLoginErrorText(limited.error, "ar")).toContain("انتظر");

    api.invoke.mockResolvedValue({ data: null, error: httpErrorBody(503, "Authentication service temporarily unavailable") });
    const down = await signInWithIdentifier("username", "synthetic-password");
    expect(down.error?.code).toBe("identifier_login_unavailable");
    expect(identifierLoginErrorText(down.error, "ar")).toContain("غير متاحة");

    expect(api.invoke).toHaveBeenCalledTimes(2);
    expect(api.session).not.toHaveBeenCalled();
  });
  it("keeps the caller's own copy for an unclassified failure", async () => {
    api.invoke.mockResolvedValue({ data: null, error: httpErrorBody(401, "Invalid credentials") });
    const result = await signInWithIdentifier("username", "synthetic-password");
    expect(result.error?.code).toBe("identifier_login_failed");
    expect(result.error?.message).toBe("Invalid credentials");
    expect(identifierLoginErrorText(result.error, "ar", "بيانات الدخول غير صحيحة")).toBe("بيانات الدخول غير صحيحة");
  });
  it("installs valid identifier tokens once", async () => {
    api.invoke.mockResolvedValue({ data: { access_token: "test-access", refresh_token: "test-refresh" }, error: null });
    const result = { data: { user: { id: "test-user" }, session: { user: { id: "test-user" } } }, error: null };
    api.session.mockResolvedValue(result);
    expect(await signInWithIdentifier(" username ", "synthetic-password")).toEqual(result);
    expect(api.session).toHaveBeenCalledExactlyOnceWith({ access_token: "test-access", refresh_token: "test-refresh" });
  });
});
