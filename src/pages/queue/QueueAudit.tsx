import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListSkeleton } from "@/components/ListSkeleton";
import { ArrowLeft, Download, ScrollText, ExternalLink, BookmarkPlus, Bookmark, X } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const QUEUE_ACTIONS = [
  "status_change",
  "doctor_reassigned",
  "room_assigned",
  "walk_in_created",
  "consultation_opened",
] as const;
type QAction = typeof QUEUE_ACTIONS[number];

const SAFE_KEYS = ["status", "doctor_id", "room", "priority", "is_walk_in", "checked_in_at", "started_at"];

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
function defaultFrom() { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

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
  const savePresetPrompt = async () => {
    const name = window.prompt(lang === "ar" ? "اسم الإعداد المسبق" : "Preset name");
    if (!name || !name.trim()) return;
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
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    cachePresets(currentBranchId, next);
    // Best-effort server delete; RLS will block deletes for presets the
    // user does not own, which is fine — local list still updates.
    await (supabase as any).from("audit_export_presets").delete().eq("id", id);
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
        .select("id,patient_id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
        .in("id", apptIds);
      const map = { ...patients };
      (ap ?? []).forEach((a: any) => {
        const p = a.patients; if (!p) return;
        const name = lang === "ar"
          ? `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim()
          : `${p.first_name_en} ${p.last_name_en ?? ""}`.trim();
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
            .select("id,patient_id,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
            .in("id", aIds);
          (ap ?? []).forEach((a: any) => {
            const p = a.patients; if (!p) return;
            const name = lang === "ar"
              ? `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim()
              : `${p.first_name_en} ${p.last_name_en ?? ""}`.trim();
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
    <div className="p-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/queue" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ScrollText className="size-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">{t("queueAuditTitle")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{t("queueAuditSubtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0 || exportingAll}>
            <Download className="size-4 me-1" /> {t("exportCsv")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void exportAll()} disabled={exportingAll}>
            <Download className="size-4 me-1" /> {exportingAll ? "…" : (lang === "ar" ? "تصدير الكل" : "Export all")}
          </Button>
        </div>
      </header>

      <Card className="p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
          <div>
            <Label className="text-xs text-muted-foreground">{t("from")}</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("to")}</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("action")}</Label>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as any)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allActions")}</SelectItem>
                {QUEUE_ACTIONS.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("user")}</Label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allUsers")}</SelectItem>
                {userOptions.map((u) => (<SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Label className="text-xs text-muted-foreground">{t("referenceFilter")}</Label>
            <Input value={refFilter} onChange={(e) => setRefFilter(e.target.value)} placeholder={t("referenceFilterPh")} className="h-9" />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={scopeBranch} onChange={(e) => setScopeBranch(e.target.checked)} />
            {t("scopeToCurrentBranch")}
          </label>
          <div className="ms-3 flex items-center gap-1.5 flex-wrap">
            <Bookmark className="size-3.5" />
            <span>{lang === "ar" ? "إعدادات مسبقة:" : "Presets:"}</span>
            {presets.length === 0 && <span className="opacity-60">—</span>}
            {presets.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-0.5 rounded-full border bg-background ps-2 pe-0.5 py-0.5">
                <button type="button" onClick={() => applyPreset(p.id)} className="hover:underline">{p.name}</button>
                <button type="button" onClick={() => deletePreset(p.id)} className="text-muted-foreground hover:text-destructive p-0.5" aria-label="Delete preset">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={savePresetPrompt}>
              <BookmarkPlus className="size-3.5 me-1" />{lang === "ar" ? "حفظ" : "Save current"}
            </Button>
          </div>
          <span className="ms-auto">{filtered.length}</span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-3 py-2 font-medium">{t("timestamp")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("action")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("user")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("patient")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("change")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-0"><ListSkeleton rows={6} /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-10">{t("noData")}</td></tr>
              ) : filtered.map((r) => {
                const p = r.entity_id ? patients[r.entity_id] : null;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] capitalize">{r.action.replace(/_/g, " ")}</Badge></td>
                    <td className="px-3 py-2 truncate max-w-[180px]">{profiles[r.user_id ?? ""] ?? (r.user_id ? r.user_id.slice(0, 8) : "—")}</td>
                    <td className="px-3 py-2">
                      {p ? (
                        <span className="truncate">{p.name} <span className="text-[11px] text-muted-foreground">#{p.code}</span></span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[360px]">{summarizeDiff(r.old_values, r.new_values) || "—"}</td>
                    <td className="px-3 py-2 text-end">
                      {r.entity_id && (
                        <Link to={`/appointments/${r.entity_id}`} className="text-primary inline-flex items-center gap-1 text-xs hover:underline">
                          <ExternalLink className="size-3.5" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "…" : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}