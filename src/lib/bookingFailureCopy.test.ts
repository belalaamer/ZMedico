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

describe("the codes the booking screen can still provoke", () => {
  it.each([
    ["slot_unavailable", "slot_unavailable", SLOT, SLOT_EN],
    ["invalid_phone", "invalid_phone", PHONE, PHONE_EN],
    ["portal_account_inactive", "portal_account_inactive", PORTAL, PORTAL_EN],
    ["invalid_booking_input", "invalid_booking_input", OVERLONG, OVERLONG_EN],
    ["a code nothing maps", "tenant_subscription_inactive", GENERIC, GENERIC_EN],
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
      ["unknown", GENERIC, GENERIC_EN],
    ] as const) {
      expect(bookingFailureCopy(code, true), `${code} still holds its English text`).not.toBe(bookingFailureCopy(code, false));
      expect(ar).not.toBe(en);
    }
  });

  it("keeps the code out of what the patient is shown", () => {
    for (const code of ["slot_unavailable", "invalid_phone", "portal_account_inactive", "invalid_booking_input"]) {
      expect(bookingFailureCopy(code, false)).not.toContain(code);
      expect(bookingFailureCopy(code, true)).not.toContain(code);
    }
  });
});

describe("the chain's order is load-bearing", () => {
  it("answers a message naming two codes with the first one it recognises", () => {
    // Today no raise carries two tokens, but the mapper reads `includes`, so a
    // message that ever did would pick by position. Frozen so the choice is known
    // rather than incidental.
    expect(bookingFailureCopy("invalid_phone and invalid_booking_input", false)).toBe(PHONE_EN);
    expect(bookingFailureCopy("invalid_booking_input and slot_unavailable", false)).toBe(SLOT_EN);
  });
});
