// Every appointment, reminder, and notification timestamp is shown on the
// clinic's clock, not the viewer's machine clock: the database writes in UTC
// and the desk is in Africa/Cairo. The 12-hour clock is mandatory here; the
// Arabic marker is م/ص with Latin digits, matching the notification text the
// database renders.
export const CLINIC_TIME_ZONE = "Africa/Cairo";

const CLINIC_LOCALE: Record<"ar" | "en", string> = {
  ar: "ar-EG-u-nu-latn",
  en: "en-US",
};

export function formatClinicTimestamp(value: string | Date, lang: "ar" | "en"): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(CLINIC_LOCALE[lang], {
    timeZone: CLINIC_TIME_ZONE,
    hour12: true,
  });
}
