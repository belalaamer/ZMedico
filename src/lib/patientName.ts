export type PatientNameFields = {
  first_name_en?: string | null;
  last_name_en?: string | null;
  first_name_ar?: string | null;
  last_name_ar?: string | null;
  name_language?: "ar" | "en" | null;
};

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_SCRIPT = /[A-Za-z]/;

function joinName(first?: string | null, last?: string | null, lang?: "ar" | "en"): string {
  return [first, last]
    .filter((part): part is string => {
      const value = part?.trim();
      if (!value) return false;
      if (!lang) return true;
      return lang === "ar" ? containsArabicScript(value) && !LATIN_SCRIPT.test(value) : !containsArabicScript(value);
    })
    .join(" ")
    .trim();
}

export function containsArabicScript(value: string | null | undefined): boolean {
  return Boolean(value && ARABIC_SCRIPT.test(value));
}

/**
 * Patient names are displayed in the active UI language, not according to the
 * language of the row that was originally entered. The selected language is
 * always taken as a complete first/last-name pair, so a missing Arabic last
 * name never gets mixed with an English last-name initial (and vice versa).
 * If the localized pair is absent, the complete pair from the other language
 * is used as a safe fallback; this is preferable to inventing a translation.
 */
export function patientDisplayName(
  patient: PatientNameFields | null | undefined,
  lang: "ar" | "en" = "en",
): string {
  if (!patient) return "—";

  const rawEn = joinName(patient.first_name_en, patient.last_name_en);
  const rawAr = joinName(patient.first_name_ar, patient.last_name_ar);
  const en = joinName(patient.first_name_en, patient.last_name_en, "en");
  const ar = joinName(patient.first_name_ar, patient.last_name_ar, "ar");
  const candidates = lang === "ar" ? [ar, en, rawAr, rawEn] : [en, ar, rawEn, rawAr];
  const matchesLanguage = (value: string) => lang === "ar"
    ? containsArabicScript(value) && !LATIN_SCRIPT.test(value)
    : !containsArabicScript(value);

  return candidates.find((candidate) => candidate && matchesLanguage(candidate))
    || candidates.find(Boolean)
    || "—";
}

export function patientDisplayDirection(
  patient: PatientNameFields | null | undefined,
  lang: "ar" | "en" = "en",
): "rtl" | "ltr" {
  return containsArabicScript(patientDisplayName(patient, lang)) ? "rtl" : "ltr";
}
