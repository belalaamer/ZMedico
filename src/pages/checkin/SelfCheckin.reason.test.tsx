import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lang: "en",
  rpc: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: api.rpc } }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: api.lang, setLang: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: api.toastSuccess } }));

import { selfCheckinUnavailableReason } from "@/lib/selfCheckin";
import SelfCheckin from "./SelfCheckin";

const token = "b".repeat(64);

function refused(reason: string | null) {
  return {
    valid: false,
    status: null,
    tenant_name_en: null,
    tenant_name_ar: null,
    branch_name_en: null,
    branch_name_ar: null,
    scheduled_at: null,
    procedure_name: null,
    expires_at: null,
    reason,
  };
}

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
  reason: null,
};

function openAt(search: string, lang = "en") {
  api.lang = lang;
  window.history.pushState({}, "", `/check-in${search}`);
  return render(<SelfCheckin />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.lang = "en";
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

describe("self check-in refusal reasons", () => {
  it("names expiry or replacement when the RPC says the token is invalid", async () => {
    api.rpc.mockResolvedValue({ data: [refused("invalid")], error: null });
    openAt(`?token=${token}`);
    const title = await screen.findByText("This check-in link is no longer accepted");
    expect(title.closest("div")?.getAttribute("role")).toBe("alert");
    expect(screen.getByText(/may have expired or been replaced/i)).toBeInTheDocument();
    expect(screen.queryByText("Check-in is closed")).not.toBeInTheDocument();
    expect(screen.queryByText("Online check-in is unavailable right now")).not.toBeInTheDocument();
  });

  it("says check-in is closed when the appointment window or status refuses it", async () => {
    api.rpc.mockResolvedValue({ data: [refused("closed")], error: null });
    openAt(`?token=${token}`);
    expect(await screen.findByText("Check-in is closed")).toBeInTheDocument();
    expect(screen.getByText(/front desk can check you in/i)).toBeInTheDocument();
    expect(screen.queryByText("This check-in link is no longer accepted")).not.toBeInTheDocument();
  });

  it("reports an unavailable clinic without exposing its plan or status", async () => {
    api.rpc.mockResolvedValue({ data: [refused("clinic_unavailable")], error: null });
    openAt(`?token=${token}`);
    expect(await screen.findByText("Online check-in is unavailable right now")).toBeInTheDocument();
    const alert = screen.getByText("Online check-in is unavailable right now").closest("div");
    const body = alert?.textContent ?? "";
    expect(body).toMatch(/front desk/i);
    expect(body).not.toMatch(/subscription|plan|tenant|inactive|expired/i);
    expect(screen.queryByText("This check-in link is no longer accepted")).not.toBeInTheDocument();
  });

  it("keeps the three refusals distinct in Arabic", async () => {
    api.rpc.mockResolvedValue({ data: [refused("closed")], error: null });
    openAt(`?token=${token}`, "ar");
    expect(await screen.findByText("تسجيل الوصول مغلق")).toBeInTheDocument();
    expect(screen.queryByText("رابط تسجيل الوصول لم يعد مقبولًا")).not.toBeInTheDocument();
    cleanup();
    api.rpc.mockResolvedValue({ data: [refused("clinic_unavailable")], error: null });
    openAt(`?token=${token}`, "ar");
    expect(await screen.findByText("تسجيل الوصول الإلكتروني غير متاح حاليًا")).toBeInTheDocument();
    expect(screen.queryByText("تسجيل الوصول مغلق")).not.toBeInTheDocument();
  });

  it("degrades to the old rejected card when the RPC predates the reason column", async () => {
    api.rpc.mockResolvedValue({ data: [{ ...refused(null), reason: undefined }], error: null });
    openAt(`?token=${token}`);
    expect(await screen.findByText("This check-in link is no longer accepted")).toBeInTheDocument();
    expect(screen.queryByText("Check-in is closed")).not.toBeInTheDocument();
  });

  it("does not read an unrecognized reason as a closed window", async () => {
    api.rpc.mockResolvedValue({ data: [refused("something_new")], error: null });
    openAt(`?token=${token}`);
    expect(await screen.findByText("This check-in link is no longer accepted")).toBeInTheDocument();
    expect(screen.queryByText("Check-in is closed")).not.toBeInTheDocument();
  });

  it("leaves a live appointment untouched by the reason column", async () => {
    api.rpc.mockResolvedValue({ data: [readyRow], error: null });
    openAt(`?token=${token}`);
    expect(await screen.findByRole("button", { name: "Check in now" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("selfCheckinUnavailableReason", () => {
  it("returns nothing for a live appointment", () => {
    expect(selfCheckinUnavailableReason(readyRow)).toBeNull();
  });

  it("mirrors the two named refusals", () => {
    expect(selfCheckinUnavailableReason(refused("closed"))).toBe("closed");
    expect(selfCheckinUnavailableReason(refused("clinic_unavailable"))).toBe("clinic_unavailable");
  });

  it("falls back to invalid for a missing, empty or unknown reason", () => {
    expect(selfCheckinUnavailableReason(null)).toBe("invalid");
    expect(selfCheckinUnavailableReason({})).toBe("invalid");
    expect(selfCheckinUnavailableReason(refused(null))).toBe("invalid");
    expect(selfCheckinUnavailableReason(refused("something_new"))).toBe("invalid");
  });
});
