import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  setSession: vi.fn(),
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  replace: vi.fn(),
}));

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
    },
  },
}));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "ar", t: (key: string) => key, setLang: vi.fn() }) }));

async function mountAt(url: string) {
  const origin = "https://zmedico.com";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, ...new URL(url, origin), origin, replace: api.replace, assign: vi.fn(), href: url },
  });
  const { default: AuthCallback } = await import("./AuthCallback");
  render(
    <MemoryRouter initialEntries={[url.slice(origin.length)]}>
      <AuthCallback />
    </MemoryRouter>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.setSession.mockResolvedValue({ data: { session }, error: null });
  api.getSession.mockResolvedValue({ data: { session }, error: null });
  api.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
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

  it("does not hand off when the arriving session cannot be applied", async () => {
    api.setSession.mockResolvedValue({ data: { session: null }, error: { message: "Email link is invalid or has expired" } });
    await mountAt("https://zmedico.com/auth/callback?next=/patient-portal#access_token=arriving-access&refresh_token=arriving-refresh");
    expect(await screen.findByText("Email link is invalid or has expired")).toBeInTheDocument();
    expect(api.replace).not.toHaveBeenCalled();
  });
});
