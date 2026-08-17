export type PatientNameFields = {
  first_name_en?: string | null;
  last_name_en?: string | null;
  first_name_ar?: string | null;
  last_name_ar?: string | null;
  name_language?: "ar" | "en" | null;
};

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function joinName(first?: string | null, last?: string | null): string {
  return [first, last].filter((part): part is string => Boolean(part?.trim())).join(" ").trim();
}

export function containsArabicScript(value: string | null | undefined): boolean {
  return Boolean(value && ARABIC_SCRIPT.test(value));
}

/**
 * Patient names are user-entered identity data, not UI copy.
 * Prefer the populated name whose script matches the original input. This
 * keeps an English-entered name in Latin script even when the app is Arabic,
 * and keeps an Arabic-entered name Arabic even when the app is English.
 * The UI language is only used when both stored translations use the same
 * script and therefore represent intentional bilingual values.
 */
export function patientDisplayName(
  patient: PatientNameFields | null | undefined,
  lang: "ar" | "en" = "en",
): string {
  if (!patient) return "—";

  const en = joinName(patient.first_name_en, patient.last_name_en);
  const ar = joinName(patient.first_name_ar, patient.last_name_ar);
  if (!en && !ar) return "—";
  if (!en || !ar || en === ar) return en || ar;
  if (patient.name_language === "ar") return ar;
  if (patient.name_language === "en") return en;

  const enHasArabic = containsArabicScript(en);
  const arHasArabic = containsArabicScript(ar);

  if (enHasArabic !== arHasArabic) return enHasArabic ? en : ar;
  if (!enHasArabic && !arHasArabic) return en;

  return lang === "ar" ? ar : en;
}

export function patientDisplayDirection(
  patient: PatientNameFields | null | undefined,
  lang: "ar" | "en" = "en",
): "rtl" | "ltr" {
  return containsArabicScript(patientDisplayName(patient, lang)) ? "rtl" : "ltr";
}
