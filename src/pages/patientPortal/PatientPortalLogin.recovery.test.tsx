import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Lang } from "@/lib/i18n";

const api = vi.hoisted(() => ({
  reset: vi.fn(), signIn: vi.fn(), nav: vi.fn(), error: vi.fn(), success: vi.fn(), setLang: vi.fn(),
}));
// A holder, not a constant: the desk under test is chosen per case, and the
// strings it is handed come out of the real dictionary rather than an echo of
// the key, so a missing Arabic word fails here instead of printing `create`.
const desk = vi.hoisted(() => ({ lang: "en" as Lang }));

vi.mock("@/contexts/I18nContext", async () => {
  const { dict } = await vi.importActual<{ dict: Record<Lang, Record<string, string>> }>("@/lib/i18n");
  return { useI18n: () => ({ lang: desk.lang, setLang: api.setLang, t: (key: string) => dict[desk.lang][key] }) };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }), resetPasswordForEmail: api.reset } },
}));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useNavigate: () => api.nav,
}));
vi.mock("sonner", () => ({ toast: { error: api.error, success: api.success } }));
vi.mock("@/lib/signInWithIdentifier", () => ({ signInWithIdentifier: api.signIn }));

import { dict } from "@/lib/i18n";
import PatientPortalLogin from "./PatientPortalLogin";

const words = () => dict[desk.lang];

async function openPanel() {
  render(<PatientPortalLogin />);
  fireEvent.click(screen.getByRole("button", { name: words().forgotPassword }));
  const email = await screen.findByLabelText(words().email);
  fireEvent.change(email, { target: { value: " Salma@Example.invalid " } });
  return email.closest("form")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  desk.lang = "en";
  api.reset.mockResolvedValue({ error: null });
  api.signIn.mockResolvedValue({ data: { session: { user: { id: "p" } } }, error: null });
});
afterEach(cleanup);

describe("patient portal recovery request", () => {
  it("offers the panel only after the patient asks for it", () => {
    render(<PatientPortalLogin />);
    expect(screen.queryByRole("button", { name: words().sendResetLink })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: words().forgotPassword }));
    expect(screen.getByRole("button", { name: words().sendResetLink })).toBeEnabled();
    expect(screen.getByRole("button", { name: words().forgotPassword })).toHaveAttribute("aria-expanded", "true");
  });

  it("normalizes the address and points at the portal side of the shared recovery screen", async () => {
    const panel = await openPanel();
    fireEvent.submit(panel);
    await waitFor(() => expect(api.reset).toHaveBeenCalledWith(
      "salma@example.invalid",
      { redirectTo: `${window.location.origin}/reset-password?from=patient` },
    ));
  });

  it("keeps an unusable address off the wire", () => {
    render(<PatientPortalLogin />);
    fireEvent.click(screen.getByRole("button", { name: words().forgotPassword }));
    const email = screen.getByLabelText(words().email);
    fireEvent.change(email, { target: { value: "salma" } });
    fireEvent.submit(email.closest("form")!);
    expect(api.reset).not.toHaveBeenCalled();
    expect(api.success).not.toHaveBeenCalled();
    expect(api.error).toHaveBeenCalledWith(dict.en.invalidRecoveryEmail);
  });

  it("replies to a registered and an unregistered address with the same words", async () => {
    // GoTrue answers identically either way and so must the screen: anything else
    // would let the portal login be used to ask whether an email is a patient.
    const known = await openPanel();
    fireEvent.submit(known);
    await waitFor(() => expect(api.success).toHaveBeenCalledWith(dict.en.resetLinkSent));
    cleanup();
    desk.lang = "ar";
    const unknown = await openPanel();
    fireEvent.submit(unknown);
    await waitFor(() => expect(api.success).toHaveBeenCalledWith(dict.ar.resetLinkSent));
    expect(api.error).not.toHaveBeenCalled();
  });

  it("names the failure without repeating the provider", async () => {
    api.reset.mockResolvedValue({ error: { message: "private recovery provider detail" } });
    const panel = await openPanel();
    fireEvent.submit(panel);
    await waitFor(() => expect(api.error).toHaveBeenCalledWith(dict.en.recoverySendFailed));
    expect(api.error.mock.calls.flat().join(" ")).not.toContain("private recovery");
    expect(api.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: words().sendResetLink })).toBeEnabled();
  });

  it("does not call an unconfirmed request a sent one, and does not resend it", async () => {
    api.reset.mockRejectedValueOnce(new Error("private transport detail"));
    const panel = await openPanel();
    fireEvent.submit(panel);
    await waitFor(() => expect(api.error).toHaveBeenCalledWith(dict.en.recoverySendUncertain));
    expect(api.success).not.toHaveBeenCalled();
    expect(api.reset).toHaveBeenCalledTimes(1);
    // The panel stays where the patient left it, so the next send is their choice.
    // (type="email" has already trimmed the padding the browser is given.)
    expect(screen.getByLabelText(words().email)).toHaveValue("Salma@Example.invalid");
  });

  it("suppresses a second request while the first is pending", async () => {
    let finish!: (value: unknown) => void;
    api.reset.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const panel = await openPanel();
    fireEvent.submit(panel);
    fireEvent.submit(panel);
    expect(api.reset).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ error: null }); });
  });

  it("cannot start a sign-in while a recovery request is pending", async () => {
    let finish!: (value: unknown) => void;
    api.reset.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const panel = await openPanel();
    fireEvent.submit(panel);
    fireEvent.submit(screen.getByRole("button", { name: "Sign in to portal" }).closest("form")!);
    expect(api.signIn).not.toHaveBeenCalled();
    await act(async () => { finish({ error: null }); });
  });

  it("leaves the sign-in form alone when the recovery form submits", async () => {
    // Two forms on one card: the panel is a sibling, so its submit cannot bubble
    // into the credentials form the way the staff dialog's portal content did.
    const panel = await openPanel();
    fireEvent.submit(panel);
    await waitFor(() => expect(api.reset).toHaveBeenCalled());
    expect(api.signIn).not.toHaveBeenCalled();
    expect(panel).not.toBe(screen.getByRole("button", { name: "Sign in to portal" }).closest("form"));
  });

  it("ignores the answer after the patient leaves the page", async () => {
    let finish!: (value: unknown) => void;
    api.reset.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const panel = await openPanel();
    fireEvent.submit(panel);
    cleanup();
    await act(async () => { finish({ error: null }); });
    expect(api.success).not.toHaveBeenCalled();
    expect(api.error).not.toHaveBeenCalled();
  });

  it("speaks Arabic on the Arabic desk, in the dictionary's own words", async () => {
    desk.lang = "ar";
    const panel = await openPanel();
    expect(screen.getByText(dict.ar.recoveryEmailHint)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: dict.ar.sendResetLink })).toBeEnabled();
    fireEvent.submit(panel);
    await waitFor(() => expect(api.success).toHaveBeenCalledWith(dict.ar.resetLinkSent));
    // A `t()` miss is truthy, so an unregistered key would print its own name on
    // the desk rather than fall back; nothing on this card may read like a key.
    expect(document.body.textContent).not.toContain("resetLinkSent");
    expect(document.body.textContent).not.toContain("Forgot password");
    expect(document.body.textContent).not.toContain("sendResetLink");
  });
});
