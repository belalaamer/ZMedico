import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSearch } from "@/lib/sanitizeSearch";
import { patientDisplayName, type PatientNameFields } from "@/lib/patientName";

/**
 * One patient-matching rule for the whole app.
 *
 * Before this, three surfaces each held their own copy of the same seven-column
 * `ilike` predicate (`globalSearch.searchPatients`, `Patients.tsx`, and the
 * picker loaders, which had none at all), so a picker could not find a patient
 * the search bar could -- and the pickers solved "who is in this clinic" by
 * loading the newest 200 or 500 rows and filtering them in the browser. Past
 * that ceiling a patient simply does not exist for the desk.
 *
 * The rule is deliberately the same one `Patients.tsx` already runs against
 * Production: sanitized, branch-scoped, soft-delete-aware, newest first. No RPC
 * and no migration: `patients_select_scoped` already enforces
 * `user_has_branch_access(branch_id)`, so the policy bounds the result set
 * exactly as it bounds the patients list.
 */

export const PATIENT_SEARCH_SELECT =
  "id,patient_code,first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,phone,phone2,email";

/** Rows a picker needs; every column is in PATIENT_SEARCH_SELECT. */
export type PatientSearchRow = PatientNameFields & {
  id: string;
  patient_code?: number | null;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
};

export type PatientOption = { id: string; label: string };

/** A searchable row plus the phone the desk may need to tell two names apart. */
export type PatientSearchHit = PatientOption & { phone: string | null };

/** A whole number is a clinic code, so `#412` finds patient 412 exactly. */
function isDigits(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * The PostgREST `.or()` filter for a free-text patient query, or null when the
 * query asks for nothing. Sanitized first: an unsanitized comma would close the
 * `or(...)` group and let the rest of the string become filter syntax.
 *
 * A term that is only spaces asks for nothing rather than for a name containing
 * three spaces, which would read to the desk as "nobody matches".
 */
export function patientSearchFilter(term: string | null | undefined): string | null {
  const safe = sanitizeSearch((term ?? "").trim());
  if (!safe) return null;
  const clauses = [
    "first_name_en",
    "last_name_en",
    "first_name_ar",
    "last_name_ar",
    "phone",
    "phone2",
    "email",
  ].map((column) => `${column}.ilike.%${safe}%`);
  if (isDigits(safe)) clauses.push(`patient_code.eq.${safe}`);
  return clauses.join(",");
}

export type PatientSearchOutcome = {
  rows: PatientSearchRow[];
  /** The database said no. A failed read must not be shown as "no patients". */
  error: { message: string } | null;
};

export async function searchPatientRows(
  client: SupabaseClient,
  input: { q: string; branchId: string | null; limit: number },
): Promise<PatientSearchOutcome> {
  if (!input.branchId || input.limit <= 0) return { rows: [], error: null };
  let query = client
    .from("patients")
    .select(PATIENT_SEARCH_SELECT)
    .is("deleted_at", null)
    .eq("branch_id", input.branchId);
  const filter = patientSearchFilter(input.q);
  if (filter) query = query.or(filter);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(input.limit);
  if (error) return { rows: [], error };
  return { rows: (data ?? []) as PatientSearchRow[], error: null };
}

/** Labels are the localized name pair, never a stored language of the row. */
export function toPatientOptions(rows: PatientSearchRow[], lang: "ar" | "en"): PatientSearchHit[] {
  return rows.map((row) => ({
    id: row.id,
    label: patientDisplayName(row, lang),
    phone: row.phone ?? null,
  }));
}

/**
 * The name to show for the selected id.
 *
 * A server-side list is one page of matches, so the patient the form is holding is
 * usually not on it -- and a picker that answers "nothing selected" about a patient
 * who is very much selected is how a desk double-books somebody else. `picked` is
 * the row the desk chose (or the appointment being edited), which outlives the page
 * it came from.
 */
export function pickedPatientLabel(
  picked: PatientOption | null,
  options: PatientOption[],
  patientId: string,
): string | null {
  if (!patientId) return null;
  if (picked?.id === patientId) return picked.label;
  return options.find((option) => option.id === patientId)?.label ?? null;
}

/**
 * One patient, by id, named the way the pickers name them.
 *
 * A search page is a page, so the row a form is already holding -- picked from a
 * URL, or stored on an existing invoice -- is usually not on it. This is how that
 * row gets its label back without loading the clinic to find one person.
 */
export async function fetchPatientOption(
  client: SupabaseClient,
  input: { id: string; lang: "ar" | "en" },
): Promise<PatientSearchHit | null> {
  if (!input.id) return null;
  const { data, error } = await client
    .from("patients")
    .select(PATIENT_SEARCH_SELECT)
    .is("deleted_at", null)
    .eq("id", input.id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as PatientSearchRow;
  return { id: row.id, label: patientDisplayName(row, input.lang), phone: row.phone ?? null };
}

/**
 * How many rows a picker keeps in the browser. Deliberately small: it is now a
 * page of matches, not the whole clinic.
 */
export const PATIENT_PICKER_LIMIT = 25;

export type PatientPickerCopy = {
  searchPlaceholder: string;
  searching: string;
  empty: string;
  failed: string;
  truncated: string;
};

export function patientPickerCopy(lang: "ar" | "en"): PatientPickerCopy {
  const en = lang === "en";
  return {
    searchPlaceholder: en ? "Name or phone number" : "ابحث بالاسم أو رقم الهاتف",
    searching: en ? "Searching…" : "جارٍ البحث…",
    empty: en ? "No matching patients" : "لا يوجد مرضى مطابقون",
    failed: en ? "The search failed. Try again." : "فشل البحث. حاول مرة أخرى.",
    truncated: en
      ? "Showing the first matches only — keep typing a name or phone number"
      : "عرض أوائل النتائج فقط — أكمل كتابة الاسم أو رقم الهاتف",
  };
}
