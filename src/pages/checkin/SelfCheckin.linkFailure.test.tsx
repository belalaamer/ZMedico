import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lang: "en",
  rpc: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: api.rpc } }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: api.lang, setLang: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: api.toastSuccess } }));

import SelfCheckin from "./SelfCheckin";

const token = "a".repeat(64);
const rejectedRow = {
  valid: false,
  status: null,
  tenant_name_en: null,
  tenant_name_ar: null,
  branch_name_en: null,
  branch_name_ar: null,
  scheduled_at: null,
  procedure_name: null,
  expires_at: null,
};
const readyRow = {
  valid: true,
  status: "confirmed",
  tenant_name_en: "Lunara Clinic",
  tenant_name_ar: "عيادة لونارا",
  branch_name_en: "Nasr City",
  branch_name_ar: "مدينة نصر",
  scheduled_at: "2026-10-26T10:00:00.000Z",
  procedure_name: null,
  expires_at: "2026-10-26T13:00:00.000Z",
};

function openAt(search: string, lang = "en") {
  api.lang = lang;
  window.history.pushState({}, "", `/check-in${search}`);
  return render(<SelfCheckin />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.lang = "en";
  api.rpc.mockResolvedValue({ data: [rejectedRow], error: null });
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

describe("self check-in link failures", () => {
  it("says the link is incomplete when no token arrived, without asking the clinic", async () => {
    openAt("");
    expect(await screen.findByText("This check-in link is incomplete")).toBeInTheDocument();
    expect(screen.getByText(/did not find a check-in code/i)).toBeInTheDocument();
    expect(screen.queryByText("This check-in link is no longer accepted")).not.toBeInTheDocument();
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("treats a malformed token as an incomplete link rather than an expired one", async () => {
    openAt("?token=not-a-real-token");
    expect(await screen.findByText("This check-in link is incomplete")).toBeInTheDocument();
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("says the clinic no longer accepts the link when a real token returns nothing", async () => {
    openAt(`?token=${token.toUpperCase()}`);
    expect(await screen.findByText("This check-in link is no longer accepted")).toBeInTheDocument();
    expect(api.rpc).toHaveBeenCalledWith("public_self_checkin_details", { p_token: token });
    expect(screen.queryByText("This check-in link is incomplete")).not.toBeInTheDocument();
  });

  it("does not name expiry as the cause, because the reply cannot tell them apart", async () => {
    openAt(`?token=${token}`);
    const card = (await screen.findByText("This check-in link is no longer accepted")).closest("div");
    expect(card?.getAttribute("role")).toBe("alert");
    const body = card?.textContent ?? "";
    expect(body).toContain("may have expired");
    expect(body).toContain("may not be open yet");
    expect(body).toContain("front desk");
  });

  it("keeps the two cards distinct in Arabic", async () => {
    openAt("", "ar");
    expect(await screen.findByText("رابط تسجيل الوصول غير مكتمل")).toBeInTheDocument();
    expect(screen.queryByText("رابط تسجيل الوصول لم يعد مقبولًا")).not.toBeInTheDocument();
  });

  it("shows the clinic's Arabic name when the reply carries one", async () => {
    api.rpc.mockResolvedValue({ data: [readyRow], error: null });
    openAt(`?token=${token}`, "ar");
    expect(await screen.findByText("عيادة لونارا")).toBeInTheDocument();
    expect(screen.queryByText("Lunara Clinic")).not.toBeInTheDocument();
  });

  it("still separates a transport failure from a rejected link", async () => {
    api.rpc.mockResolvedValue({ data: null, error: { message: "Service Unavailable" } });
    openAt(`?token=${token}`);
    expect(await screen.findByText("We could not load this link")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("This check-in link is no longer accepted")).not.toBeInTheDocument();
  });

  it("offers the check-in control only for a live appointment", async () => {
    api.rpc.mockResolvedValue({ data: [readyRow], error: null });
    openAt(`?token=${token}`);
    expect(await screen.findByRole("button", { name: "Check in now" })).toBeEnabled();
    await waitFor(() => expect(api.rpc).toHaveBeenCalledWith("public_self_checkin_details", { p_token: token }));
  });
});
