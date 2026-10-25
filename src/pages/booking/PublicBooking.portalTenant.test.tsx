import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PublicBooking from "./PublicBooking";

const state = vi.hoisted(() => ({ portalUser: true as boolean, calls: [] as Array<{ name: string; args?: Record<string, unknown> }> }));

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", setLang: vi.fn() }) }));
vi.mock("@/lib/adAttribution", () => ({ captureAdAttribution: vi.fn(), getStoredAdAttribution: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: state.portalUser ? { id: "u1" } : null } }) },
  rpc: async (name: string, args?: Record<string, unknown>) => {
    state.calls.push({ name, args });
    if (name === "patient_portal_booking_context") {
      return { data: { tenant_id: "portal-tenant", branch_id: "portal-branch", branch_name_en: "Main", branch_name_ar: "الرئيسي", patient_name_en: "Salma", patient_name_ar: "سلمى", patient_phone: "01000000000" }, error: null };
    }
    if (name === "public_booking_options_for_tenant") {
      return { data: { tenant_id: String(args?.p_tenant_id ?? ""), tenant_name: "Portal Clinic", branches: [{ id: "portal-branch", name_en: "Main", working_days: [0,1,2,3,4,5,6], max_future_booking_days: 30 }], services: [{ id: "service", name_en: "Assessment", duration_minutes: 30, source: "service" }] }, error: null };
    }
    if (name === "list_doctors_for_service") return { data: [], error: null };
    return { data: [], error: null };
  },
} }));

afterEach(() => {
  cleanup();
  state.portalUser = true;
  state.calls = [];
  vi.restoreAllMocks();
});

async function openPlainBookLink() {
  window.history.replaceState({}, "", "/book");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  render(<PublicBooking />);
}

describe("PublicBooking tenant resolution without a locator", () => {
  it("uses the portal session's own clinic instead of dead-ending", async () => {
    await openPlainBookLink();
    expect(await screen.findByRole("button", { name: "Show available times" })).toBeEnabled();
    expect(screen.queryByText("This booking link needs a clinic identifier")).toBeNull();
    const optionsCall = state.calls.find((call) => call.name === "public_booking_options_for_tenant");
    expect(optionsCall?.args?.p_tenant_id).toBe("portal-tenant");
  });

  it("keeps the dead-end message for a visitor with no portal session", async () => {
    state.portalUser = false;
    await openPlainBookLink();
    expect(await screen.findByText("This booking link needs a clinic identifier")).toBeInTheDocument();
    expect(state.calls.some((call) => call.name === "public_booking_options_for_tenant")).toBe(false);
  });
});
