/**
 * The booking RPCs raise a code, never a sentence, and this screen printed one
 * default "try again" for every code it did not recognise. `invalid_booking_input`
 * was the unreachable one: the form had no field the patient could change, so the
 * advice was to retry something that could only ever fail again. Each code the
 * guest flow can still provoke now gets its own words, and every other code keeps
 * the original sentence byte for byte — the four pre-existing strings are frozen
 * in `bookingFailureCopy.test.ts` and their absence from the page is re-checked by
 * `bookingInputLimitsContract.test.ts`.
 *
 * Batch 27 added the remaining six codes Production's booking definitions raise,
 * grouped by the action the patient still has rather than by the cause they cannot
 * see: a throttle (wait), a branch/doctor/service that is no longer bookable
 * (choose something else), and a clinic that is not taking online bookings at all
 * (contact the clinic). `full_name_required` and `phone_required` are deliberately
 * still generic — this page trims both fields, refuses the submit when either is
 * empty, and sends exactly those trimmed strings, so its own submission can never
 * reach either raise; the contract test pins that argument, because the exemption
 * is only honest while the guard is there.
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
  // No number of minutes is stated on purpose: Production throttles this RPC twice,
  // 20 attempts an hour per IP and 6 per phone+IP per six hours, and the raise says
  // only `rate_limited` — so any specific promise would be right for one of them.
  if (message.includes("rate_limited")) {
    return isArabic
      ? "محاولات الحجز من هذا الجهاز كثيرة جدًا. حاول مرة أخرى لاحقًا."
      : "There have been too many booking attempts from this device. Please try again later.";
  }
  if (message.includes("branch_unavailable") || message.includes("doctor_unavailable") || message.includes("service_unavailable")) {
    return isArabic
      ? "هذا الخيار لم يعد متاحًا للحجز الإلكتروني. اختر خدمة أو فرعًا آخر، أو تواصل مع العيادة."
      : "This option is no longer bookable online. Choose another service or branch, or contact the clinic.";
  }
  if (message.includes("online_booking_disabled") || message.includes("tenant_subscription_inactive")) {
    return isArabic
      ? "هذه العيادة لا تستقبل الحجوزات الإلكترونية الآن. تواصل مع العيادة لحجز الموعد."
      : "This clinic is not accepting online bookings right now. Contact the clinic to book your appointment.";
  }
  return isArabic
    ? "تعذر إتمام الحجز. حاول مرة أخرى."
    : "We could not complete the booking. Please try again.";
}
