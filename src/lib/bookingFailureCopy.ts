/**
 * The booking RPCs raise a code, never a sentence, and this screen printed one
 * default "try again" for every code it did not recognise. `invalid_booking_input`
 * was the unreachable one: the form had no field the patient could change, so the
 * advice was to retry something that could only ever fail again. Each code the
 * guest flow can still provoke now gets its own words, and every other code keeps
 * the original sentence byte for byte — the four pre-existing strings are frozen
 * in `bookingFailureCopy.test.ts` and their absence from the page is re-checked by
 * `bookingInputLimitsContract.test.ts`.
 */
export function bookingFailureCopy(message: string, isArabic: boolean): string {
  if (message.includes("slot_unavailable")) {
    return isArabic
      ? "هذا الموعد حُجز للتو. اختر وقتًا آخر."
      : "This time was just booked. Please choose another time.";
  }
  if (message.includes("invalid_phone")) {
    return isArabic ? "اكتب رقم هاتف صحيحًا." : "Enter a valid phone number.";
  }
  if (message.includes("portal_account_inactive")) {
    return isArabic
      ? "تعذر التحقق من حساب بوابة المريض. أعد تحميل الصفحة وحاول مرة أخرى."
      : "Could not verify your patient portal account. Reload the page and try again.";
  }
  if (message.includes("invalid_booking_input")) {
    return isArabic
      ? "أحد البيانات التي كتبتها أطول مما تسمح به العيادة. اختصره وأعد المحاولة."
      : "One of the details you entered is longer than this clinic accepts. Please shorten it and try again.";
  }
  return isArabic
    ? "تعذر إتمام الحجز. حاول مرة أخرى."
    : "We could not complete the booking. Please try again.";
}
