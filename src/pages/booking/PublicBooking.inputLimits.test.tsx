import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import PublicBooking from "./PublicBooking";

// The two clients are faked separately on purpose: the guest booking goes out on a
// session-less client (`getGuestBookingClient`) while every read goes on the shared
// one, and P6 lives entirely in what the guest client is handed.
const state = vi.hoisted(() => ({
  portalUser: false,
  attribution: null as Record<string, unknown> | null,
  guestError: null as { message: string } | null,
  guestCalls: [] as Array<{ name: string; args?: Record<string, unknown> }>,
  guestResult: null as Record<string, unknown> | null,
  publicCalls: [] as Array<{ name: string; args?: Record<string, unknown> }>,
}));

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", setLang: vi.fn() }) }));
vi.mock("@/lib/adAttribution", () => ({
  captureAdAttribution: vi.fn(),
  getStoredAdAttribution: () => state.attribution,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/publicBookingClient", () => ({
  getGuestBookingClient: () => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      state.guestCalls.push({ name, args });
      return { data: state.guestResult, error: state.guestError };
    },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: state.portalUser ? { id: "portal-user" } : null } }) },
  rpc: async (name: string, args?: Record<string, unknown>) => {
    state.publicCalls.push({ name, args });
    if (name === "public_booking_tenant_by_slug") return { data: [{ tenant_id: "tenant" }], error: null };
    if (name === "patient_portal_booking_context") {
      return { data: { tenant_id: "tenant", branch_id: "branch", branch_name_en: "Branch", branch_name_ar: "الفرع", patient_name_en: "Salma", patient_name_ar: "سلمى", patient_phone: "01000000000" }, error: null };
    }
    if (name === "public_booking_options_for_tenant") {
      return { data: { tenant_id: "tenant", tenant_name: "Demo", branches: [{ id: "branch", name_en: "Branch", working_days: [0, 1, 2, 3, 4, 5, 6], max_future_booking_days: 30 }], services: [{ id: "service", name_en: "Service", duration_minutes: 30, source: "service" }] }, error: null };
    }
    if (name === "list_doctors_for_service") return { data: [], error: null };
    if (name === "public_booking_slots_for_tenant") {
      return { data: [{ slot_start: "2030-01-01T10:00:00.000Z", slot_end: "2030-01-01T10:30:00.000Z", available: true }], error: null };
    }
    if (name === "patient_portal_create_booking") {
      return { data: { booking_reference: "BZ-2", status: "confirmed", scheduled_at: "2030-01-01T10:00:00Z", service_name_en: "Service", service_name_ar: "خدمة", branch_name_en: "Branch", branch_name_ar: "الفرع" }, error: null };
    }
    return { data: [], error: null };
  },
} }));

const SLOT_LABEL = new Date("2030-01-01T10:00:00.000Z").toLocaleTimeString("en-EG", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const CONFIRMED = {
  booking_reference: "BZ-1",
  status: "confirmed",
  scheduled_at: "2030-01-01T10:00:00Z",
  service_name_en: "Service",
  service_name_ar: "خدمة",
  branch_name_en: "Branch",
  branch_name_ar: "الفرع",
};

async function openDetailsForm(search = "?tenant=qa") {
  window.history.replaceState({}, "", `/${search}`);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  render(<PublicBooking />);
  fireEvent.click(await screen.findByRole("button", { name: "Show available times" }));
  fireEvent.click(await screen.findByRole("button", { name: SLOT_LABEL }));
  fireEvent.click(await screen.findByRole("button", { name: "Continue with details" }));
  await screen.findByRole("button", { name: "Confirm booking" });
}

async function openPortalDetailsForm() {
  state.portalUser = true;
  window.history.replaceState({}, "", "/?tenant=qa");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  render(<PublicBooking />);
  fireEvent.click(await screen.findByRole("button", { name: "Show available times" }));
  fireEvent.click(await screen.findByRole("button", { name: SLOT_LABEL }));
  fireEvent.click(await screen.findByRole("button", { name: "Continue with details" }));
  await screen.findByRole("button", { name: "Confirm booking" });
}

function fillGuestDetails() {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Salma Mostafa" } });
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "01000000000" } });
}

/** Submits and hands back the envelope the session-less guest client was given. */
async function submitAndCapture() {
  fillGuestDetails();
  fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
  await waitFor(() => expect(state.guestCalls).toHaveLength(1));
  return state.guestCalls[0];
}

afterEach(() => {
  cleanup();
  state.portalUser = false;
  state.attribution = null;
  state.guestError = null;
  state.guestResult = null;
  state.guestCalls = [];
  state.publicCalls = [];
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// Every case here mounts the whole booking page, and the cold first mount in a
// fresh fork costs more than vitest's 5s default — which batch 27's added cases
// made reachable. Named once rather than per test, so a real hang still fails
// eventually instead of never.
const RENDER_TIMEOUT = 30_000;

describe("the guest booking form caps each field where the RPC caps it (P6)", () => {
  it("gives every typed field the booking RPC's own length limit", async () => {
    await openDetailsForm();
    expect(screen.getByLabelText("Full name")).toHaveProperty("maxLength", 160);
    expect(screen.getByLabelText("Mobile number")).toHaveProperty("maxLength", 40);
    expect(screen.getByLabelText("Email (optional)")).toHaveProperty("maxLength", 254);
    expect(screen.getByLabelText("Short reason for visit (optional)")).toHaveProperty("maxLength", 2000);
  });

  it("leaves the portal patient's reason uncapped, because their RPC sets no limit", async () => {
    await openPortalDetailsForm();
    // `patient_portal_create_booking` raises only `portal_account_inactive` and
    // `service_unavailable` (measured on Production): no length guard at all. A cap
    // here would take away a booking that succeeds today, so the shared textarea is
    // capped for guests only.
    expect(screen.queryByLabelText("Full name")).toBeNull();
    // Asserted as the absence of the attribute, not as `element.maxLength`: jsdom
    // reflects a textarea without a cap as 0 where a browser reports -1, so only
    // the attribute means the same thing in both.
    expect(screen.getByLabelText("Short reason for visit (optional)")).not.toHaveAttribute("maxlength");
  });
}, RENDER_TIMEOUT);

describe("the guest booking envelope as the RPC receives it", () => {
  it("clamps a marketing URL the patient cannot edit instead of failing the booking", async () => {
    state.guestResult = CONFIRMED;
    await openDetailsForm(`?tenant=qa&utm_source=${"s".repeat(300)}&utm_medium=${"m".repeat(300)}&utm_campaign=${"c".repeat(300)}`);
    const call = await submitAndCapture();

    expect(call.name).toBe("public_create_booking_for_tenant");
    expect(String(call.args?.p_source).length).toBe(100);
    const metadata = call.args?.p_metadata as Record<string, string | null>;
    expect(metadata.utm_source).toHaveLength(200);
    expect(metadata.utm_medium).toHaveLength(200);
    expect(metadata.utm_campaign).toHaveLength(200);
    expect(metadata.landing_path).toBe("/");
    expect(call.args?.p_full_name).toBe("Salma Mostafa");
    expect(call.args?.p_phone).toBe("01000000000");
  });

  it("keeps the serialized metadata inside the RPC's 8192-octet budget when every source is maximal", async () => {
    state.guestResult = CONFIRMED;
    state.attribution = Object.fromEntries(
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "campaign_id", "adset_id",
        "adset_name", "ad_id", "ad_name", "fbclid", "gclid", "landing_page", "first_seen_at"]
        .map((key) => [key, "x".repeat(5000)]),
    );
    await openDetailsForm(`?tenant=qa&utm_source=${"s".repeat(5000)}&utm_medium=${"m".repeat(5000)}&utm_campaign=${"c".repeat(5000)}`);
    const call = await submitAndCapture();

    const octets = new TextEncoder().encode(JSON.stringify(call.args?.p_metadata)).length;
    expect(octets).toBeLessThan(8192);
    // Truncating is not dropping: every key the patient's link carried is still sent.
    expect(Object.keys((call.args?.p_metadata as Record<string, unknown>).attribution as object)).toHaveLength(14);
  });

  it("sends an in-limit value untouched, so no booking that worked before changes its data", async () => {
    state.guestResult = CONFIRMED;
    state.attribution = { utm_source: "meta", landing_page: "/book" };
    await openDetailsForm("?tenant=qa&utm_source=meta&utm_medium=social&utm_campaign=clinic-opening");
    const call = await submitAndCapture();

    expect(call.args?.p_source).toBe("meta");
    expect(call.args?.p_metadata).toEqual({
      utm_source: "meta",
      utm_medium: "social",
      utm_campaign: "clinic-opening",
      landing_path: "/",
      attribution: { utm_source: "meta", landing_page: "/book" },
    });
  });

  it("still sends the portal booking with its own unclamped metadata", async () => {
    state.attribution = { landing_page: "/book" };
    await openPortalDetailsForm();
    fireEvent.change(screen.getByLabelText("Short reason for visit (optional)"), { target: { value: "follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    await waitFor(() => expect(state.publicCalls.some((call) => call.name === "patient_portal_create_booking")).toBe(true));

    const call = state.publicCalls.find((item) => item.name === "patient_portal_create_booking");
    expect(call?.args?.p_complaint).toBe("follow-up");
    // The portal branch never went through the clamp helper: no server limit means
    // no reason to shorten what the clinic receives.
    expect(call?.args?.p_metadata).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      landing_path: "/",
    });
    expect(state.guestCalls).toHaveLength(0);
  });
}, RENDER_TIMEOUT);

describe("what the booking screen says when the RPC refuses (P6)", () => {
  const refusals: Array<[string, string]> = [
    ["slot_unavailable", "This time was just booked. Please choose another time."],
    ["invalid_phone", "Enter a valid phone number."],
    ["portal_account_inactive", "Could not verify your patient portal account. Reload the page and try again."],
    ["invalid_booking_input", "One of the details you entered is longer than this clinic accepts. Please shorten it and try again."],
    // Batch 27: the six codes that used to print the generic sentence, now grouped
    // by the action the patient can still take.
    ["rate_limited", "There have been too many booking attempts from this device. Please try again later."],
    ["branch_unavailable", "This option is no longer bookable online. Choose another service or branch, or contact the clinic."],
    ["doctor_unavailable", "This option is no longer bookable online. Choose another service or branch, or contact the clinic."],
    ["service_unavailable", "This option is no longer bookable online. Choose another service or branch, or contact the clinic."],
    ["online_booking_disabled", "This clinic is not accepting online bookings right now. Contact the clinic to book your appointment."],
    ["tenant_subscription_inactive", "This clinic is not accepting online bookings right now. Contact the clinic to book your appointment."],
    ["something_else", "We could not complete the booking. Please try again."],
  ];

  it.each(refusals)("prints the sentence owned by %s, and never the raw code", async (code, sentence) => {
    state.guestError = { message: code };
    await openDetailsForm();
    fillGuestDetails();
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(sentence));
    const printed = vi.mocked(toast.error).mock.calls.map((call) => String(call[0])).join(" | ");
    expect(printed).not.toContain(code);
  });
}, RENDER_TIMEOUT);

describe("a refusal that is not about the slot leaves the form alone (P11)", () => {
  /**
   * The sentence is only half of the finding. Half of the codes the desk of this
   * screen answers for are things the patient can fix without losing their place,
   * and the page resets to the times list for `slot_unavailable` only — so a
   * throttle or a closed clinic must not erase the name and number just typed.
   * Both halves are asserted together because either one alone still looks fine.
   */
  it.each([
    "rate_limited",
    "branch_unavailable",
    "doctor_unavailable",
    "service_unavailable",
    "online_booking_disabled",
    "tenant_subscription_inactive",
    "invalid_booking_input",
  ])("keeps the typed details and the Confirm button after %s", async (code) => {
    state.guestError = { message: code };
    await openDetailsForm();
    fillGuestDetails();
    fireEvent.change(screen.getByLabelText("Short reason for visit (optional)"), { target: { value: "follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    expect(screen.getByLabelText("Full name")).toHaveValue("Salma Mostafa");
    expect(screen.getByLabelText("Mobile number")).toHaveValue("01000000000");
    expect(screen.getByLabelText("Short reason for visit (optional)")).toHaveValue("follow-up");
    // Retryable by editing: the submit control is still there, not a dead card.
    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeTruthy();
  });

  it("does reset for slot_unavailable, which is the one refusal the reset serves", async () => {
    state.guestError = { message: "slot_unavailable" };
    await openDetailsForm();
    fillGuestDetails();
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    // The chosen time is the thing that failed, so the page sends the patient back
    // to pick another; the details form is gone with it. This is the other half of
    // the case above — without it, "leaves the form alone" would also pass if the
    // page reset for every code.
    expect(screen.queryByLabelText("Full name")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: SLOT_LABEL }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue with details" }));
    // Only the slot is discarded, never what the patient typed: `setStep(2)` clears
    // `selectedSlot` and nothing else, so coming back does not ask them again.
    expect(screen.getByLabelText("Full name")).toHaveValue("Salma Mostafa");
    expect(screen.getByLabelText("Mobile number")).toHaveValue("01000000000");
  });
}, RENDER_TIMEOUT);
