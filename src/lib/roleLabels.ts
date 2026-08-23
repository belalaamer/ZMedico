export type SupportedLanguage = "ar" | "en";

const ROLE_LABELS: Record<string, { ar: string; en: string }> = {
  system_owner: { ar: "مسؤول المنصة", en: "System Owner" },
  admin: { ar: "مسؤول العيادة", en: "Clinic Admin" },
  manager: { ar: "مدير الفرع", en: "Branch Manager" },
  doctor: { ar: "طبيب", en: "Doctor" },
  nurse: { ar: "تمريض", en: "Nurse" },
  receptionist: { ar: "استقبال", en: "Receptionist" },
  accountant: { ar: "محاسب", en: "Accountant" },
  hr: { ar: "الموارد البشرية", en: "HR" },
};

export function roleLabel(role: string, lang: SupportedLanguage): string {
  return ROLE_LABELS[role]?.[lang] ?? role;
}
