import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lang } from "@/lib/i18n";

const api = vi.hoisted(() => ({
  setSession: vi.fn(),
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  replace: vi.fn(),
  report: vi.fn(),
}));

// Which desk this screen speaks is decided per mount: P5's whole subject is that an Arabic
// patient must not be handed English provider text, so a fixed language would hide half of it.
const desk = vi.hoisted(() => ({ lang: "ar" as Lang }));

const session = {
  access_token: "arriving-access",
  refresh_token: "arriving-refresh",
  user: { id: "arriving-user", email: "patient@example.invalid" },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      setSession: api.setSession,
      getSession: api.getSession,
      exchangeCodeForSession: api.exchangeCodeForSession,
      verifyOtp: api.verifyOtp,
    },
  },
}));
// Real dictionary copy, because asserting that `t` echoed a key name would prove nothing about
// what a patient reads.
vi.mock("@/contexts/I18nContext", async () => {
  const { dict } = await vi.importActual<{ dict: Record<Lang, Record<string, string>> }>("@/lib/i18n");
  return { useI18n: () => ({ lang: desk.lang, t: (key: string) => dict[desk.lang][key], setLang: vi.fn() }) };
});
// The redaction chain runs for real and only its sink is faked, so a provider message that
// reached the operator payload would fail here rather than in Production.
vi.mock("@/lib/observability/reportError", () => ({ reportClientError: api.report }));

function Landed() {
  return <p>landed:{useLocation().pathname}</p>;
}

async function mountAt(url: string) {
  const origin = "https://zmedico.com";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, ...new URL(url, origin), origin, replace: api.replace, assign: vi.fn(), href: url },
  });
  const { default: AuthCallback } = await import("./AuthCallback");
  render(
    <MemoryRouter initialEntries={[url.slice(origin.length)]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  desk.lang = "ar";
  api.setSession.mockResolvedValue({ data: { session }, error: null });
  api.getSession.mockResolvedValue({ data: { session }, error: null });
  api.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
  api.verifyOtp.mockResolvedValue({ data: { session: { user: session.user } }, error: null });
});

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("auth callback confirmation handoff", () => {
  it("names the patient invitation when the session arrives without a type", async () => {
    await mountAt("https://zmedico.com/auth/callback?next=/patient-portal#access_token=arriving-access&refresh_token=arriving-refresh");
    expect(api.setSession).toHaveBeenCalledWith({ access_token: "arriving-access", refresh_token: "arriving-refresh" });
    expect(await screen.findByText("تم تأكيد دعوة البوابة. جارٍ فتح صفحة المريض…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "المتابعة الآن" })).toBeInTheDocument();
    await waitFor(() => expect(api.replace).toHaveBeenCalledWith("/patient-portal"), { timeout: 3000 });
  });

  it("names a password reset when the link carries recovery type", async () => {
    await mountAt("https://zmedico.com/auth/callback?next=/reset-password&type=recovery#access_token=arriving-access&refresh_token=arriving-refresh");
    expect(await screen.findByText("تم تأكيد إعادة تعيين كلمة المرور. جارٍ المتابعة…")).toBeInTheDocument();
    await waitFor(() => expect(api.replace).toHaveBeenCalledWith("/reset-password"), { timeout: 3000 });
  });
});

describe("auth callback failure copy (P5)", () => {
  it("does not show the provider's text when the arriving session cannot be applied", async () => {
    api.setSession.mockResolvedValue({ data: { session: null }, error: { message: "Email link is invalid or has expired", code: "otp_expired" } });
    await mountAt("https://zmedico.com/auth/callback?next=/patient-portal#access_token=arriving-access&refresh_token=arriving-refresh");
    expect(await screen.findByText("لم يعمل رابط تسجيل الدخول. ربما انتهت صلاحيته أو استُخدم من قبل. اطلب رابطًا جديدًا من العيادة.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Email link is invalid or has expired");
    expect(api.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(api.report).toHaveBeenCalledWith({
      kind: "error", component: "AuthRecovery", message: "auth.callback-session-restore.rejected:otp_expired",
    }));
  });

  it("renders and logs neither the text that arrived in the link's own query", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await mountAt("https://zmedico.com/auth/callback?error_description=اضغط%20لتفعيل%20حسابك%20هنا");
      expect(await screen.findByText(/^لم يعمل رابط تسجيل الدخول/)).toBeInTheDocument();
      expect(document.body.textContent).not.toContain("اضغط لتفعيل حسابك هنا");
      expect(api.getSession).not.toHaveBeenCalled();
      const logged = [...info.mock.calls, ...warn.mock.calls].map((call) => call.map(String).join(" ")).join("\n");
      expect(logged).not.toContain("اضغط لتفعيل حسابك");
      await waitFor(() => expect(api.report).toHaveBeenCalledWith({
        kind: "error", component: "AuthRecovery", message: "auth.callback-provider-error.rejected:unknown",
      }));
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
  });

  it("says the same words for a refused code exchange without repeating the refusal", async () => {
    api.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: "private code detail", code: "bad_code" } });
    await mountAt("https://zmedico.com/auth/callback?code=arriving-code");
    expect(await screen.findByText(/^لم يعمل رابط تسجيل الدخول/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("private code detail");
    await waitFor(() => expect(api.report).toHaveBeenCalledWith({
      kind: "error", component: "AuthRecovery", message: "auth.callback-code-exchange.rejected:unknown",
    }));
  });

  it("says the link failed when a token-hash invitation is refused", async () => {
    api.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "private token detail" } });
    await mountAt("https://zmedico.com/auth/callback?token_hash=arriving-token&type=invite&next=/patient-portal");
    expect(await screen.findByText(/^لم يعمل رابط تسجيل الدخول/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("private token detail");
    await waitFor(() => expect(api.report).toHaveBeenCalledWith({
      kind: "error", component: "AuthRecovery", message: "auth.callback-token-verify.rejected:unknown",
    }));
  });

  it("offers a retry rather than a new link when the completion call is refused", async () => {
    api.getSession.mockResolvedValue({ data: { session: null }, error: { message: "private completion detail" } });
    await mountAt("https://zmedico.com/auth/callback?next=/patient-portal");
    expect(await screen.findByText("لم يكتمل الاتصال. تحقق من اتصالك بالإنترنت وأعد المحاولة.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("private completion detail");
  });

  it("offers a new link when the provider answered with no session at all", async () => {
    api.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await mountAt("https://zmedico.com/auth/callback?next=/patient-portal");
    expect(await screen.findByText(/^لم يعمل رابط تسجيل الدخول/)).toBeInTheDocument();
    expect(api.report).toHaveBeenCalledWith({
      kind: "error", component: "AuthRecovery", message: "auth.callback-completion.identity-mismatch:unknown",
    });
  });

  it("fails visibly instead of spinning forever when a provider call throws", async () => {
    api.setSession.mockRejectedValue(new Error("private transport detail"));
    await mountAt("https://zmedico.com/auth/callback?next=/patient-portal#access_token=arriving-access&refresh_token=arriving-refresh");
    expect(await screen.findByText("لم يكتمل الاتصال. تحقق من اتصالك بالإنترنت وأعد المحاولة.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("private transport detail");
    expect(screen.queryByText("جارٍ إكمال تسجيل الدخول")).not.toBeInTheDocument();
    await waitFor(() => expect(api.report).toHaveBeenCalledWith({
      kind: "error", component: "AuthRecovery", message: "auth.callback-transport.transport:unknown",
    }));
  });

  it("sends a patient whose invitation failed back to the portal sign-in", async () => {
    api.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await mountAt("https://zmedico.com/auth/callback?next=/patient-portal");
    await screen.findByText(/^لم يعمل رابط تسجيل الدخول/);
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى تسجيل الدخول" }));
    expect(screen.getByText("landed:/patient-portal/login")).toBeInTheDocument();
  });

  it("keeps sending every other failed link to staff sign-in", async () => {
    api.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await mountAt("https://zmedico.com/auth/callback");
    await screen.findByText(/^لم يعمل رابط تسجيل الدخول/);
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى تسجيل الدخول" }));
    expect(screen.getByText("landed:/auth")).toBeInTheDocument();
  });

  it("speaks the English dictionary to an English desk, in the link bucket", async () => {
    desk.lang = "en";
    api.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await mountAt("https://zmedico.com/auth/callback?next=/dashboard");
    expect(await screen.findByText("This sign-in link did not work. It may have expired or already been used — ask your clinic for a new one.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("لم يعمل رابط تسجيل الدخول");
    expect(screen.getByRole("button", { name: "Back to sign in" })).toBeInTheDocument();
  });

  it("keeps the two failure sentences distinct, because the patient's next step differs", async () => {
    const { dict } = await vi.importActual<{ dict: Record<Lang, Record<string, string>> }>("@/lib/i18n");
    expect(dict.ar.callbackLinkFailed).not.toBe(dict.ar.callbackTryAgain);
    expect(dict.en.callbackLinkFailed).not.toBe(dict.en.callbackTryAgain);
    for (const key of ["callbackLinkFailed", "callbackTryAgain", "invalidSignInFields"] as const) {
      expect(dict.ar[key], `${key} still holds its English text`).not.toBe(dict.en[key]);
    }
  });
});
