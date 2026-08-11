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
  /** Resolved separately — see the note on load(). Absent when the actor's
   *  account has since been deleted. */
  actor?: Actor;
};

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
  staff_profiles: { ar: "ملف موظف", en: "Staff profile" },
  medical_record: { ar: "سجل طبي", en: "Medical record" },
  medical_records: { ar: "سجل طبي", en: "Medical record" },
  products: { ar: "منتج", en: "Product" },
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
  const [items, setItems] = useState<AuditRow[]>([]);
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
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);

      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("id,action,entity_type,entity_id,created_at,user_id")
        .order("created_at", { ascending: false })
        .limit(100);

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
      const ids = Array.from(
        new Set(rows.map(r => r.user_id).filter((v): v is string => !!v)),
      );

      let actors = new Map<string, Actor>();
      if (ids.length > 0) {
        const { data: profs, error: profErr } = await (supabase as any)
          .from("profiles")
          .select("id,full_name,email")
          .in("id", ids);

        if (!active) return;

        // A failure here costs the names, not the log. The entries are the
        // record; showing them with ids beats showing nothing, so this is
        // surfaced as a warning and the table still renders.
        if (profErr) {
          setLoadError(
            (lang === "ar"
              ? "تعذّر تحميل أسماء المستخدمين؛ السجل معروض بالمعرّفات. "
              : "Could not load user names; the log is shown with ids. ") +
            (profErr.message ?? ""),
          );
        } else {
          actors = new Map(
            ((profs ?? []) as any[]).map(p => [
              p.id as string,
              { full_name: p.full_name ?? null, email: p.email ?? null } as Actor,
            ]),
          );
        }
      }

      setItems(rows.map(r => ({
        ...r,
        actor: r.user_id ? actors.get(r.user_id) ?? null : null,
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
  }, [lang]);

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
                            <Badge variant="outline" title={i.entity_type ?? undefined}>
                              {entityLabel(i.entity_type, lang)}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            {recordHref ? (
                              <Link
                                to={recordHref}
                                className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline max-w-[240px]"
                                title={i.entity_id ?? undefined}
                              >
                                <ExternalLink className="size-3.5 shrink-0" />
                                <span className="truncate">{i.entity_id}</span>
                              </Link>
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
