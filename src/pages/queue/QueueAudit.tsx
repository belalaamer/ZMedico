import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ListSkeleton } from "@/components/ListSkeleton";
import { ArrowLeft, Bookmark, BookmarkPlus, Download, ExternalLink, ScrollText, X } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { notConfirmedCopy, rowsWritten } from "@/lib/writeOutcome";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { patientDisplayName } from "@/lib/patientName";
import { localDateOnly } from "@/lib/localDate";
import {
  ActionButton,
  FieldLabel,
  PageHeader,
  Panel,
  PlatformDialog,
  PlatformInput,
  SectionLabel,
  SelectField,
  StatusChip,
  TableShell,
} from "@/components/zds/surface";
import { cn } from "@/lib/utils";

import { QUEUE_AUDIT_ACTIONS as QUEUE_ACTIONS, QUEUE_AUDIT_SAFE_KEYS as SAFE_KEYS, queueActionLabel } from "@/lib/queueAuditActions";
type QAction = typeof QUEUE_ACTIONS[number];


// --- Audit filter presets (Phase 9) -------------------------------------------
// Now persisted server-side in public.audit_export_presets, scoped per branch
// AND per user, so frontdesk staff can recall the same export shape across
// devices. Branch / dates intentionally excluded from the saved shape —
// branch comes from the active context, dates are usually "now"-relative and
// would be misleading if restored verbatim. localStorage is used only as a
// transient fallback cache if the server round-trip fails.
type AuditPreset = {
  id: string;
  name: string;
  action: "all" | string;
  userId: string; // "all" or uuid
  ref: string;
  scopeBranch: boolean;
};
const PRESETS_CACHE_KEY = (branchId?: string | null) => `zmedico.auditPresets.${branchId ?? "global"}`;
function loadCachedPresets(branchId?: string | null): AuditPreset[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(PRESETS_CACHE_KEY(branchId)) || "[]"); } catch { return []; }
}
function cachePresets(branchId: string | null | undefined, list: AuditPreset[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(PRESETS_CACHE_KEY(branchId), JSON.stringify(list.slice(0, 50))); } catch { /* ignore */ }
}

type LogRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  branch_id: string | null;
  created_at: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
};

function isoDay(d: string) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString(); }
function isoEndDay(d: string) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x.toISOString(); }
// The desk's own calendar, not UTC's: between midnight and 03:00 in Cairo the
// UTC day is still yesterday, and the two filters arrive a day short.
function defaultFrom() { const d = new Date(); d.setDate(d.getDate() - 7); return localDateOnly(d); }
function todayStr() { return localDateOnly(); }

function pickSafe(o: Record<string, any> | null | undefined) {
  if (!o) return null;
  const out: Record<string, any> = {};
  for (const k of SAFE_KEYS) if (k in o) out[k] = o[k];
  return Object.keys(out).length ? out : null;
}

function summarizeDiff(oldV: any, newV: any) {
  const so = pickSafe(oldV); const sn = pickSafe(newV);
  if (!so && !sn) return "";
  const keys = new Set([...(so ? Object.keys(so) : []), ...(sn ? Object.keys(sn) : [])]);
  const parts: string[] = [];
  keys.forEach((k) => {
    const a = so?.[k]; const b = sn?.[k];
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const fmt = (v: any) => v == null ? "—" : typeof v === "string" && v.length > 24 ? v.slice(0, 24) + "…" : String(v);
    parts.push(`${k}: ${fmt(a)} → ${fmt(b)}`);
  });
  return parts.join(" · ");
}

export default function QueueAuditPage() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [actionFilter, setActionFilter] = useState<"all" | QAction>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [refFilter, setRefFilter] = useState<string>(() => searchParams.get("appointment") ?? "");
  const [fromDate, setFromDate] = useState<string>(defaultFrom());
  const [toDate, setToDate] = useState<string>(todayStr());
  const [scopeBranch, setScopeBranch] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [patients, setPatients] = useState<Record<string, { name: string; code: number }>>({});
  const [exportingAll, setExportingAll] = useState(false);
  const [presets, setPresets] = useState<AuditPreset[]>(() => loadCachedPresets(currentBranchId));
  const [presetSaveOpen, setPresetSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const isArabic = lang === "ar";

  // Hydrate presets from the server when branch changes. Falls back to the
  // local cache so the UI is never empty while the request is in flight.
  useEffect(() => {
    let cancelled = false;
    setPresets(loadCachedPresets(currentBranchId));
    if (!currentBranchId) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("audit_export_presets")
        .select("id,name,action,user_filter,ref,scope_branch")
        .eq("branch_id", currentBranchId)
        .order("created_at", { ascending: true });
      if (cancelled || error || !data) return;
      const list: AuditPreset[] = data.map((r: any) => ({
        id: r.id, name: r.name, action: r.action,
        userId: r.user_filter, ref: r.ref, scopeBranch: r.scope_branch,
      }));
      setPresets(list);
      cachePresets(currentBranchId, list);
    })();
    return () => { cancelled = true; };
  }, [currentBranchId]);

  const applyPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setActionFilter(p.action as any);
    setUserFilter(p.userId);
    setRefFilter(p.ref);
    setScopeBranch(p.scopeBranch);
  };
  const openPresetSave = () => {
    setPresetName("");
    setPresetSaveOpen(true);
  };
  const savePreset = async () => {
    const name = presetName;
    if (!name.trim()) return;
    setPresetSaveOpen(false);
    if (!currentBranchId || !user) {
      // No branch / not signed in → local-only fallback so UI keeps working.
      const next: AuditPreset[] = [
        ...presets,
        { id: crypto.randomUUID(), name: name.trim(), action: actionFilter, userId: userFilter, ref: refFilter, scopeBranch },
      ];
      setPresets(next);
      cachePresets(currentBranchId, next);
      return;
    }
    const { data, error } = await (supabase as any)
      .from("audit_export_presets")
      .insert({
        branch_id: currentBranchId,
        user_id: user.id,
        name: name.trim(),
        action: actionFilter,
        user_filter: userFilter,
        ref: refFilter,
        scope_branch: scopeBranch,
      })
      .select("id,name,action,user_filter,ref,scope_branch")
      .single();
    if (error || !data) { toast.error(error?.message ?? "Save failed"); return; }
    const next = [...presets, {
      id: data.id, name: data.name, action: data.action,
      userId: data.user_filter, ref: data.ref, scopeBranch: data.scope_branch,
    }];
    setPresets(next);
    cachePresets(currentBranchId, next);
  };
  const deletePreset = async (id: string) => {
    const previous = presets;
    const next = previous.filter((p) => p.id !== id);
    setPresets(next);
    cachePresets(currentBranchId, next);
    // aep_delete_own only lets a preset's own author delete it, and RLS reports
    // that as zero rows rather than an error — so the local list must be put back.
    const { data, error } = await (supabase as any).from("audit_export_presets").delete().eq("id", id).select("id");
    if (error || rowsWritten(data) === 0) {
      setPresets(previous);
      cachePresets(currentBranchId, previous);
      toast.error(error ? error.message : notConfirmedCopy(lang, "own"));
    }
  };

  const PAGE_SIZE = 200;

  // Cursor-based pagination: each query asks for PAGE_SIZE rows older than
  // `beforeIso` (or unbounded for the first page). Server-side filters cover
  // action, user, branch, date, and an exact-appointment-id ref match so that
  // "load more" can never miss matches that local-only filtering would.
  const buildQuery = (beforeIso?: string) => {
    let q: any = supabase
      .from("audit_logs")
      .select("id,action,entity_type,entity_id,user_id,branch_id,created_at,old_values,new_values")
      .eq("entity_type", "appointment")
      .gte("created_at", isoDay(fromDate))
      .lte("created_at", isoEndDay(toDate))
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (actionFilter === "all") q = q.in("action", QUEUE_ACTIONS as unknown as string[]);
    else q = q.eq("action", actionFilter);
    if (userFilter !== "all") q = q.eq("user_id", userFilter);
    if (scopeBranch && currentBranchId) q = q.eq("branch_id", currentBranchId);
    // If the ref filter looks like a UUID, treat it as exact appointment id (server-side).
    const trimmed = refFilter.trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      q = q.eq("entity_id", trimmed);
    }
    if (beforeIso) q = q.lt("created_at", beforeIso);
    return q;
  };

  const hydrate = async (list: LogRow[]) => {
    const userIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
    if (userIds.length) {
      const { data: pr } = await supabase.from("profiles").select("id,full_name").in("id", userIds);
      const map = { ...profiles };
      (pr ?? []).forEach((p: any) => { map[p.id] = p.full_name ?? p.id.slice(0, 8); });
      setProfiles(map);
    }
    const apptIds = Array.from(new Set(list.map((r) => r.entity_id).filter(Boolean))) as string[];
    if (apptIds.length) {
      const { data: ap } = await supabase
        .from("appointments")
        .select("id,patient_id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code)")
        .in("id", apptIds);
      const map = { ...patients };
      (ap ?? []).forEach((a: any) => {
        const p = a.patients; if (!p) return;
        const name = lang === "ar"
          ? patientDisplayName(p, "ar")
          : patientDisplayName(p, "en");
        map[a.id] = { name, code: p.patient_code };
      });
      setPatients(map);
    }
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await buildQuery();
    if (error) { toast.error(error.message); setRows([]); setHasMore(false); setLoading(false); return; }
    const list = (data ?? []) as LogRow[];
    setRows(list);
    setHasMore(list.length === PAGE_SIZE);
    setProfiles({}); setPatients({});
    await hydrate(list);
    setLoading(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || rows.length === 0) return;
    setLoadingMore(true);
    const cursor = rows[rows.length - 1].created_at;
    const { data, error } = await buildQuery(cursor);
    if (error) { toast.error(error.message); setLoadingMore(false); return; }
    const next = (data ?? []) as LogRow[];
    setRows((prev) => [...prev, ...next]);
    setHasMore(next.length === PAGE_SIZE);
    await hydrate(next);
    setLoadingMore(false);
  };

  // Reload on filter changes that affect the server query.
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [scopeBranch, currentBranchId, fromDate, toDate, actionFilter, userFilter, refFilter]);

  const userOptions = useMemo(() => {
    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
    return ids.map((id) => ({ id, label: profiles[id] ?? id.slice(0, 8) }));
  }, [rows, profiles]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (userFilter !== "all" && r.user_id !== userFilter) return false;
      if (refFilter.trim()) {
        const q = refFilter.trim().toLowerCase();
        const p = r.entity_id ? patients[r.entity_id] : null;
        const hay = `${r.entity_id ?? ""} ${p?.name ?? ""} ${p?.code ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, actionFilter, userFilter, refFilter, patients]);

  const exportCsv = () => {
    const header = ["timestamp", "action", "user", "appointment_id", "patient", "diff"];
    const lines = [header.join(",")];
    filtered.forEach((r) => {
      const p = r.entity_id ? patients[r.entity_id] : null;
      const cells = [
        new Date(r.created_at).toISOString(),
        r.action,
        profiles[r.user_id ?? ""] ?? r.user_id ?? "",
        r.entity_id ?? "",
        p ? `${p.name} (#${p.code})` : "",
        summarizeDiff(r.old_values, r.new_values),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `queue-audit-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stream every row that matches the current server-side filters, batched
  // through buildQuery's cursor pattern. Hydration is batched per page so
  // nothing larger than PAGE_SIZE is ever materialized at once.
  const exportAll = async () => {
    if (exportingAll) return;
    setExportingAll(true);
    try {
      const header = ["timestamp", "action", "user", "appointment_id", "patient", "diff"];
      const lines = [header.join(",")];
      const profileMap: Record<string, string> = {};
      const patientMap: Record<string, { name: string; code: number }> = {};
      let cursor: string | undefined;
      let total = 0;
      const HARD_CAP = 20000; // safety guard
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await buildQuery(cursor);
        if (error) { toast.error(error.message); break; }
        const batch = (data ?? []) as LogRow[];
        if (batch.length === 0) break;
        // hydrate this batch
        const uIds = Array.from(new Set(batch.map((r) => r.user_id).filter((id): id is string => !!id && !profileMap[id])));
        if (uIds.length) {
          const { data: pr } = await supabase.from("profiles").select("id,full_name").in("id", uIds);
          (pr ?? []).forEach((p: any) => { profileMap[p.id] = p.full_name ?? p.id.slice(0, 8); });
        }
        const aIds = Array.from(new Set(batch.map((r) => r.entity_id).filter((id): id is string => !!id && !patientMap[id])));
        if (aIds.length) {
          const { data: ap } = await supabase
            .from("appointments")
            .select("id,patient_id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code)")
            .in("id", aIds);
          (ap ?? []).forEach((a: any) => {
            const p = a.patients; if (!p) return;
            const name = lang === "ar"
              ? patientDisplayName(p, "ar")
              : patientDisplayName(p, "en");
            patientMap[a.id] = { name, code: p.patient_code };
          });
        }
        batch.forEach((r) => {
          const p = r.entity_id ? patientMap[r.entity_id] : null;
          const cells = [
            new Date(r.created_at).toISOString(),
            r.action,
            profileMap[r.user_id ?? ""] ?? r.user_id ?? "",
            r.entity_id ?? "",
            p ? `${p.name} (#${p.code})` : "",
            summarizeDiff(r.old_values, r.new_values),
          ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
          lines.push(cells.join(","));
        });
        total += batch.length;
        if (batch.length < PAGE_SIZE) break;
        if (total >= HARD_CAP) { toast.warning(`Export capped at ${HARD_CAP} rows`); break; }
        cursor = batch[batch.length - 1].created_at;
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `queue-audit-all-${todayStr()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${total} rows exported`);
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <div className="z-desk min-h-screen space-y-z4 p-z4 sm:p-z6" dir={isArabic ? "rtl" : "ltr"}>
      <Link to="/queue" className="inline-flex items-center gap-z2 text-z-small rtl:text-z-small-ar text-z-ink-500 hover:text-z-ink-900">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {isArabic ? "الرجوع إلى الطابور" : "Back to queue"}
      </Link>
      <PageHeader
        title={t("queueAuditTitle")}
        lead={t("queueAuditSubtitle")}
        icon={<ScrollText />}
        actions={
          <>
            <ActionButton tone="quiet" onClick={exportCsv} disabled={filtered.length === 0 || exportingAll}>
              <Download className="size-4" aria-hidden="true" />
              {t("exportCsv")}
            </ActionButton>
            <ActionButton tone="quiet" onClick={() => void exportAll()} disabled={exportingAll}>
              <Download className="size-4" aria-hidden="true" />
              {exportingAll ? "…" : (isArabic ? "تصدير الكل" : "Export all")}
            </ActionButton>
          </>
        }
      />

      <Panel className="space-y-z3 p-z4">
        <div className="grid grid-cols-2 items-end gap-z3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-z1">
            <FieldLabel htmlFor="audit-from">{t("from")}</FieldLabel>
            <PlatformInput id="audit-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="z-num h-z9" />
          </div>
          <div className="space-y-z1">
            <FieldLabel htmlFor="audit-to">{t("to")}</FieldLabel>
            <PlatformInput id="audit-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="z-num h-z9" />
          </div>
          <div className="space-y-z1">
            <FieldLabel htmlFor="audit-action">{t("action")}</FieldLabel>
            <SelectField id="audit-action" value={actionFilter} onChange={(e) => setActionFilter(e.target.value as any)} className="h-z9">
              <option value="all">{t("allActions")}</option>
              {QUEUE_ACTIONS.map((a) => (<option key={a} value={a}>{queueActionLabel(a, lang)}</option>))}
            </SelectField>
          </div>
          <div className="space-y-z1">
            <FieldLabel htmlFor="audit-user">{t("user")}</FieldLabel>
            <SelectField id="audit-user" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="h-z9">
              <option value="all">{t("allUsers")}</option>
              {userOptions.map((u) => (<option key={u.id} value={u.id}>{u.label}</option>))}
            </SelectField>
          </div>
          <div className="space-y-z1 lg:col-span-2">
            <FieldLabel htmlFor="audit-ref">{t("referenceFilter")}</FieldLabel>
            <PlatformInput id="audit-ref" value={refFilter} onChange={(e) => setRefFilter(e.target.value)} placeholder={t("referenceFilterPh")} className="h-z9" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-z3 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
          <label className="inline-flex items-center gap-z2">
            <input
              type="checkbox"
              checked={scopeBranch}
              onChange={(e) => setScopeBranch(e.target.checked)}
              className="size-4 rounded-z1 border-z-line-edge accent-z-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-z-brand-500"
            />
            {t("scopeToCurrentBranch")}
          </label>
          <div className="ms-z3 flex flex-wrap items-center gap-z2">
            <Bookmark className="size-3.5" aria-hidden="true" />
            <span>{isArabic ? "إعدادات مسبقة:" : "Presets:"}</span>
            {presets.length === 0 ? <span className="text-z-ink-400">—</span> : null}
            {presets.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-z1 rounded-z2 border border-z-line-edge bg-z-raised ps-z2 pe-z1 py-z1">
                <button type="button" onClick={() => applyPreset(p.id)} className="text-z-micro rtl:text-z-micro-ar hover:underline">{p.name}</button>
                <button type="button" onClick={() => deletePreset(p.id)} className="p-z1 text-z-ink-400 hover:text-z-critical-ink" aria-label="Delete preset">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <ActionButton tone="ghost" className="h-z7 px-z2 text-z-micro rtl:text-z-micro-ar" onClick={openPresetSave}>
              <BookmarkPlus className="size-3.5" aria-hidden="true" />
              {isArabic ? "حفظ" : "Save current"}
            </ActionButton>
          </div>
          <span className="ms-auto z-num">{filtered.length}</span>
        </div>
      </Panel>

      <TableShell>
        <table className="w-full text-z-small rtl:text-z-small-ar">
          <thead className="bg-z-sunk text-z-ink-500">
            <tr>
              <th className="px-z3 py-z2 text-start font-medium">{t("timestamp")}</th>
              <th className="px-z3 py-z2 text-start font-medium">{t("action")}</th>
              <th className="px-z3 py-z2 text-start font-medium">{t("user")}</th>
              <th className="px-z3 py-z2 text-start font-medium">{t("patient")}</th>
              <th className="px-z3 py-z2 text-start font-medium">{t("change")}</th>
              <th className="px-z3 py-z2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-0"><ListSkeleton rows={6} /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-z10 text-center text-z-ink-500">{t("noData")}</td></tr>
            ) : filtered.map((r) => {
              const p = r.entity_id ? patients[r.entity_id] : null;
              return (
                <tr key={r.id} className="border-t border-z-line-hairline hover:bg-z-sunk">
                  <td className="whitespace-nowrap px-z3 py-z2 z-num text-z-micro rtl:text-z-micro-ar text-z-ink-500">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-z3 py-z2"><StatusChip tone="neutral">{queueActionLabel(r.action, lang)}</StatusChip></td>
                  <td className="max-w-[180px] truncate px-z3 py-z2 text-z-ink-700">{profiles[r.user_id ?? ""] ?? (r.user_id ? r.user_id.slice(0, 8) : "—")}</td>
                  <td className="px-z3 py-z2">
                    {p ? (
                      <span className="inline-flex items-baseline gap-z1">
                        <span className="truncate text-z-ink-900">{p.name}</span>
                        <span className="z-num text-z-micro rtl:text-z-micro-ar text-z-ink-500">#{p.code}</span>
                      </span>
                    ) : <span className="text-z-ink-400">—</span>}
                  </td>
                  <td className="max-w-[360px] truncate px-z3 py-z2 text-z-micro rtl:text-z-micro-ar text-z-ink-500">{summarizeDiff(r.old_values, r.new_values) || "—"}</td>
                  <td className="px-z3 py-z2 text-end">
                    {r.entity_id ? (
                      <Link to={`/appointments/${r.entity_id}`} className="inline-flex items-center text-z-brand-700 hover:underline" aria-label={isArabic ? "فتح الموعد" : "Open appointment"}>
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>
      {hasMore ? (
        <div className="flex justify-center">
          <ActionButton tone="quiet" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "…" : t("loadMore")}
          </ActionButton>
        </div>
      ) : null}

      <PlatformDialog
        open={presetSaveOpen}
        onOpenChange={setPresetSaveOpen}
        title={isArabic ? "حفظ الإعدادات المسبقة" : "Save preset"}
        icon={<BookmarkPlus />}
        dir={isArabic ? "rtl" : "ltr"}
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setPresetSaveOpen(false)}>{t("cancel")}</ActionButton>
            <ActionButton onClick={() => void savePreset()} disabled={!presetName.trim()}>{t("save")}</ActionButton>
          </>
        }
      >
        <div className="space-y-z2">
          <FieldLabel htmlFor="audit-preset-name">{isArabic ? "اسم الإعداد المسبق" : "Preset name"}</FieldLabel>
          <PlatformInput
            id="audit-preset-name"
            value={presetName}
            autoFocus
            maxLength={80}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && presetName.trim()) void savePreset(); }}
            placeholder={isArabic ? "مثال: حذف المواعيد اليوم" : "e.g. Today's cancelled appointments"}
          />
          <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">
            {isArabic
              ? "يحفظ هذا الفلاتر الحالية: الإجراء والمستخدم والمرجع و«الاقتصار على الفرع الحالي»."
              : "Saves the filters as they are now: action, user, reference and “scope to current branch”."}
          </p>
        </div>
      </PlatformDialog>
    </div>
  );
}
