import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getSession: vi.fn(), update: vi.fn(), signOut: vi.fn(), nav: vi.fn(), error: vi.fn(), success: vi.fn(), unsubscribe: vi.fn(), event: null as null | ((event: string, session: unknown) => void), search: "" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  getSession: api.getSession, updateUser: api.update, signOut: api.signOut,
  onAuthStateChange: (callback: typeof api.event) => { api.event = callback; return { data: { subscription: { unsubscribe: api.unsubscribe } } }; },
} } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => api.nav, useLocation: () => ({ search: api.search }) }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: api.success } }));
vi.mock("@/lib/observability/reportError", () => ({ reportClientError: vi.fn() }));
import ResetPassword from "./ResetPassword";
const session = { user: { id: "synthetic-a" } };
beforeEach(() => { vi.clearAllMocks(); api.event = null; api.search = ""; api.getSession.mockResolvedValue({ data: { session }, error: null }); api.update.mockResolvedValue({ data: { user: session.user }, error: null }); api.signOut.mockResolvedValue({ error: null }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function form() {
  render(<ResetPassword />);
  const password = await screen.findByLabelText("newPassword");
  fireEvent.change(password, { target: { value: "synthetic-password" } });
  fireEvent.change(screen.getByLabelText("confirmPassword"), { target: { value: "synthetic-password" } });
  return password.closest("form")!;
}
describe("password recovery screen", () => {
  it("refuses a 7-character password with the requirement named", async () => {
    // Every other surface that writes a ZMedico password requires 8. Accepting 6
    // here produced accounts the portal itself would refuse to sign in to.
    render(<ResetPassword />);
    const password = await screen.findByLabelText("newPassword");
    fireEvent.change(password, { target: { value: "sevensv" } });
    fireEvent.change(screen.getByLabelText("confirmPassword"), { target: { value: "sevensv" } });
    fireEvent.submit(password.closest("form")!);
    await waitFor(() => expect(api.error).toHaveBeenCalledWith("Password must be at least 8 characters"));
    expect(api.update).not.toHaveBeenCalled();
    expect(screen.getByText("At least 8 characters.")).toBeInTheDocument();
  });

  it("finishes verification with a useful invalid-link state when no session exists", async () => {
    api.getSession.mockResolvedValue({ data: { session: null }, error: null }); render(<ResetPassword />);
    expect(await screen.findByRole("alert")).toHaveTextContent("expired");
    expect(screen.queryByLabelText("newPassword")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "backToSignIn" })).toBeInTheDocument();
  });
  it("does not reveal provider diagnostics when the update is rejected", async () => {
    api.update.mockResolvedValue({ data: { user: null }, error: { message: "private diagnostic detail" } });
    fireEvent.submit(await form()); await waitFor(() => expect(api.error).toHaveBeenCalled());
    expect(api.error.mock.calls.flat().join(" ")).not.toContain("private diagnostic");
    expect(api.signOut).not.toHaveBeenCalled(); expect(api.nav).not.toHaveBeenCalled();
  });
  it("keeps the operation locked until signout completes", async () => {
    let finish!: (value: unknown) => void; api.signOut.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit(await form()); await waitFor(() => expect(api.signOut).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "resetPassword" })).toBeDisabled();
    expect(api.nav).not.toHaveBeenCalled();
    await act(async () => { finish({ error: null }); });
    expect(api.nav).toHaveBeenCalledWith("/auth", { replace: true });
  });
  it("suppresses two synchronous submissions", async () => {
    let finish!: (value: unknown) => void; api.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const element = await form(); fireEvent.submit(element); fireEvent.submit(element);
    expect(api.update).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ data: { user: session.user }, error: null }); });
  });
  it("hides the password form after signout", async () => {
    await form(); act(() => api.event?.("SIGNED_OUT", null));
    expect(screen.queryByLabelText("newPassword")).not.toBeInTheDocument();
  });
  it("ignores an old bootstrap session after a newer signout event", async () => {
    let finish!: (value: unknown) => void; api.getSession.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<ResetPassword />); act(() => api.event?.("SIGNED_OUT", null));
    await act(async () => { finish({ data: { session }, error: null }); });
    expect(screen.queryByLabelText("newPassword")).not.toBeInTheDocument();
  });
  it("does not sign out a different account when an earlier password update completes", async () => {
    let finish!: (value: unknown) => void; api.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit(await form()); act(() => api.event?.("SIGNED_IN", { user: { id: "synthetic-b" } }));
    await act(async () => { finish({ data: { user: session.user }, error: null }); });
    expect(api.signOut).not.toHaveBeenCalled(); expect(api.nav).not.toHaveBeenCalled(); expect(api.success).not.toHaveBeenCalled();
  });
  it("does not navigate as if logout succeeded when logout returns an error", async () => {
    api.signOut.mockResolvedValue({ error: { message: "private logout detail" } });
    fireEvent.submit(await form()); await waitFor(() => expect(api.signOut).toHaveBeenCalledTimes(1));
    expect(api.nav).not.toHaveBeenCalled();
    expect(api.error).toHaveBeenCalled(); expect(api.error.mock.calls.flat().join(" ")).not.toContain("private logout");
  });
  it("retries only signout, not the already confirmed password update", async () => {
    api.signOut.mockResolvedValueOnce({ error: { message: "blocked" } }).mockResolvedValueOnce({ error: null });
    fireEvent.submit(await form());
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(api.nav).toHaveBeenCalledWith("/auth", { replace: true }));
    expect(api.update).toHaveBeenCalledTimes(1); expect(api.signOut).toHaveBeenCalledTimes(2);
  });
  it("shows a recoverable error when session verification throws", async () => {
    api.getSession.mockRejectedValueOnce(new Error("private session detail")).mockResolvedValueOnce({ data: { session }, error: null });
    render(<ResetPassword />); expect(await screen.findByRole("alert")).toHaveTextContent("Unable to verify");
    fireEvent.click(screen.getByRole("button", { name: "Retry" })); await screen.findByLabelText("newPassword");
    expect(api.getSession).toHaveBeenCalledTimes(2);
  });
  it("does not repeat an unconfirmed password change after a lost response", async () => {
    api.update.mockRejectedValue(new Error("private transport detail")); fireEvent.submit(await form());
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed");
    expect(api.update).toHaveBeenCalledTimes(1); expect(api.signOut).not.toHaveBeenCalled(); expect(api.nav).not.toHaveBeenCalled();
    expect(api.error.mock.calls.flat().join(" ")).not.toContain("private transport");
  });
  it("allows an explicit signout retry after a thrown signout request", async () => {
    api.signOut.mockRejectedValueOnce(new Error("private signout detail")).mockResolvedValueOnce({ error: null });
    fireEvent.submit(await form()); fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(api.nav).toHaveBeenCalled()); expect(api.update).toHaveBeenCalledTimes(1);
  });
  it("ignores completion after account A to B to A", async () => {
    let finish!: (value: unknown) => void; api.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit(await form()); act(() => { api.event?.("SIGNED_IN", { user: { id: "synthetic-b" } }); api.event?.("SIGNED_IN", session); });
    await act(async () => { finish({ data: { user: session.user }, error: null }); });
    expect(api.signOut).not.toHaveBeenCalled(); expect(api.success).not.toHaveBeenCalled();
  });
  it("ignores an update completion after leaving the screen", async () => {
    let finish!: (value: unknown) => void; api.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit(await form()); cleanup();
    await act(async () => { finish({ data: { user: session.user }, error: null }); });
    expect(api.signOut).not.toHaveBeenCalled(); expect(api.nav).not.toHaveBeenCalled(); expect(api.unsubscribe).toHaveBeenCalled();
  });
  it("handles the native SIGNED_OUT event emitted by successful logout", async () => {
    api.signOut.mockImplementation(async () => { api.event?.("SIGNED_OUT", null); return { error: null }; });
    fireEvent.submit(await form()); await waitFor(() => expect(api.nav).toHaveBeenCalledWith("/auth", { replace: true }));
    expect(api.update).toHaveBeenCalledTimes(1);
  });
  it("does not acknowledge an update response identifying a different user", async () => {
    api.update.mockResolvedValue({ data: { user: { id: "synthetic-b" } }, error: null });
    fireEvent.submit(await form()); expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed");
    expect(api.signOut).not.toHaveBeenCalled(); expect(api.success).not.toHaveBeenCalled();
  });
  it("ends pending link verification after the bounded timeout", async () => {
    vi.useFakeTimers(); api.getSession.mockReturnValue(new Promise(() => {})); render(<ResetPassword />);
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to verify");
  });
  it("keeps an unconfirmed update in reconciliation state when the same session refreshes", async () => {
    api.update.mockRejectedValue(new Error("lost response")); fireEvent.submit(await form());
    await screen.findByRole("alert"); act(() => api.event?.("TOKEN_REFRESHED", session));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be confirmed");
    expect(screen.queryByLabelText("newPassword")).not.toBeInTheDocument(); expect(api.update).toHaveBeenCalledTimes(1);
  });
  it("invalidates an earlier update when a new recovery starts for the same user", async () => {
    let finish!: (value: unknown) => void; api.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit(await form()); act(() => api.event?.("PASSWORD_RECOVERY", session));
    await act(async () => { finish({ data: { user: session.user }, error: null }); });
    expect(api.signOut).not.toHaveBeenCalled(); expect(api.nav).not.toHaveBeenCalled(); expect(api.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText("newPassword")).toHaveValue("");
  });
  it("preserves typed fields when the existing session refreshes", async () => {
    await form(); act(() => api.event?.("TOKEN_REFRESHED", session));
    expect(screen.getByLabelText("newPassword")).toHaveValue("synthetic-password");
    expect(screen.getByLabelText("confirmPassword")).toHaveValue("synthetic-password");
  });
  it("does not navigate after a new recovery starts during signout", async () => {
    let finish!: (value: unknown) => void; api.signOut.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit(await form()); await waitFor(() => expect(api.signOut).toHaveBeenCalledTimes(1));
    act(() => api.event?.("PASSWORD_RECOVERY", session));
    await act(async () => { finish({ error: null }); });
    expect(api.nav).not.toHaveBeenCalled(); expect(screen.getByLabelText("newPassword")).toHaveValue("");
  });
  it("allows a new explicit recovery after an unconfirmed update without resending the old one", async () => {
    api.update.mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce({ data: { user: session.user }, error: null });
    fireEvent.submit(await form()); await screen.findByRole("alert"); act(() => api.event?.("PASSWORD_RECOVERY", session));
    expect(api.update).toHaveBeenCalledTimes(1); expect(screen.getByLabelText("newPassword")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("newPassword"), { target: { value: "new-synthetic-password" } });
    fireEvent.change(screen.getByLabelText("confirmPassword"), { target: { value: "new-synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "resetPassword" })); await waitFor(() => expect(api.nav).toHaveBeenCalled());
    expect(api.update).toHaveBeenCalledTimes(2);
  });
  it("preserves an in-flight update when the same session refreshes normally", async () => {
    let finish!: (value: unknown) => void; api.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit(await form()); act(() => api.event?.("TOKEN_REFRESHED", session));
    await act(async () => { finish({ data: { user: session.user }, error: null }); });
    expect(api.signOut).toHaveBeenCalledTimes(1); expect(api.nav).toHaveBeenCalledTimes(1);
  });

  it("returns a patient to the portal login once the password is changed", async () => {
    // The portal's recovery link carries ?from=patient. Before batch 24 every
    // recovery landed on the staff desk, so a patient who finished the flow was
    // standing in front of a sign-in form for a role they do not have.
    api.search = "?from=patient";
    fireEvent.submit(await form());
    await waitFor(() => expect(api.nav).toHaveBeenCalledWith("/patient-portal/login", { replace: true }));
    expect(api.nav).not.toHaveBeenCalledWith("/auth", { replace: true });
  });

  it("sends an invalid portal link back to the portal login", async () => {
    api.search = "?from=patient";
    api.getSession.mockResolvedValue({ data: { session: null }, error: null });
    render(<ResetPassword />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "backToSignIn" }));
    expect(api.nav).toHaveBeenCalledWith("/patient-portal/login");
  });

  it("keeps a link with no origin on the staff desk", async () => {
    // The staff screen sends redirectTo without a `from`; that path is the one
    // already in production, and these three assertions are its receipt here.
    api.search = "";
    fireEvent.submit(await form());
    await waitFor(() => expect(api.nav).toHaveBeenCalledWith("/auth", { replace: true }));
    fireEvent.click(screen.getByRole("button", { name: "backToSignIn" }));
    expect(api.nav).toHaveBeenLastCalledWith("/auth");
  });
});
