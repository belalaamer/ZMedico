export type TenantLanguage = "ar" | "en";

export type TenantNameFields = {
  name?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
  display_name?: string | null;
};

export function localizedTenantName(item: TenantNameFields | null | undefined, language: TenantLanguage, fallback = "ZMedico") {
  if (!item) return fallback;
  const custom = item.display_name?.trim();
  if (custom) return custom;
  const preferred = language === "ar" ? item.name_ar : item.name_en;
  const alternate = language === "ar" ? item.name_en : item.name_ar;
  return preferred?.trim() || alternate?.trim() || item.name?.trim() || fallback;
}
