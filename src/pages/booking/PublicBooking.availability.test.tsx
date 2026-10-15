import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PublicBooking from "./PublicBooking";

const state = vi.hoisted(() => ({ fail: "rpc" as "rpc" | "network" | "none" }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", setLang: vi.fn() }) }));
vi.mock("@/lib/adAttribution", () => ({ captureAdAttribution: vi.fn(), getStoredAdAttribution: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: null } }) },
  rpc: async (name: string) => {
    if (name === "public_booking_tenant_by_slug") return { data: [{ tenant_id: "tenant" }], error: null };
    if (name === "public_booking_options_for_tenant") return { data: { tenant_id: "tenant", tenant_name: "Demo", branches: [{ id: "branch", name_en: "Branch", working_days: [0,1,2,3,4,5,6], max_future_booking_days: 30 }], services: [{ id: "service", name_en: "Service", duration_minutes: 30, source: "service" }] }, error: null };
    if (name === "list_doctors_for_service") return { data: [], error: null };
    if (state.fail === "network") throw new Error("private network detail");
    return state.fail === "rpc" ? { data: null, error: { message: "private database detail" } } : { data: [], error: null };
  },
} }));
afterEach(() => { cleanup(); state.fail = "rpc"; vi.restoreAllMocks(); });
async function openTimePicker() {
  window.history.replaceState({}, "", "/?tenant=qa");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  render(<PublicBooking />);
  fireEvent.click(await screen.findByRole("button", { name: "Show available times" }));
}
describe("PublicBooking availability failures", () => {
  it.each(["rpc", "network"] as const)("handles %s failure without claiming the day is full", async kind => {
    state.fail = kind;
    await openTimePicker();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load availability");
    expect(screen.queryByText("No available times for this day. Please choose another date.")).toBeNull();
    expect(screen.queryByText(/private (database|network) detail/)).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });
  it("retries successfully and distinguishes a genuinely empty response", async () => {
    await openTimePicker();
    await screen.findByRole("alert");
    state.fail = "none";
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByText("No available times for this day. Please choose another date.")).toBeInTheDocument();
  });
});
