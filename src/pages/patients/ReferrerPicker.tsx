import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Combobox } from "@/components/ui/combobox";
import { supabase } from "@/integrations/supabase/client";
import { patientDisplayName } from "@/lib/patientName";

/**
 * Searchable picker for another patient (used as "Referred by").
 * - Loads up to 500 patients from the current branch / non-deleted.
 * - Excludes `excludeId` to enforce the self-referral rule at the UI level.
 */
export function ReferrerPicker({
  value, onChange, excludeId, branchId, placeholder, searchPlaceholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  excludeId?: string | null;
  branchId?: string | null;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const { lang } = useI18n();
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      let q = (supabase as any)
        .from("patients")
        .select("id,patient_code,first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,phone,deleted_at,branch_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      if (!active) return;
      const rows = (data ?? [])
        .filter((p: any) => !excludeId || p.id !== excludeId)
        .map((p: any) => {
          const name = patientDisplayName(p, lang);
          const phone = p.phone ? ` · ${p.phone}` : "";
          return { value: p.id, label: `${name}${phone}` };
        });
      // Keep current value selectable even if it's outside the page window.
      if (value && !rows.find((r) => r.value === value)) {
        const { data: cur } = await (supabase as any)
          .from("patients")
          .select("id,patient_code,first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,phone")
          .eq("id", value)
          .maybeSingle();
        if (cur) {
          rows.unshift({
            value: cur.id,
            label: `${patientDisplayName(cur, lang)}${cur.phone ? " · " + cur.phone : ""}`,
          });
        }
      }
      setOptions(rows);
    })();
    return () => { active = false; };
  }, [branchId, excludeId, value, lang]);

  return (
    <Combobox
      value={value ?? ""}
      onChange={(v) => onChange(v || null)}
      options={options}
      placeholder={placeholder ?? "—"}
      searchPlaceholder={searchPlaceholder ?? "Search patient..."}
    />
  );
}
