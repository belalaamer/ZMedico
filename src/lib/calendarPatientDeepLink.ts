import type { PatientNameFields } from "@/lib/patientName";

/**
 * `?patient_id=<uuid>` is written by the patients list ("Book Appointment") and by the
 * patient profile's Book action, and the calendar used to read only `date` and `appt` --
 * so the desk arrived with a patient in the URL and an empty picker. These helpers keep
 * the consuming rules in one testable place.
 */

const PATIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DeepLinkedPatient = {
  id: string;
  /** Null when no live, non-deleted patient row matched the id in the URL. */
  name: string | null;
  /** True when the lookup itself failed -- "not found" must not wear an error's face. */
  lookupFailed: boolean;
};

/** Anything that is not a patient id is treated as no link at all, never as a query. */
export function patientDeepLinkId(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value || !PATIENT_ID.test(value)) return null;
  return value;
}

/** Only a patient we actually resolved may fill the form. */
export function deepLinkPatientId(link: DeepLinkedPatient | null): string {
  return link && !link.lookupFailed && link.name ? link.id : "";
}

/** The loaded option list wins; the deep-linked row is the fallback the list may not contain. */
export function deepLinkPickerLabel(
  options: { id: string; label: string }[],
  patientId: string,
  link: DeepLinkedPatient | null,
): string {
  return options.find((option) => option.id === patientId)?.label ?? link?.name ?? "—";
}

export function withoutPatientParam(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("patient_id");
  return next;
}

export type DeepLinkBanner = {
  title: string;
  detail: string;
  action: string;
  dismiss: string;
} | null;

export function deepLinkBanner(lang: "ar" | "en", link: DeepLinkedPatient | null): DeepLinkBanner {
  if (!link) return null;
  const en = lang === "en";
  if (link.lookupFailed) {
    return {
      title: en ? "This booking link could not be checked" : "لم يتم التحقق من رابط الحجز",
      detail: en
        ? "The patient lookup failed, so nothing was filled in. Open the booking form and pick the patient."
        : "فشل التحقق من المريض لذلك لم يُملأ أي حقل. افتح نموذج الموعد واختر المريض.",
      action: en ? "New appointment" : "موعد جديد",
      dismiss: en ? "Dismiss" : "إغلاق",
    };
  }
  if (!link.name) {
    return {
      title: en ? "This patient is not bookable here" : "هذا المريض غير متاح للحجز هنا",
      detail: en
        ? "No active patient matches the link -- it may have been deleted or belongs to another clinic."
        : "لا يوجد مريض نشط مطابق للرابط؛ ربما تم حذفه أو يتبع عيادة أخرى.",
      action: en ? "New appointment" : "موعد جديد",
      dismiss: en ? "Dismiss" : "إغلاق",
    };
  }
  return {
    title: en ? `Booking for ${link.name}` : `الحجز للمريض ${link.name}`,
    detail: en
      ? "The patient is filled in for a new appointment. Clear this to book for someone else."
      : "تم اختيار المريض تلقائيًا عند إنشاء موعد جديد. ألغِ هذا للحجز لمريض آخر.",
    action: en ? `New appointment for ${link.name}` : `موعد جديد للمريض ${link.name}`,
    dismiss: en ? "Clear patient" : "إلغاء اختيار المريض",
  };
}

export type PatientNameRow = PatientNameFields & { id: string };
