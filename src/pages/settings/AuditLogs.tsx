import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ListSkeleton } from "@/components/ListSkeleton";
import { TablePager } from "@/components/TablePager";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { formatMoney } from "@/lib/format";
import { patientDisplayName } from "@/lib/patientName";
import { Info, AlertTriangle, ExternalLink } from "lucide-react";

const PAGE_SIZE = 10;

type Actor = { full_name: string | null; email: string | null } | null;

type AuditRow = {
  id: string;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  user_id: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  /** Resolved separately — see the note on load(). Absent when the actor's
   *  account has since been deleted. */
  actor?: Actor;
};

/** A batch-resolved person: same shape as `Actor`, looked up by any id
 *  (an actor's user_id, a staff_profiles.id, or a user_role's target
 *  user_id) against the single shared `profiles` map built in load(). */
type PersonMap = Map<string, Actor>;

// --- Entity display & navigation -------------------------------------------
// audit_logs.entity_type is written by many different call sites across the
// app (some historical, some current), so the same kind of record shows up
// under more than one spelling (e.g. "invoice" and "invoices"). This map
// normalizes those spellings to one bilingual label so the column reads the
// same regardless of which code path wrote the row.
//
// ENTITY_ROUTES only lists entity types that (a) have a real, existing
// detail route in src/App.tsx and (b) are known to store that route's :id
// param as entity_id. Anything not listed here still shows its id — it is
// just not turned into a link, because a link to a route that does not
// exist (or to the wrong id) would be worse than no link at all.
const ENTITY_LABELS: Record<string, { ar: string; en: string }> = {
  invoice: { ar: "فاتورة", en: "Invoice" },
  invoices: { ar: "فاتورة", en: "Invoice" },
  payment: { ar: "دفعة", en: "Payment" },
  payments: { ar: "دفعة", en: "Payment" },
  patient: { ar: "مريض", en: "Patient" },
  patients: { ar: "مريض", en: "Patient" },
  treasury_transaction: { ar: "حركة خزينة", en: "Treasury transaction" },
  user_role: { ar: "دور مستخدم", en: "User role" },
  user_roles: { ar: "دور مستخدم", en: "User role" },
  user_role_assignment: { ar: "تعيين دور", en: "Role assignment" },
  role_permission: { ar: "صلاحية دور", en: "Role permission" },
  auth_user: { ar: "حساب مستخدم", en: "User account" },
  bulk_export: { ar: "تصدير مجمّع", en: "Bulk export" },
  staff_profile_sensitive: { ar: "بيانات موظف حساسة", en: "Staff sensitive data" },
  staff_profiles: { ar: "موظف", en: "Staff" },
  medical_record: { ar: "سجل طبي", en: "Medical record" },
  medical_records: { ar: "سجل طبي", en: "Medical record" },
  products: { ar: "منتج", en: "Product" },
  // Written by StaffDetail.tsx when a staff record is linked/unlinked from a
  // login account. entity_id there is not consistently one table's primary
  // key (it is the linked user's id on link/unlink, or the staff id as a
  // fallback), so this only gets a label, never a route.
  user_employee_link: { ar: "ربط موظف بمستخدم", en: "Staff-user link" },
};

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  invoice: (id) => `/invoices/${id}`,
  invoices: (id) => `/invoices/${id}`,
  patient: (id) => `/patients/${id}`,
  patients: (id) => `/patients/${id}`,
  medical_record: (id) => `/medical/records/${id}`,
  medical_records: (id) => `/medical/records/${id}`,
  products: (id) => `/inventory/products/${id}`,
  staff_profiles: (id) => `/hr/staff/${id}`,
  staff_profile_sensitive: (id) => `/hr/staff/${id}`,
};

function entityLabel(entityType: string | null, lang: "ar" | "en" | string) {
  if (!entityType) return "—";
  const known = ENTITY_LABELS[entityType];
  if (known) return lang === "ar" ? known.ar : known.en;
  // Unknown/unmapped entity_type: fall back to the raw value, prettified,
  // rather than hiding it — an unfamiliar label is still more honest than
  // guessing at a translation we are not sure of.
  return entityType.replace(/_/g, " ");
}

function entityRoute(entityType: string | null, entityId: string | null) {
  if (!entityType || !entityId) return null;
  const build = ENTITY_ROUTES[entityType];
  return build ? build(entityId) : null;
}

// A field is read from new_values first, then old_values. This covers every
// action shape written by the triggers: create/update rows carry the current
// value in new_values; delete/revoke rows (e.g. role_revoked, soft_delete)
// often only carry it in old_values.
function auditField(row: AuditRow, field: string): any {
  return row.new_values?.[field] ?? row.old_values?.[field] ?? null;
}

function personDisplayName(person: Actor, hadId: boolean, lang: "ar" | "en" | string) {
  if (person?.full_name) return person.full_name;
  if (person?.email) return person.email;
  return hadId ? (lang === "ar" ? "مستخدم محذوف" : "Deleted user") : null;
}


/** Batch-resolved lookup tables, one per entity kind we know how to name. */
type RecordMaps = {
  profiles: PersonMap;
  invoices: Map<string, { invoiceNumber: string | null }>;
  patients: Map<string, { name: string; code: number | string | null }>;
  medicalRecordPatients: Map<string, { name: string; code: number | string | null } | null>;
  products: Map<string, { name: string }>;
  staff: Map<string, { employeeId: string | null }>;
};

const EMPTY_MAPS: RecordMaps = {
  profiles: new Map(),
  invoices: new Map(),
  patients: new Map(),
  medicalRecordPatients: new Map(),
  products: new Map(),
  staff: new Map(),
};

/**
 * Turns an audit row into a human-readable "what/whom" label, or null when
 * there isn't a safe, proven way to name the record. Callers fall back to
 * plain entity_type + id when this returns null — never a guess.
 */
function resolveRecordLabel(row: AuditRow, lang: "ar" | "en" | string, maps: RecordMaps): string | null {
  const type = row.entity_type;
  const id = row.entity_id;
  if (!type) return null;
  const label = entityLabel(type, lang);

  switch (type) {
    case "invoice":
    case "invoices": {
      const inv = id ? maps.invoices.get(id) : undefined;
      if (!inv?.invoiceNumber) return null;
      return `${label} — ${inv.invoiceNumber}`;
    }
    case "patient":
    case "patients": {
      const p = id ? maps.patients.get(id) : undefined;
      if (!p?.name) return null;
      return `${label} — ${p.name}${p.code != null ? ` — #${p.code}` : ""}`;
    }
    case "medical_record":
    case "medical_records": {
      const p = id ? maps.medicalRecordPatients.get(id) : undefined;
      if (!p?.name) return null;
      return `${label} — ${p.name}`;
    }
    case "products": {
      const prod = id ? maps.products.get(id) : undefined;
      if (!prod?.name) return null;
      return `${label} — ${prod.name}`;
    }
    case "staff_profiles":
    case "staff_profile_sensitive": {
      // StaffDetail.tsx resolves the header name via profiles.id === staff_profiles.id
      // (a real FK: staff_profiles_id_fkey -> profiles), so that is used first;
      // employee_id (always present) is the safe fallback.
      const person = id ? maps.profiles.get(id) : undefined;
      const staff = id ? maps.staff.get(id) : undefined;
      const who = person?.full_name || staff?.employeeId;
      if (!who) return null;
      return `${label} — ${who}`;
    }
    case "user_role":
    case "user_roles":
    case "user_role_assignment": {
      const role = auditField(row, "role");
      const targetId = auditField(row, "user_id");
      if (!role) return null;
      const who = personDisplayName(targetId ? maps.profiles.get(targetId) ?? null : null, !!targetId, lang);
      return [label, role, who].filter(Boolean).join(" — ");
    }
    case "role_permission": {
      const role = auditField(row, "role");
      const module = auditField(row, "module");
      if (!role && !module) return null;
      return [label, role, module].filter(Boolean).join(" — ");
    }
    case "treasury_transaction": {
      const txType = auditField(row, "transaction_type");
      const amount = auditField(row, "amount");
      if (amount == null && !txType) return null;
      const amountLabel = amount != null ? formatMoney(amount, lang === "ar" ? "ar" : "en") : null;
      return [label, txType, amountLabel].filter(Boolean).join(" — ");
    }
    case "payment":
    case "payments": {
      const method = auditField(row, "payment_method");
      const amount = auditField(row, "amount");
      if (amount == null && !method) return null;
      const amountLabel = amount != null ? formatMoney(amount, lang === "ar" ? "ar" : "en") : null;
      return [label, method, amountLabel].filter(Boolean).join(" — ");
    }
    case "auth_user":
      // These rows are always admin_delete_user: the account is gone by
      // definition, so there is no reliable name left to show.
      return lang === "ar" ? "مستخدم محذوف" : "Deleted User";
    default:
      // bulk_export, user_employee_link, and anything not yet seen: no safe
      // identity to show. Entity type + action are already visible in their
      // own columns; the id stays as plain text (handled by the caller).
      return null;
  }
}

function actionTone(action: string | null) {
  const a = (action ?? "").toLowerCase();
  if (a === "create" || a === "insert") {
    return "bg-success/15 text-success border-success/30";
  }
  if (a === "update") {
    return "bg-info/15 text-info border-info/30";
  }
  if (a === "delete") {
    return "bg-destructive/15 text-destructive border-destructive/30";
  }
  return "";
}

function initials(name?: string | null, fallback?: string | null) {
  const src = (name || fallback || "?").trim();
  const parts = src.split(/\s+/).slice(0, 2);
  return parts.map(p => p.charAt(0).toUpperCase()).join("") || "?";
}

function formatDateCell(iso: string, lang: "ar" | "en" | string) {
  const d = new Date(iso);
  const locale = lang === "ar" ? "ar" : "en-GB";
  return {
    date: d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "2-digit" }),
    time: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

export default function AuditLogs() {
  const { t, lang } = useI18n();
  const { currentBranchId, branchSelectionReady } = useBranch();
  const [items, setItems] = useState<AuditRow[]>([]);
  const [maps, setMaps] = useState<RecordMaps>(EMPTY_MAPS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;

    // The actor is resolved with a SECOND query rather than a PostgREST embed.
    //
    // This screen used to ask for `profiles(full_name, email)` inline, which
    // worked because audit_logs.user_id was a foreign key to profiles. That key
    // was deliberately removed: it carried ON DELETE SET NULL, so deleting an
    // employee tried to blank the actor on their own audit history, the
    // append-only guard refused, and the delete failed. An audit trail that
    // forgets who acted is not an audit trail, so the column is now a plain
    // historical uuid.
    //
    // Without the key PostgREST has no relationship to follow and answered
    // "Could not find a relationship between 'audit_logs' and 'profiles'".
    //
    // Looking the names up separately is also the more truthful shape: the id
    // is now allowed to point at someone who no longer exists, and that case
    // gets its own label below instead of silently rendering as blank.
    //
    // --- Record identity (this block) -----------------------------------
    // Same idea, extended: instead of one query per row (N+1), every id we
    // might need to name is collected first, grouped by what kind of lookup
    // it needs, and each group is fetched in a single batched `.in(...)`
    // query. Worst case for a 100-row page is the existing profiles query
    // (now also carrying staff ids and user_role targets) plus up to five
    // more — one per entity kind actually present on the page. Entity kinds
    // not present on the page never fire a query at all.
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      if (!branchSelectionReady || !currentBranchId) {
        setItems([]);
        setIsLoading(false);
        return;
      }

      let auditQuery = (supabase as any)
        .from("audit_logs")
        .select("id,branch_id,action,entity_type,entity_id,created_at,user_id,old_values,new_values")
        .order("created_at", { ascending: false })
        .limit(100)
        .eq("branch_id", currentBranchId);
      const { data, error } = await auditQuery;

      if (!active) return;

      // The `error` field was ignored here once. A permission denial then
      // rendered as an empty table, which is exactly how the July 2026 outage
      // stayed invisible. It is checked on both queries now.
      if (error) {
        setLoadError(error.message ?? "Unknown error");
        setItems([]);
        setIsLoading(false);
        return;
      }

      const rows = (data ?? []) as AuditRow[];

      // Actors (existing) + staff ids (staff_profiles.id === profiles.id via
      // a real FK) + user_role targets (embedded in the JSON diff) all share
      // one table, so they share one query.
      const profileIds = new Set<string>();
      rows.forEach(r => { if (r.user_id) profileIds.add(r.user_id); });

      const invoiceIds = new Set<string>();
      const patientIds = new Set<string>();
      const medicalRecordIds = new Set<string>();
      const productIds = new Set<string>();
      const staffIds = new Set<string>();

      rows.forEach(r => {
        const type = r.entity_type;
        const id = r.entity_id;
        if (!type || !id) return;
        if (type === "invoice" || type === "invoices") invoiceIds.add(id);
        else if (type === "patient" || type === "patients") patientIds.add(id);
        else if (type === "medical_record" || type === "medical_records") medicalRecordIds.add(id);
        else if (type === "products") productIds.add(id);
        else if (type === "staff_profiles" || type === "staff_profile_sensitive") {
          staffIds.add(id);
          profileIds.add(id);
        } else if (type === "user_role" || type === "user_roles" || type === "user_role_assignment") {
          const targetId = auditField(r, "user_id");
          if (targetId) profileIds.add(targetId);
        }
      });

      const noRows = { data: [] as any[], error: null as any };
      const [profilesRes, invoicesRes, patientsRes, medicalRecordsRes, productsRes, staffRes] = await Promise.all([
        profileIds.size
          ? (supabase as any).from("profiles").select("id,full_name,email").in("id", Array.from(profileIds))
          : Promise.resolve(noRows),
        invoiceIds.size
          ? supabase.from("invoices").select("id,invoice_number").in("id", Array.from(invoiceIds)).eq("branch_id", currentBranchId)
          : Promise.resolve(noRows),
        patientIds.size
          ? supabase.from("patients").select("id,first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code").in("id", Array.from(patientIds)).eq("branch_id", currentBranchId)
          : Promise.resolve(noRows),
        medicalRecordIds.size
          ? (supabase as any).from("medical_records")
              .select("id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code)")
              .in("id", Array.from(medicalRecordIds))
              .eq("branch_id", currentBranchId)
          : Promise.resolve(noRows),
        productIds.size
          ? supabase.from("products").select("id,name_en,name_ar").in("id", Array.from(productIds))
          : Promise.resolve(noRows),
        staffIds.size
          ? (supabase as any).from("staff_profiles").select("id,employee_id").in("id", Array.from(staffIds)).eq("branch_id", currentBranchId)
          : Promise.resolve(noRows),
      ]);

      if (!active) return;

      // A failure here costs the names, not the log. The entries are the
      // record; showing them with ids beats showing nothing, so this is
      // surfaced as a warning and the table still renders.
      if (profilesRes.error) {
        setLoadError(
          (lang === "ar"
            ? "تعذّر تحميل أسماء المستخدمين؛ السجل معروض بالمعرّفات. "
            : "Could not load user names; the log is shown with ids. ") +
          (profilesRes.error.message ?? ""),
        );
      }

      const profiles: PersonMap = new Map(
        ((profilesRes.data ?? []) as any[]).map(p => [
          p.id as string,
          { full_name: p.full_name ?? null, email: p.email ?? null } as Actor,
        ]),
      );

      // Secondary lookups (invoice/patient/medical record/product/staff)
      // degrade silently on failure: the row simply falls back to its plain
      // entity type + id, which is exactly the pre-existing behavior and
      // never misleading.
      const invoices = new Map(
        ((invoicesRes.data ?? []) as any[]).map(i => [i.id as string, { invoiceNumber: i.invoice_number ?? null }]),
      );
      const patients = new Map(
        ((patientsRes.data ?? []) as any[]).map(p => [
          p.id as string,
          { name: patientDisplayName(p, lang), code: p.patient_code ?? null },
        ]),
      );
      const medicalRecordPatients = new Map(
        ((medicalRecordsRes.data ?? []) as any[]).map(r => [
          r.id as string,
          r.patients ? { name: patientDisplayName(r.patients, lang), code: r.patients.patient_code ?? null } : null,
        ]),
      );
      const products = new Map(
        ((productsRes.data ?? []) as any[]).map(p => [
          p.id as string,
          { name: (lang === "ar" ? p.name_ar : p.name_en) || p.name_en || p.name_ar || "" },
        ]),
      );
      const staff = new Map(
        ((staffRes.data ?? []) as any[]).map(s => [s.id as string, { employeeId: s.employee_id ?? null }]),
      );

      setMaps({ profiles, invoices, patients, medicalRecordPatients, products, staff });
      setItems(rows.map(r => ({
        ...r,
        actor: r.user_id ? profiles.get(r.user_id) ?? null : null,
      })));
      setIsLoading(false);
    };

    load().catch((err: any) => {
      if (!active) return;
      setLoadError(err?.message ?? "Request failed");
      setItems([]);
      setIsLoading(false);
    });

    return () => { active = false; };
  }, [lang, currentBranchId]);

  const entityTypes = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => { if (i.entity_type) s.add(i.entity_type); });
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => items.filter(i => {
    if (actionFilter !== "all" && (i.action ?? "").toLowerCase() !== actionFilter) return false;
    if (entityFilter !== "all" && (i.entity_type ?? "") !== entityFilter) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = [
        i.entity_type, i.action, i.entity_id, i.user_id,
        i.actor?.full_name, i.actor?.email,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }), [items, q, actionFilter, entityFilter]);

  useEffect(() => { setPage(0); }, [q, actionFilter, entityFilter]);

  const total = filtered.length;
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{t("auditLogs")}</h1>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm flex gap-2">
          <Info className="size-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-muted-foreground">
            {lang === "ar"
              ? "سجل التدقيق مخصص للقراءة فقط (إلحاق دائم). لا يتم حذف أو تعديل أي إدخال. يتم الاحتفاظ بآخر 100 إدخال هنا للعرض السريع؛ السجل الكامل متاح في قاعدة البيانات."
              : "The audit log is append-only — entries cannot be edited or deleted. This view shows the latest 100 events for fast review; the full history is retained in the database."}
          </p>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm flex gap-2">
            <AlertTriangle className="size-4 mt-0.5 text-destructive shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-destructive">
                {lang === "ar" ? "تعذّر تحميل سجل التدقيق" : "Could not load the audit log"}
              </p>
              <p className="text-muted-foreground break-words">{loadError}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          <Input
            className="w-full md:w-72"
            placeholder={t("search")}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل الإجراءات" : "All actions"}</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="insert">Insert</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل الكيانات" : "All entities"}</SelectItem>
              {entityTypes.map(e => (
                <SelectItem key={e} value={e}>{entityLabel(e, lang)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-4"><ListSkeleton rows={8} /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[180px]">{lang === "ar" ? "التاريخ / الوقت" : "Date / Time"}</TableHead>
                      <TableHead>{lang === "ar" ? "المستخدم" : "User"}</TableHead>
                      <TableHead className="w-[120px]">{lang === "ar" ? "الإجراء" : "Action"}</TableHead>
                      <TableHead className="w-[160px]">{lang === "ar" ? "نوع الكيان" : "Entity type"}</TableHead>
                      <TableHead>{lang === "ar" ? "السجل" : "Record"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map(i => {
                      const { date, time } = formatDateCell(i.created_at, lang);
                      // Three distinct cases, and they mean different things:
                      //   - a known person
                      //   - an id with no profile: the account was deleted, and
                      //     keeping the id is the whole reason the key was dropped
                      //   - no id at all: the system acted, not a person
                      const deletedActor = lang === "ar" ? "حساب محذوف" : "Deleted account";
                      const systemActor = lang === "ar" ? "النظام" : "System";
                      const displayName = i.actor?.full_name
                        || i.actor?.email
                        || (i.user_id ? deletedActor : systemActor);
                      const subLabel = i.actor?.full_name
                        ? i.actor?.email
                        : (i.actor?.email ? null : i.user_id);
                      const recordHref = entityRoute(i.entity_type, i.entity_id);
                      const recordLabel = resolveRecordLabel(i, lang, maps);
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="align-top">
                            <div className="text-sm font-medium tabular-nums">{date}</div>
                            <div className="text-xs text-muted-foreground tabular-nums">{time}</div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="size-7 shrink-0">
                                <AvatarFallback className="text-[10px]">
                                  {initials(i.actor?.full_name, i.actor?.email ?? i.user_id)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className={`text-sm font-medium truncate ${!i.actor && i.user_id ? "text-muted-foreground italic" : ""}`}>
                                  {displayName}
                                </div>
                                {subLabel && (
                                  <div className="text-xs text-muted-foreground truncate font-mono">{subLabel}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline" className={`capitalize ${actionTone(i.action)}`}>
                              {i.action ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline" className="capitalize" title={i.entity_type ?? undefined}>
                              {entityLabel(i.entity_type, lang)}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            {recordLabel ? (
                              recordHref ? (
                                <Link
                                  to={recordHref}
                                  className="flex flex-col gap-0.5 max-w-[220px] sm:max-w-[280px] text-primary hover:underline"
                                >
                                  <span className="inline-flex items-center gap-1 text-sm font-medium capitalize">
                                    <ExternalLink className="size-3.5 shrink-0" />
                                    <span className="truncate">{recordLabel}</span>
                                  </span>
                                  {i.entity_id && (
                                    <span
                                      className="text-[11px] text-muted-foreground font-mono truncate"
                                      title={i.entity_id}
                                    >
                                      {i.entity_id}
                                    </span>
                                  )}
                                </Link>
                              ) : (
                                <div className="flex flex-col gap-0.5 max-w-[220px] sm:max-w-[280px]">
                                  <span className="text-sm font-medium capitalize truncate">{recordLabel}</span>
                                  {i.entity_id && (
                                    <span
                                      className="text-[11px] text-muted-foreground font-mono truncate"
                                      title={i.entity_id}
                                    >
                                      {i.entity_id}
                                    </span>
                                  )}
                                </div>
                              )
                            ) : (
                              <div
                                className="text-xs text-muted-foreground font-mono truncate max-w-[240px]"
                                title={i.entity_id ?? undefined}
                              >
                                {i.entity_id ?? "—"}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {pageRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="p-8 text-center text-muted-foreground">
                          {loadError
                            ? (lang === "ar" ? "لم يتم تحميل البيانات بسبب خطأ" : "Data could not be loaded due to an error")
                            : t("noData")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </>
          )}
        </Card>
      </div>
    </SettingsLayout>
  );
}
