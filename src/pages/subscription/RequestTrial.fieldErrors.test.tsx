import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SUBSCRIPTION_REQUEST_FIELD_ERRORS, describeSubscriptionRequestFieldError, validateSubscriptionRequest } from "@/lib/subscriptionRequest";

// The plans read is a PostgREST query builder, not an rpc: each link returns the
// builder and the terminal `then` hands the outcome to the page. Outcomes shift
// off a queue, so a retry can be scripted to succeed where the first read failed.
// `reads` counts the moment a query is *sent*. `applied` increments only after
// the page's own callback has returned, so it is a happens-after marker rather
// than a guess about scheduling: CI turned a test that waited on `reads` red by
// clicking submit while that read was still in flight.
const state = vi.hoisted(() => ({
  outcomes: [] as Array<{ data: unknown; error: unknown }>,
  reads: 0,
  applied: 0,
  invokes: 0,
  bodies: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", setLang: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
    chain.then = (handle: (value: unknown) => void) => {
      state.reads += 1;
      const outcome = state.outcomes.shift() ?? { data: [], error: null };
      return Promise.resolve().then(() => {
        handle(outcome);
        state.applied += 1;
      });
    };
    return chain;
  };
  return {
    supabase: {
      from: builder,
      functions: {
        invoke: async (_name: string, options: { body: Record<string, unknown> }) => {
          state.invokes += 1;
          state.bodies.push(options.body);
          return { data: { accepted: true }, error: null };
        },
      },
    },
  };
});

import RequestTrial from "./RequestTrial";

const page = readFileSync("src/pages/subscription/RequestTrial.tsx", "utf8");

function open(route = "/request-trial") {
  render(
    <MemoryRouter initialEntries={[route]}>
      <RequestTrial />
    </MemoryRouter>,
  );
}

// The plan picker's trigger names the selected plan even while its list is
// closed, so this is the only signal that React has *rendered* a choice. A
// counter can say the page was told; this says the page shows it, which is what
// has to be true before the submit button is clicked.
function planField() {
  return screen.getByRole("combobox");
}

function fill(overrides: { clinic?: string; owner?: string; email?: string } = {}) {
  fireEvent.change(screen.getByLabelText("Clinic or center name"), { target: { value: overrides.clinic ?? "Blitz Physio" } });
  fireEvent.change(screen.getByLabelText("Owner or manager name"), { target: { value: overrides.owner ?? "Rana Salem" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: overrides.email ?? "rana@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: /Send trial request/i }));
}

afterEach(() => {
  cleanup();
  state.outcomes = [];
  state.reads = 0;
  state.applied = 0;
  state.invokes = 0;
  state.bodies = [];
});

describe("the trial request tells the applicant which field it rejected (P8)", () => {
  it("replaces the four-field guess with the one sentence about the field that failed", async () => {
    state.outcomes = [{ data: [{ id: "p1", name_ar: "خطة", name_en: "Starter", price_monthly: 100, currency: "EGP" }], error: null }];
    open();
    fill({ clinic: "B" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(SUBSCRIPTION_REQUEST_FIELD_ERRORS.clinic_name.en);
    // The sentence this batch replaced named four fields for one fault; it must
    // not survive anywhere in the file, or a later edit can restore it by copy.
    expect(alert.textContent).not.toMatch(/optional fields|and email/i);
    expect(page).not.toContain("Please review the clinic name, owner name, email");
    expect(page).not.toContain("راجع اسم العيادة واسم المسؤول والبريد");
    await waitFor(() => expect(state.invokes).toBe(0));
  });

  it("names the email format the browser accepts and the validator does not", async () => {
    state.outcomes = [{ data: [], error: null }];
    open();
    fill({ email: "rana@example" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(SUBSCRIPTION_REQUEST_FIELD_ERRORS.email.en);
    expect(state.invokes).toBe(0);
  });

  it("every rule the validator can return has its own sentence, in both languages, naming its own field", () => {
    const words: Record<string, [string, string]> = {
      clinic_name: ["clinic", "العيادة"],
      owner_name: ["owner", "المسؤول"],
      email: ["email", "البريد"],
      phone: ["phone", "الهاتف"],
      message: ["message", "الرسالة"],
    };
    expect(Object.keys(SUBSCRIPTION_REQUEST_FIELD_ERRORS).sort()).toEqual(Object.keys(words).sort());
    for (const [field, [englishWord, arabicWord]] of Object.entries(words)) {
      const copy = SUBSCRIPTION_REQUEST_FIELD_ERRORS[field as keyof typeof SUBSCRIPTION_REQUEST_FIELD_ERRORS];
      expect(copy.en.toLowerCase()).toContain(englishWord);
      expect(copy.ar).toContain(arabicWord);
      expect(describeSubscriptionRequestFieldError(field as never, true)).toBe(copy.ar);
      expect(describeSubscriptionRequestFieldError(field as never, false)).toBe(copy.en);
    }
    const all = Object.values(SUBSCRIPTION_REQUEST_FIELD_ERRORS).map((c) => c.en);
    expect(new Set(all).size, "two rules share a sentence, so the alert is vague again").toBe(all.length);
  });

  it("the two codes the form itself makes unreachable stay pinned to the caps that hide them", () => {
    // phone > 40 and message > 1000 are validator rules the page's own
    // maxLength attributes prevent, which is why no applicant has ever seen
    // those two sentences. Pinning the caps here means the claim is checked:
    // raise a maxLength and this test says the copy just became live.
    expect(validateSubscriptionRequest({ clinicName: "Clinic", ownerName: "Owner", email: "a@b.co", phone: "1".repeat(41) })).toBe("phone");
    expect(page).toContain('id="request-phone"');
    expect(page).toMatch(/id="request-phone"[\s\S]{0,240}maxLength=\{40\}/);
    expect(page).toMatch(/id="request-message"[\s\S]{0,240}maxLength=\{1000\}/);
  });

  it("says so when the plan list could not be read, and still lets the request through", async () => {
    state.outcomes = [{ data: null, error: { message: "provider detail that must not reach the page" } }];
    open();
    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain("plan list could not be loaded");
    // Two claims in one sentence: the read failed, and the send is still open.
    expect(notice.textContent).toContain("still send this request");
    expect(notice.textContent).not.toContain("provider detail");
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    await waitFor(() => expect(state.applied).toBe(2));
  });

  it("does not claim a failure for a plan list that is merely empty", async () => {
    state.outcomes = [{ data: [], error: null }];
    open();
    // `applied`, not `reads`: the claim is about what the page did with an empty
    // answer, so the wait has to reach the far side of the read.
    await waitFor(() => expect(state.applied).toBe(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears the notice when the retry succeeds", async () => {
    state.outcomes = [
      { data: null, error: { message: "synthetic" } },
      { data: [{ id: "p1", name_ar: "خطة", name_en: "Starter", price_monthly: 100, currency: "EGP" }], error: null },
    ];
    open();
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(state.reads).toBe(2);
  });

  it("asks for the plan list once per mount, not once per value its answer writes", async () => {
    state.outcomes = [{ data: [{ id: "p1", name_ar: "خطة", name_en: "Starter", price_monthly: 100, currency: "EGP" }], error: null }];
    open();
    // The dependency list held `planId` while the resolved read wrote `planId`,
    // so every mount sent the same query twice. `reads` is the wrong side of
    // that: it is satisfied before the first answer lands, so the second query
    // has not been sent yet and the count looks clean.
    await waitFor(() => expect(state.applied).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.reads, "the plans read re-fired on the value its own answer wrote").toBe(1);
  });

  it("still preselects the plan the read returned, and shows it on the form", async () => {
    state.outcomes = [{ data: [{ id: "p1", name_ar: "خطة", name_en: "Starter", price_monthly: 100, currency: "EGP" }], error: null }];
    open();
    // Driven from the rendered field, not from a counter: the click must not be
    // able to overtake the read, and only the DOM says the choice is on screen.
    await waitFor(() => expect(planField().textContent).toContain("Starter"));
    fill();
    await waitFor(() => expect(state.invokes).toBe(1));
    // Dropping the auto-select would have quietened the duplicate read too, so
    // the count alone is not enough: the plan the applicant never picked has to
    // both reach the request and be the plan the screen is showing.
    expect((state.bodies[0].payload as Record<string, unknown>).plan_id).toBe("p1");
  });

  it("keeps the plan the applicant arrived with when the read returns a different first plan", async () => {
    // /pricing (Pricing.tsx:218) and /auth (Auth.tsx:58) both deep-link
    // ?plan=<id>, so auto-select may only fill an empty choice: letting the
    // read overwrite it would silently swap the plan card the applicant clicked
    // for whatever sorts first.
    state.outcomes = [{ data: [{ id: "p1", name_ar: "خطة", name_en: "Starter", price_monthly: 100, currency: "EGP" }], error: null }];
    open("/request-trial?plan=p9");
    await waitFor(() => expect(state.applied).toBe(1));
    expect(planField().textContent, "the deep-linked plan was overwritten by the read").not.toContain("Starter");
    fill();
    await waitFor(() => expect(state.invokes).toBe(1));
    expect((state.bodies[0].payload as Record<string, unknown>).plan_id).toBe("p9");
  });
});
