import { containsArabicScript } from "./patientName";

export type DoctorNameFields = {
  full_name?: string | null;
  full_name_en?: string | null;
  full_name_ar?: string | null;
};

/** Display a doctor's complete localized name without mixing language fields. */
export function doctorDisplayName(
  doctor: DoctorNameFields | null | undefined,
  lang: "ar" | "en" = "en",
): string {
  if (!doctor) return "—";

  const en = doctor.full_name_en?.trim() || "";
  const ar = doctor.full_name_ar?.trim() || "";
  const legacy = doctor.full_name?.trim() || "";
  const matchesLanguage = (value: string) => lang === "ar"
    ? containsArabicScript(value) && !/[A-Za-z]/.test(value)
    : !containsArabicScript(value);
  const primary = lang === "ar" ? ar : en;
  const fallback = lang === "ar" ? en : ar;

  if (primary && matchesLanguage(primary)) return primary;
  if (fallback && matchesLanguage(fallback)) return fallback;
  if (legacy && matchesLanguage(legacy)) return legacy;
  return fallback || legacy || primary || "—";
}
