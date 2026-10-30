import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Combobox } from "@/components/ui/combobox";
import { supabase } from "@/integrations/supabase/client";
import { usePatientSearch } from "@/hooks/usePatientSearch";
import {
  PATIENT_PICKER_LIMIT,
  fetchPatientOption,
  patientPickerCopy,
  pickedPatientLabel,
  type PatientOption,
} from "@/lib/patientSearch";

/**
 * Searchable picker for another patient (used as "Referred by").
 * - Asks the branch's patients that match the typed name or phone, a page at a time.
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
  const copy = patientPickerCopy(lang);
  const patientSearch = usePatientSearch({
    ready: Boolean(branchId),
    branchId: branchId ?? null,
    lang,
  });
  const [echo, setEcho] = useState<PatientOption | null>(null);

  // The referrer a form already holds is rarely on the page the search returns,
  // and the box must still name them. Only for a referral that is allowed in the
  // first place: echoing the patient themselves would let a self-referral back in
  // through the label the list deliberately hides.
  useEffect(() => {
    if (!value || value === excludeId) {
      setEcho(null);
      return;
    }
    let active = true;
    void fetchPatientOption(supabase, { id: value, lang }).then((row) => {
      if (active) setEcho(row);
    });
    return () => { active = false; };
  }, [value, excludeId, lang]);

  const options = patientSearch.options
    .filter((p) => !excludeId || p.id !== excludeId)
    .map((p) => ({
      value: p.id,
      label: p.label,
      // Names repeat; the number they were found by tells the desk which one.
      detail: p.phone ?? undefined,
    }));

  return (
    <Combobox
      value={value ?? ""}
      onChange={(v) => onChange(v || null)}
      options={options}
      placeholder={placeholder ?? "—"}
      searchPlaceholder={searchPlaceholder ?? (lang === "ar" ? "ابحث عن مريض..." : "Search patient...")}
      emptyText={patientSearch.failed ? copy.failed : copy.empty}
      searchingText={copy.searching}
      hintText={patientSearch.options.length >= PATIENT_PICKER_LIMIT ? copy.truncated : undefined}
      selectedLabel={pickedPatientLabel(echo, patientSearch.options, value ?? "")}
      searching={patientSearch.searching}
      onSearch={patientSearch.search}
    />
  );
}
