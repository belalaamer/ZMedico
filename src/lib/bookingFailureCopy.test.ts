import { describe, expect, it } from "vitest";
import { bookingFailureCopy } from "./bookingFailureCopy";

/**
 * The four sentences the screen already owned are pinned here as the exact bytes
 * they had before this batch, because the finding is not that they were wrong — it
 * is that a fifth code fell past all of them into a retry the patient could never
 * make work. The new sentence is pinned too, so a later rewrite has to be a
 * decision rather than a drift.
 */

const SLOT = "هذا الموعد حُجز للتو. اختر وقتًا آخر.";
const SLOT_EN = "This time was just booked. Please choose another time.";
const PHONE = "اكتب رقم هاتف صحيحًا.";
const PHONE_EN = "Enter a valid phone number.";
const PORTAL = "تعذر التحقق من حساب بوابة المريض. أعد تحميل الصفحة وحاول مرة أخرى.";
const PORTAL_EN = "Could not verify your patient portal account. Reload the page and try again.";
const OVERLONG = "أحد البيانات التي كتبتها أطول مما تسمح به العيادة. اختصره وأعد المحاولة.";
const OVERLONG_EN = "One of the details you entered is longer than this clinic accepts. Please shorten it and try again.";
const GENERIC = "تعذر إتمام الحجز. حاول مرة أخرى.";
const GENERIC_EN = "We could not complete the booking. Please try again.";
const RATE = "محاولات الحجز من هذا الجهاز كثيرة جدًا. حاول مرة أخرى لاحقًا.";
const RATE_EN = "There have been too many booking attempts from this device. Please try again later.";
const GONE = "هذا الخيار لم يعد متاحًا للحجز الإلكتروني. اختر خدمة أو فرعًا آخر، أو تواصل مع العيادة.";
const GONE_EN = "This option is no longer bookable online. Choose another service or branch, or contact the clinic.";
const CLOSED = "هذه العيادة لا تستقبل الحجوزات الإلكترونية الآن. تواصل مع العيادة لحجز الموعد.";
const CLOSED_EN = "This clinic is not accepting online bookings right now. Contact the clinic to book your appointment.";

describe("the codes the booking screen can still provoke", () => {
  it.each([
    ["slot_unavailable", "slot_unavailable", SLOT, SLOT_EN],
    ["invalid_phone", "invalid_phone", PHONE, PHONE_EN],
    ["portal_account_inactive", "portal_account_inactive", PORTAL, PORTAL_EN],
    ["invalid_booking_input", "invalid_booking_input", OVERLONG, OVERLONG_EN],
    ["an unmapped code", "unknown_code", GENERIC, GENERIC_EN],
    ["an empty message", "", GENERIC, GENERIC_EN],
  ] as const)("%s prints the sentence the screen owns, in both languages", (_label, code, ar, en) => {
    expect(bookingFailureCopy(code, true)).toBe(ar);
    expect(bookingFailureCopy(code, false)).toBe(en);
  });

  it("tells an over-long refusal apart from a generic one, in both languages", () => {
    // The whole point of the batch: before it, `invalid_booking_input` printed the
    // generic sentence, which asked the patient to retry something that could only
    // fail again. If the two ever collapse, the finding comes back silently.
    expect(bookingFailureCopy("invalid_booking_input", true)).not.toBe(bookingFailureCopy("anything_else", true));
    expect(bookingFailureCopy("invalid_booking_input", false)).not.toBe(bookingFailureCopy("anything_else", false));
  });

  it("never answers an Arabic desk with the English sentence", () => {
    for (const [code, ar, en] of [
      ["slot_unavailable", SLOT, SLOT_EN],
      ["invalid_phone", PHONE, PHONE_EN],
      ["portal_account_inactive", PORTAL, PORTAL_EN],
      ["invalid_booking_input", OVERLONG, OVERLONG_EN],
      ["rate_limited", RATE, RATE_EN],
      ["branch_unavailable", GONE, GONE_EN],
      ["doctor_unavailable", GONE, GONE_EN],
      ["service_unavailable", GONE, GONE_EN],
      ["online_booking_disabled", CLOSED, CLOSED_EN],
      ["tenant_subscription_inactive", CLOSED, CLOSED_EN],
      ["unknown", GENERIC, GENERIC_EN],
    ] as const) {
      expect(bookingFailureCopy(code, true), `${code} still holds its English text`).not.toBe(bookingFailureCopy(code, false));
      expect(ar).not.toBe(en);
    }
  });

  it("keeps the code out of what the patient is shown", () => {
    for (const code of [
      "slot_unavailable", "invalid_phone", "portal_account_inactive", "invalid_booking_input",
      "rate_limited", "branch_unavailable", "doctor_unavailable", "service_unavailable",
      "online_booking_disabled", "tenant_subscription_inactive",
    ]) {
      expect(bookingFailureCopy(code, false)).not.toContain(code);
      expect(bookingFailureCopy(code, true)).not.toContain(code);
    }
  });
});

describe("batch 27: the six codes that used to share the generic sentence", () => {
  it.each([
    ["rate_limited", RATE, RATE_EN],
    ["branch_unavailable", GONE, GONE_EN],
    ["doctor_unavailable", GONE, GONE_EN],
    ["service_unavailable", GONE, GONE_EN],
    ["online_booking_disabled", CLOSED, CLOSED_EN],
    ["tenant_subscription_inactive", CLOSED, CLOSED_EN],
  ] as const)("%s now gets advice of its own, in both languages", (code, ar, en) => {
    expect(bookingFailureCopy(code, true)).toBe(ar);
    expect(bookingFailureCopy(code, false)).toBe(en);
    expect(ar, `${code} collapsed back into the generic sentence`).not.toBe(GENERIC);
    expect(en, `${code} collapsed back into the generic sentence`).not.toBe(GENERIC_EN);
  });

  it("groups the refusals by what the patient can still do, not by what broke", () => {
    // A deliberate collapse, recorded here so it reads as a decision: three catalog
    // codes mean the same thing to a patient — the option they picked is gone — and
    // two clinic-state codes mean the clinic cannot take the booking at all. The
    // causes differ (an inactive branch, a disallowed doctor assignment, a service
    // with available_online off; a branch switched off online booking, a lapsed
    // subscription), and none of that is the patient's to untangle.
    expect(bookingFailureCopy("branch_unavailable", false)).toBe(bookingFailureCopy("doctor_unavailable", false));
    expect(bookingFailureCopy("branch_unavailable", false)).toBe(bookingFailureCopy("service_unavailable", false));
    expect(bookingFailureCopy("online_booking_disabled", true)).toBe(bookingFailureCopy("tenant_subscription_inactive", true));
    // …but the three groups stay three different sentences.
    expect(GONE_EN).not.toBe(CLOSED_EN);
    expect(GONE_EN).not.toBe(SLOT_EN);
    expect(RATE_EN).not.toBe(GONE_EN);
  });

  it("promises no waiting period on a throttle, because two windows fired the same word", () => {
    // Production's body throttles this RPC twice over — consume_public_booking_rate_limit
    // (v_ip_key, 20, 3600) and (v_phone_ip_key, 6, 21600) — and the raise carries only
    // `rate_limited`, so a sentence like "try again in an hour" would be false for a
    // patient who hit the six-hour one. Freezing "no digits" keeps a later edit from
    // inventing a number nobody can honour.
    expect(bookingFailureCopy("rate_limited", false)).not.toMatch(/\d/);
    expect(bookingFailureCopy("rate_limited", true)).not.toMatch(/[٠-٩0-9]/);
    expect(RATE_EN).toContain("later");
  });

  it("says what to do rather than that it failed, for every code batch 27 named", () => {
    // The finding is untrue advice, not missing advice, so the sentences are pinned to
    // contain the action: retry later, choose another option, contact the clinic.
    expect(RATE_EN).toContain("try again later");
    expect(GONE_EN).toContain("Choose another service or branch");
    expect(GONE_EN).toContain("contact the clinic");
    expect(CLOSED_EN).toContain("Contact the clinic");
    // Both languages carry the same verb for the clinic, which is the phrase this page
    // already uses on its own incomplete-link card.
    expect(GONE).toContain("تواصل مع العيادة");
    expect(CLOSED).toContain("تواصل مع العيادة");
  });
});

describe("the two required-field codes stay generic, and say why", () => {
  it("leaves full_name_required and phone_required to the default sentence", () => {
    // The page trims both fields, refuses the submit if either is empty, and sends the
    // trimmed values, so the RPC's NULLIF(trim(p_full_name),'') IS NULL can never fire
    // from this form. `bookingInputLimitsContract.test.ts` pins that guard: delete it
    // and these two exemptions become wrong, loudly.
    expect(bookingFailureCopy("full_name_required", false)).toBe(GENERIC_EN);
    expect(bookingFailureCopy("phone_required", false)).toBe(GENERIC_EN);
    expect(bookingFailureCopy("full_name_required", true)).toBe(GENERIC);
    expect(bookingFailureCopy("phone_required", true)).toBe(GENERIC);
  });
});

describe("the chain's order is load-bearing", () => {
  it("answers a message naming two codes with the first one it recognises", () => {
    // Today no raise carries two tokens, but the mapper reads `includes`, so a
    // message that ever did would pick by position. Frozen so the choice is known
    // rather than incidental.
    expect(bookingFailureCopy("invalid_phone and invalid_booking_input", false)).toBe(PHONE_EN);
    expect(bookingFailureCopy("invalid_booking_input and slot_unavailable", false)).toBe(SLOT_EN);
    // Batch 27 appended its branches after the four original ones, so a message that
    // named both a pre-existing code and a new one still gets the older sentence.
    expect(bookingFailureCopy("rate_limited and slot_unavailable", false)).toBe(SLOT_EN);
    expect(bookingFailureCopy("service_unavailable and rate_limited", false)).toBe(RATE_EN);
    // The chain reads `includes`, so a new code would fall into an older branch if its
    // text contained that branch's token. None does: "unavailable" is shared with
    // `slot_unavailable` by three codes, but never the whole token.
    expect(bookingFailureCopy("service_unavailable", false)).toBe(GONE_EN);
    expect(bookingFailureCopy("branch_unavailable", false)).toBe(GONE_EN);
    expect(bookingFailureCopy("doctor_unavailable", false)).toBe(GONE_EN);
  });
});
