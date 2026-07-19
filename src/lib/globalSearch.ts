import { supabase } from "@/integrations/supabase/client";
import { sanitizeSearch } from "@/lib/sanitizeSearch";

export type SearchHit = {
  id: string;
  label: string;
  sub?: string;
  to: string;
};

export type SearchGroupKey =
  | "patients" | "invoices" | "appointments"
  | "payments" | "medical_records" | "prescriptions" | "staff";

export type SearchGroup = { key: SearchGroupKey; module: string; hits: SearchHit[] };

const LIMIT = 5;
const ASSOC_LIMIT = 10;

function patientName(p: any, lang: "en" | "ar"): string {
  if (!p) return "—";
  const en = `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim();
  const ar = `${p.first_name_ar ?? ""} ${p.last_name_ar ?? ""}`.trim();
  return lang === "ar" ? (ar || en || "—") : (en || ar || "—");
}

function isDigits(q: string): boolean {
  return /^\d+$/.test(q);
}

// PostgREST filter-injection sanitizer. Delegates to the shared helper so
// every search surface (globalSearch, medication search, etc.) applies the
// exact same rule: strip filter meta-chars + LIKE wildcards + single quotes,
// then cap at 60 chars.
const esc = sanitizeSearch;

export async function searchPatients(
  q: string,
  branchId: string | null,
  lang: "en" | "ar",
): Promise<SearchHit[]> {
  const eq = esc(q);
  const ors = [
    `first_name_en.ilike.%${eq}%`,
    `last_name_en.ilike.%${eq}%`,
    `first_name_ar.ilike.%${eq}%`,
    `last_name_ar.ilike.%${eq}%`,
    `phone.ilike.%${eq}%`,
    `phone2.ilike.%${eq}%`,
    `email.ilike.%${eq}%`,
  ];
  if (isDigits(q)) ors.push(`patient_code.eq.${q}`);

  let query = supabase
    .from("patients")
    .select("id,patient_code,first_name_en,last_name_en,first_name_ar,last_name_ar,phone,email")
    .is("deleted_at", null)
    .or(ors.join(","))
    .limit(LIMIT);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as any[]).map((p) => ({
    id: p.id,
    label: `${patientName(p, lang)}  #${p.patient_code}`,
    sub: [p.phone, p.email].filter(Boolean).join(" · "),
    to: `/patients/${p.id}`,
  }));
}

/** Returns up to ASSOC_LIMIT patient ids matching q — used to scope joined searches. */
async function patientIdsMatching(q: string, branchId: string | null): Promise<string[]> {
  const eq = esc(q);
  const ors = [
    `first_name_en.ilike.%${eq}%`,
    `last_name_en.ilike.%${eq}%`,
    `first_name_ar.ilike.%${eq}%`,
    `last_name_ar.ilike.%${eq}%`,
    `phone.ilike.%${eq}%`,
    `phone2.ilike.%${eq}%`,
  ];
  if (isDigits(q)) ors.push(`patient_code.eq.${q}`);
  let query = supabase
    .from("patients")
    .select("id")
    .is("deleted_at", null)
    .or(ors.join(","))
    .limit(ASSOC_LIMIT);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data } = await query;
  return ((data ?? []) as any[]).map((r) => r.id);
}

export async function searchInvoices(
  q: string,
  branchId: string | null,
  lang: "en" | "ar",
): Promise<SearchHit[]> {
  const eq = esc(q);
  const patientIds = await patientIdsMatching(q, branchId);

  // Two simple queries: by invoice_number, and (if any patient matches) by patient_id IN (...)
  const queries: any[] = [];

  let qByNumber = supabase
    .from("invoices")
    .select("id,invoice_number,status,total,paid_amount,patient_id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
    .is("deleted_at", null)
    .ilike("invoice_number", `%${eq}%`)
    .limit(LIMIT);
  if (branchId) qByNumber = qByNumber.eq("branch_id", branchId);
  queries.push(qByNumber);

  if (patientIds.length) {
    let qByPatient = supabase
      .from("invoices")
      .select("id,invoice_number,status,total,paid_amount,patient_id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
      .is("deleted_at", null)
      .in("patient_id", patientIds)
      .order("issue_date", { ascending: false })
      .limit(LIMIT);
    if (branchId) qByPatient = qByPatient.eq("branch_id", branchId);
    queries.push(qByPatient);
  }

  const results = await Promise.all(queries);
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const r of results) {
    for (const inv of ((r?.data ?? []) as any[])) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);
      const due = Number(inv.total || 0) - Number(inv.paid_amount || 0);
      hits.push({
        id: inv.id,
        label: `${inv.invoice_number} · ${patientName(inv.patients, lang)}`,
        sub: `${inv.status}${due > 0 ? ` · ${lang === "ar" ? "متبقي" : "due"} ${due.toFixed(2)}` : ""}`,
        to: `/invoices/${inv.id}`,
      });
      if (hits.length >= LIMIT) return hits;
    }
  }
  return hits;
}

export async function searchAppointments(
  q: string,
  branchId: string | null,
  lang: "en" | "ar",
): Promise<SearchHit[]> {
  const patientIds = await patientIdsMatching(q, branchId);
  if (!patientIds.length) return [];
  // Recent window: last 7 days through 90 days ahead
  const from = new Date(); from.setDate(from.getDate() - 7);
  const to = new Date(); to.setDate(to.getDate() + 90);
  let query = supabase
    .from("appointments")
    .select("id,scheduled_at,status,procedure,patient_id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
    .is("deleted_at", null)
    .in("patient_id", patientIds)
    .gte("scheduled_at", from.toISOString())
    .lte("scheduled_at", to.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(LIMIT);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data } = await query;
  return ((data ?? []) as any[]).map((a) => {
    const d = new Date(a.scheduled_at);
    const dateStr = d.toLocaleString(lang === "ar" ? "ar-EG" : "en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const dayKey = d.toISOString().slice(0, 10);
    return {
      id: a.id,
      label: `${dateStr} · ${patientName(a.patients, lang)}`,
      sub: [a.procedure, a.status].filter(Boolean).join(" · "),
      to: `/calendar?date=${dayKey}&appt=${a.id}`,
    };
  });
}

export async function searchPayments(
  q: string,
  branchId: string | null,
  lang: "en" | "ar",
): Promise<SearchHit[]> {
  const patientIds = await patientIdsMatching(q, branchId);
  if (!patientIds.length) return [];
  let query = supabase
    .from("payments")
    .select("id,amount,payment_method,payment_date,patient_id,invoice_id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code),invoices(invoice_number)")
    .is("deleted_at", null)
    .in("patient_id", patientIds)
    .order("payment_date", { ascending: false })
    .limit(LIMIT);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data } = await query;
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    label: `${Number(p.amount || 0).toFixed(2)} · ${patientName(p.patients, lang)}`,
    sub: [p.payment_method, p.invoices?.invoice_number, p.payment_date].filter(Boolean).join(" · "),
    to: p.invoice_id ? `/invoices/${p.invoice_id}` : `/payments`,
  }));
}

export async function searchMedicalRecords(
  q: string,
  branchId: string | null,
  lang: "en" | "ar",
): Promise<SearchHit[]> {
  const patientIds = await patientIdsMatching(q, branchId);
  if (!patientIds.length) return [];
  let query = supabase
    .from("medical_records")
    .select("id,visit_date,status,patient_id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
    .in("patient_id", patientIds)
    .order("visit_date", { ascending: false })
    .limit(LIMIT);
  if (branchId) query = (query as any).eq("branch_id", branchId);
  const { data } = await query;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    label: `${patientName(r.patients, lang)}`,
    sub: [r.visit_date, r.status].filter(Boolean).join(" · "),
    to: `/medical/records/${r.id}`,
  }));
}

export async function searchPrescriptions(
  q: string,
  branchId: string | null,
  lang: "en" | "ar",
): Promise<SearchHit[]> {
  const patientIds = await patientIdsMatching(q, branchId);
  if (!patientIds.length) return [];
  let query = supabase
    .from("prescriptions")
    .select("id,issued_date,patient_id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
    .in("patient_id", patientIds)
    .order("issued_date", { ascending: false })
    .limit(LIMIT);
  if (branchId) query = (query as any).eq("branch_id", branchId);
  const { data } = await query;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    label: `${patientName(r.patients, lang)}`,
    sub: r.issued_date ?? "",
    to: `/medical/prescriptions/${r.id}`,
  }));
}

export async function searchStaff(
  q: string,
  _branchId: string | null,
  _lang: "en" | "ar",
): Promise<SearchHit[]> {
  const eq = esc(q);
  // Match by employee_id or phone in staff_profiles, plus full_name in profiles.
  const [profilesRes, staffRes] = await Promise.all([
    supabase.from("profiles").select("id,full_name").ilike("full_name", `%${eq}%`).limit(LIMIT),
    (supabase as any).from("staff_profiles")
      .select("id,user_id,employee_id,phone,profiles(full_name)")
      .or(`employee_id.ilike.%${eq}%,phone.ilike.%${eq}%`)
      .limit(LIMIT),
  ]);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const p of ((profilesRes?.data ?? []) as any[])) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    hits.push({ id: p.id, label: p.full_name || "—", to: `/hr/staff/${p.id}` });
  }
  for (const s of ((staffRes?.data ?? []) as any[])) {
    const uid = s.user_id || s.id;
    if (seen.has(uid)) continue;
    seen.add(uid);
    hits.push({
      id: s.id,
      label: s.profiles?.full_name || s.employee_id || "—",
      sub: [s.employee_id, s.phone].filter(Boolean).join(" · "),
      to: `/hr/staff/${uid}`,
    });
  }
  return hits.slice(0, LIMIT);
}