import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PATIENT_PICKER_LIMIT,
  searchPatientRows,
  toPatientOptions,
  type PatientSearchHit,
} from "@/lib/patientSearch";

export type PatientSearchPicker = {
  options: PatientSearchHit[];
  searching: boolean;
  failed: boolean;
  search: (term: string) => void;
  /** Re-run the last term, for realtime `patients` invalidations. */
  reload: () => void;
};

/**
 * Feeds a server-side patient picker: one bounded page of matches at a time.
 *
 * The caller owns when to ask (the combobox does it on open and on each debounced
 * keystroke); this holds the results and makes sure a slow answer to an older
 * query can never overwrite a faster answer to a newer one, which is what makes
 * typing "sa" then "sal" land on the right list rather than a half-typed one.
 */
export function usePatientSearch(input: {
  ready: boolean;
  branchId: string | null;
  lang: "ar" | "en";
  limit?: number;
}): PatientSearchPicker {
  const limit = input.limit ?? PATIENT_PICKER_LIMIT;
  const [options, setOptions] = useState<PatientSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const lastTerm = useRef("");

  // A branch or language change makes the rows we hold another clinic's, or named
  // in another script. Drop them instead of showing them until the next search lands.
  useEffect(() => {
    requestId.current += 1;
    setOptions([]);
    setSearching(false);
    setFailed(false);
  }, [input.branchId, input.lang]);

  const search = useCallback(
    async (term: string) => {
      const id = ++requestId.current;
      lastTerm.current = term;
      if (!input.ready || !input.branchId) {
        setOptions([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      setFailed(false);
      const { rows, error } = await searchPatientRows(supabase, {
        q: term,
        branchId: input.branchId,
        limit,
      });
      if (id !== requestId.current) return;
      setSearching(false);
      if (error) {
        setFailed(true);
        setOptions([]);
        return;
      }
      setOptions(toPatientOptions(rows, input.lang));
    },
    [input.ready, input.branchId, input.lang, limit],
  );

  const reload = useCallback(() => {
    void search(lastTerm.current);
  }, [search]);

  return { options, searching, failed, search: (term) => void search(term), reload };
}
