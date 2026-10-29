import type { Database } from "@/integrations/supabase/types";

export type SupportedLanguage = "ar" | "en";

// Typed over the `app_role` enum so adding a Postgres role stops compilation
// until the desk has a word for it, instead of leaking `staff`-style raw
// values onto the Arabic screen.
const ROLE_LABELS: Record<Database["public"]["Enums"]["app_role"], { ar: string; en: string }> = {
  system_owner: { ar: "مسؤول المنصة", en: "System Owner" },
  admin: { ar: "مسؤول العيادة", en: "Clinic Admin" },
  manager: { ar: "مدير الفرع", en: "Branch Manager" },
  doctor: { ar: "طبيب", en: "Doctor" },
  nurse: { ar: "تمريض", en: "Nurse" },
  receptionist: { ar: "استقبال", en: "Receptionist" },
  accountant: { ar: "محاسب", en: "Accountant" },
  hr: { ar: "الموارد البشرية", en: "HR" },
  staff: { ar: "موظف", en: "Staff" },
};

export function roleLabel(role: string, lang: SupportedLanguage): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS]?.[lang] ?? role;
}
