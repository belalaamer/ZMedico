import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ reset: vi.fn(), signIn: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { resetPasswordForEmail: api.reset } } }));
vi.mock("@/lib/signInWithIdentifier", () => ({ signInWithIdentifier: api.signIn }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", t: (key: string) => key, setLang: vi.fn() }) }));
vi.mock("@/contexts/TenantBrandingContext", () => ({ useTenantBranding: () => ({ branding: null, isBrandedTenantHost: false }) }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: api.success } }));
vi.mock("@/lib/observability/reportError", () => ({ reportClientError: vi.fn() }));
import AuthPage from "./Auth";
beforeEach(() => { vi.clearAllMocks(); api.reset.mockResolvedValue({ error: null }); api.signIn.mockResolvedValue({ data: { user: null, session: null }, error: { message: "Synthetic login denied" } }); });
afterEach(cleanup);
async function openForm() {
  render(<MemoryRouter initialEntries={["/auth"]}><AuthPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Email or username"), { target: { value: "synthetic@example.invalid" } });
  fireEvent.change(screen.getByLabelText("password"), { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "forgotPassword" }));
  const email = await screen.findByLabelText("email");
  fireEvent.change(email, { target: { value: "recipient@example.invalid" } });
  return email.closest("form")!;
}
describe("staff reset request dialog", () => {
  it("does not submit the parent sign-in form through portal event bubbling", async () => {
    fireEvent.submit(await openForm()); await waitFor(() => expect(api.reset).toHaveBeenCalledTimes(1));
    expect(api.signIn).not.toHaveBeenCalled();
  });
  it("suppresses a second pending reset request", async () => {
    let finish!: (value: unknown) => void; api.reset.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const element = await openForm(); fireEvent.submit(element); fireEvent.submit(element); expect(api.reset).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ error: null }); });
  });
  it("keeps pending requests open rather than allowing dialog replacement", async () => {
    let finish!: (value: unknown) => void; api.reset.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit(await openForm());
    expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => { finish({ error: null }); });
  });
  it("uses a safe failure message and leaves the dialog available for retry", async () => {
    api.reset.mockResolvedValue({ error: { message: "private reset provider detail" } });
    fireEvent.submit(await openForm()); await waitFor(() => expect(api.error).toHaveBeenCalled());
    expect(api.error.mock.calls.flat().join(" ")).not.toContain("private reset");
    expect(screen.getByRole("button", { name: "sendResetLink" })).toBeEnabled(); expect(api.success).not.toHaveBeenCalled();
  });
  it("recovers from a thrown request without automatically sending again", async () => {
    api.reset.mockRejectedValueOnce(new Error("private reset transport")).mockResolvedValueOnce({ error: null });
    const element = await openForm(); fireEvent.submit(element);
    await waitFor(() => expect(api.error).toHaveBeenCalledWith(expect.stringContaining("Check your inbox")));
    expect(api.reset).toHaveBeenCalledTimes(1); expect(api.success).not.toHaveBeenCalled();
    fireEvent.submit(element); await waitFor(() => expect(api.success).toHaveBeenCalled());
    expect(api.reset).toHaveBeenCalledTimes(2); expect(api.signIn).not.toHaveBeenCalled();
  });
  it("ignores the result after leaving the sign-in page", async () => {
    let finish!: (value: unknown) => void; api.reset.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit(await openForm()); cleanup(); await act(async () => { finish({ error: null }); });
    expect(api.success).not.toHaveBeenCalled(); expect(api.error).not.toHaveBeenCalled();
  });
  it("validates and normalizes the submitted reset email", async () => {
    const element = await openForm(); const email = screen.getByLabelText("email");
    fireEvent.change(email, { target: { value: "invalid@" } }); fireEvent.submit(element);
    expect(api.reset).not.toHaveBeenCalled();
    fireEvent.change(email, { target: { value: " Recipient@Example.invalid " } }); fireEvent.submit(element);
    await waitFor(() => expect(api.reset).toHaveBeenCalledWith("recipient@example.invalid", { redirectTo: `${window.location.origin}/reset-password` }));
    expect(api.signIn).not.toHaveBeenCalled();
  });
  it("cannot start a sign-in request while a recovery request is pending", async () => {
    let finish!: (value: unknown) => void; api.reset.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit(await openForm());
    fireEvent.submit(document.getElementById("identifier")!.closest("form")!);
    expect(api.signIn).not.toHaveBeenCalled();
    await act(async () => { finish({ error: null }); });
  });
});
