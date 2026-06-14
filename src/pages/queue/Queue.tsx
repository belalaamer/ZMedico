import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { RowActions } from "@/components/RowActions";
import { ListSkeleton } from "@/components/ListSkeleton";
import { AlertTriangle, CheckCircle2, Clock, Flag, ListChecks, Play, UserPlus, X, ExternalLink, RotateCcw, Plus, Stethoscope, Users, Activity, CheckCheck, UserX, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { buildStatusPatch, type ApptStatus } from "@/lib/appointmentStatus";

type QueueRow = {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  branch_id: string | null;
  room: string | null;
  scheduled_at: string;
  status: ApptStatus;
  procedure: string | null;
  priority: number | null;
  checked_in_at: string | null;
  started_at: string | null;
  is_walk_in?: boolean | null;
  patients?: {
    first_name_en: string;
    last_name_en: string | null;
    first_name_ar: string | null;
    last_name_ar: string | null;
    patient_code: number;
  } | null;
};

const LONG_WAIT_MS = 30 * 60 * 1000;

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function formatDur(ms: number) {
  if (ms <= 0) return "0m";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}

const STATUS_BADGE: Record<ApptStatus, string> = {
  scheduled:   "bg-primary/10 text-primary border border-primary/30",
  confirmed:   "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30",
  completed:   "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40",
  cancelled:   "bg-destructive/10 text-destructive border border-destructive/30",
  no_show:     "bg-destructive/10 text-destructive border border-destructive/30",
  departed:    "bg-muted text-muted-foreground border border-border",
};

function uiStatusLabel(s: ApptStatus, t: (k: any) => string) {
  switch (s) {
    case "scheduled":   return t("queueWaiting");
    case "confirmed":   return t("queueCheckedIn");
    case "in_progress": return t("queueWithDoctor");
    case "completed":   return t("statusCompleted");
    case "cancelled":   return t("statusCancelled");
    case "no_show":     return t("statusNoShow");
    case "departed":    return t("statusDeparted");
  }
}

export default function QueuePage() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const navigate = useNavigate();
  const { can } = usePermissions();
  // Queue mutations are gated behind appointments:update. Users without it
  // see read-only rows; route-level guard handles view permission.
  const canMutate = can("appointments", "update") || can("appointments", "manage");
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | ApptStatus>("active");
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [tick, setTick] = useState(0);
  // walk-in dialog state
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInPatient, setWalkInPatient] = useState("");
  const [walkInDoctor, setWalkInDoctor] = useState("");
  const [walkInRoom, setWalkInRoom] = useState("");
  const [walkInProcedure, setWalkInProcedure] = useState("");
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [patientOptions, setPatientOptions] = useState<{ id: string; first_name_en: string; last_name_en: string | null; first_name_ar: string | null; last_name_ar: string | null; patient_code: number; phone: string | null }[]>([]);

  // 30s tick so waiting/in-session timers re-render without per-row intervals.
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    setLoading(true);
    const from = startOfDay(new Date()).toISOString();
    const to = endOfDay(new Date()).toISOString();
    let q: any = supabase
      .from("appointments")
      .select("id,patient_id,doctor_id,branch_id,room,scheduled_at,status,procedure,priority,checked_in_at,started_at,is_walk_in,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
      .is("deleted_at", null)
      .gte("scheduled_at", from)
      .lte("scheduled_at", to);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as QueueRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // realtime live sync — scoped to current branch when possible to avoid
    // clinic-wide refetches from unrelated appointment changes.
    const topic = `queue-${Math.random().toString(36).slice(2, 10)}`;
    const filter = currentBranchId ? `branch_id=eq.${currentBranchId}` : undefined;
    const ch = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", ...(filter ? { filter } : {}) } as any,
        () => { load(); }
      );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranchId]);

  // doctors for filter
  useEffect(() => {
    supabase
      .from("staff_profiles")
      .select("id,full_name,position_id,staff_positions(name_en,is_medical)")
      .order("full_name")
      .then(({ data }) => {
        const list = (data ?? [])
          .filter((s: any) => s?.staff_positions?.is_medical)
          .map((s: any) => ({ id: s.id, full_name: s.full_name }));
        setDoctors(list);
      });
  }, []);

  // lightweight patient list for walk-in picker (loaded on dialog open)
  useEffect(() => {
    if (!walkInOpen || patientOptions.length > 0) return;
    supabase
      .from("patients")
      .select("id,first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code,phone")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setPatientOptions((data ?? []) as any));
  }, [walkInOpen, patientOptions.length]);

  const patientName = (r: QueueRow) => {
    const p = r.patients;
    if (!p) return "—";
    if (lang === "ar") {
      return `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim();
    }
    return `${p.first_name_en} ${p.last_name_en ?? ""}`.trim();
  };

  const doctorName = (id: string | null) => doctors.find((d) => d.id === id)?.full_name ?? "—";

  const patientDisplay = (p: { first_name_en: string; last_name_en: string | null; first_name_ar: string | null; last_name_ar: string | null }) =>
    lang === "ar"
      ? `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim()
      : `${p.first_name_en} ${p.last_name_en ?? ""}`.trim();

  const filtered = useMemo(() => {
    const ACTIVE: ApptStatus[] = ["scheduled", "confirmed", "in_progress"];
    let list = rows.filter((r) => {
      if (statusFilter === "active") return ACTIVE.includes(r.status);
      if (statusFilter === "all") return true;
      return r.status === statusFilter;
    });
    if (doctorFilter !== "all") list = list.filter((r) => r.doctor_id === doctorFilter);
    if (urgentOnly) list = list.filter((r) => (r.priority ?? 0) > 0);
    // Sort: urgent first, then by check-in time asc (nulls last), then scheduled_at asc.
    list.sort((a, b) => {
      const pa = (a.priority ?? 0) > 0 ? 0 : 1;
      const pb = (b.priority ?? 0) > 0 ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ca = a.checked_in_at ? new Date(a.checked_in_at).getTime() : Number.POSITIVE_INFINITY;
      const cb = b.checked_in_at ? new Date(b.checked_in_at).getTime() : Number.POSITIVE_INFINITY;
      if (ca !== cb) return ca - cb;
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    });
    return list;
  }, [rows, statusFilter, doctorFilter, urgentOnly]);

  const longWaitCount = useMemo(() => {
    const now = Date.now();
    return filtered.filter((r) => r.status === "confirmed" && r.checked_in_at && (now - new Date(r.checked_in_at).getTime()) > LONG_WAIT_MS).length;
    // tick included so this recomputes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, tick]);

  const updateRow = async (id: string, patch: Record<string, any>) => {
    if (!canMutate) { toast.error(lang === "ar" ? "غير مسموح" : "Not allowed"); return; }
    const { error } = await supabase.from("appointments").update(patch as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    load();
  };

  const transition = (r: QueueRow, next: ApptStatus) =>
    updateRow(r.id, buildStatusPatch(next, { checked_in_at: r.checked_in_at, started_at: r.started_at }));

  const doCheckIn  = (r: QueueRow) => transition(r, "confirmed");
  const doStart    = (r: QueueRow) => transition(r, "in_progress");
  const doComplete = (r: QueueRow) => transition(r, "completed");
  const doNoShow   = (r: QueueRow) => transition(r, "no_show");
  const doCancel   = (r: QueueRow) => transition(r, "cancelled");
  const doReopen   = (r: QueueRow) => transition(r, "scheduled");
  // priority is binary today (0 / 1); column kept numeric for future tiers.
  const togglePriority = (r: QueueRow) => updateRow(r.id, { priority: (r.priority ?? 0) > 0 ? 0 : 1 });

  const rowWaitingMs = (r: QueueRow) => {
    if (r.status !== "confirmed" || !r.checked_in_at) return 0;
    return Date.now() - new Date(r.checked_in_at).getTime();
  };
  const rowSessionMs = (r: QueueRow) => {
    if (r.status !== "in_progress" || !r.started_at) return 0;
    return Date.now() - new Date(r.started_at).getTime();
  };

  // ---- Today's analytics (computed from already-loaded rows; same branch + day window)
  const analytics = useMemo(() => {
    const total = rows.length;
    const waiting = rows.filter((r) => r.status === "scheduled" || r.status === "confirmed").length;
    const inSession = rows.filter((r) => r.status === "in_progress").length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const noShow = rows.filter((r) => r.status === "no_show").length;
    // Average wait = avg of (started_at - checked_in_at) across rows that have both stamps today.
    const waited = rows
      .filter((r) => r.checked_in_at && r.started_at)
      .map((r) => new Date(r.started_at!).getTime() - new Date(r.checked_in_at!).getTime())
      .filter((ms) => ms > 0);
    const avgWaitMs = waited.length ? Math.round(waited.reduce((a, b) => a + b, 0) / waited.length) : null;
    return { total, waiting, inSession, completed, noShow, avgWaitMs };
    // tick: recompute live for waiting counts visible in the strip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tick]);

  // ---- Walk-in creation
  const submitWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutate) { toast.error(lang === "ar" ? "غير مسموح" : "Not allowed"); return; }
    if (!walkInPatient) { toast.error(t("selectPatient")); return; }
    setWalkInSaving(true);
    const nowIso = new Date().toISOString();
    // Walk-in = a brand-new appointment scheduled "now", immediately checked-in.
    // Reuses the same appointments row shape so it flows through every existing
    // queue/calendar/permissions path without a parallel system.
    const patch = buildStatusPatch("confirmed", { checked_in_at: nowIso, started_at: null }, nowIso);
    const payload: any = {
      patient_id: walkInPatient,
      doctor_id: walkInDoctor || null,
      branch_id: currentBranchId ?? null,
      scheduled_at: nowIso,
      duration_minutes: 30,
      room: walkInRoom || null,
      procedure: walkInProcedure || null,
      is_walk_in: true,
      ...patch,
    };
    const { error } = await supabase.from("appointments").insert(payload);
    setWalkInSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("walkInCreated"));
    setWalkInOpen(false);
    setWalkInPatient(""); setWalkInDoctor(""); setWalkInRoom(""); setWalkInProcedure("");
    load();
  };

  const startConsultation = (r: QueueRow) => {
    // Fast path: if not yet in session, stamp started_at first so the timer + analytics stay correct.
    if (canMutate && r.status !== "in_progress" && r.status !== "completed") {
      const patch = buildStatusPatch("in_progress", { checked_in_at: r.checked_in_at, started_at: r.started_at });
      supabase.from("appointments").update(patch as any).eq("id", r.id).then(({ error }) => {
        if (error) toast.error(error.message);
      });
    }
    // Deep-link to the patient profile's clinical tab — closest existing flow today.
    navigate(`/patients/${r.patient_id}?tab=clinical`);
  };

  const renderActions = (r: QueueRow) => {
    const items: { label: string; icon?: React.ReactNode; onClick: () => void }[] = [];
    // Fast path to consultation/chart — shown for any active row.
    if (r.status !== "cancelled" && r.status !== "no_show") {
      items.push({
        label: t("startConsultation"),
        icon: <Stethoscope className="size-4" />,
        onClick: () => startConsultation(r),
      });
    }
    if (canMutate && r.status === "scheduled") {
      items.push({ label: t("checkIn"), icon: <UserPlus className="size-4" />, onClick: () => doCheckIn(r) });
      items.push({ label: t("startVisit"), icon: <Play className="size-4" />, onClick: () => doStart(r) });
      items.push({ label: t("markNoShow"), icon: <X className="size-4" />, onClick: () => doNoShow(r) });
      items.push({ label: t("cancelVisit"), icon: <X className="size-4" />, onClick: () => doCancel(r) });
    } else if (canMutate && r.status === "confirmed") {
      items.push({ label: t("startVisit"), icon: <Play className="size-4" />, onClick: () => doStart(r) });
      items.push({ label: t("markNoShow"), icon: <X className="size-4" />, onClick: () => doNoShow(r) });
      items.push({ label: t("cancelVisit"), icon: <X className="size-4" />, onClick: () => doCancel(r) });
    } else if (canMutate && r.status === "in_progress") {
      items.push({ label: t("completeVisit"), icon: <CheckCircle2 className="size-4" />, onClick: () => doComplete(r) });
    } else if (canMutate && (r.status === "cancelled" || r.status === "no_show")) {
      items.push({ label: t("reopen"), icon: <RotateCcw className="size-4" />, onClick: () => doReopen(r) });
    }
    if (canMutate) {
      items.push({
        label: (r.priority ?? 0) > 0 ? t("unmarkUrgent") : t("markUrgent"),
        icon: <Flag className="size-4" />,
        onClick: () => togglePriority(r),
      });
    }
    items.push({
      label: t("openChart"),
      icon: <ExternalLink className="size-4" />,
      onClick: () => navigate(`/patients/${r.patient_id}`),
    });
    return <RowActions extraItems={items} canEdit={false} canDelete={false} />;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ListChecks className="size-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">{t("queue")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{t("queueSubtitle")}</p>
          </div>
        </div>
        {canMutate && (
          <Button type="button" onClick={() => setWalkInOpen(true)} size="sm" className="h-9">
            <Plus className="size-4 me-1" /> {t("addWalkIn")}
          </Button>
        )}
      </header>

      {/* Mini analytics strip — today, current branch */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatCard icon={<Users className="size-4" />}      label={t("queueTotalToday")}     value={analytics.total} />
        <StatCard icon={<Clock className="size-4" />}      label={t("queueWaitingNow")}     value={analytics.waiting} tone="primary" />
        <StatCard icon={<Activity className="size-4" />}   label={t("queueInSessionNow")}   value={analytics.inSession} tone="amber" />
        <StatCard icon={<CheckCheck className="size-4" />} label={t("queueCompletedToday")} value={analytics.completed} tone="emerald" />
        <StatCard icon={<UserX className="size-4" />}      label={t("queueNoShowToday")}    value={analytics.noShow} tone="destructive" />
        <StatCard icon={<Timer className="size-4" />}      label={t("queueAvgWait")}        value={analytics.avgWaitMs == null ? "—" : formatDur(analytics.avgWaitMs)} />
      </div>

      {/* Sticky filter bar */}
      <Card className="p-3 sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("statusFilter")}</span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t("queue")}</SelectItem>
                <SelectItem value="all">{t("allStatuses")}</SelectItem>
                <SelectItem value="scheduled">{t("queueWaiting")}</SelectItem>
                <SelectItem value="confirmed">{t("queueCheckedIn")}</SelectItem>
                <SelectItem value="in_progress">{t("queueWithDoctor")}</SelectItem>
                <SelectItem value="completed">{t("statusCompleted")}</SelectItem>
                <SelectItem value="cancelled">{t("statusCancelled")}</SelectItem>
                <SelectItem value="no_show">{t("statusNoShow")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("doctorFilter")}</span>
            <Select value={doctorFilter} onValueChange={setDoctorFilter}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allDoctors")}</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant={urgentOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setUrgentOnly((x) => !x)}
            className="h-9"
          >
            <Flag className="size-4 me-1" /> {t("onlyUrgent")}
          </Button>
          <div className="ms-auto text-xs text-muted-foreground">
            {filtered.length}
          </div>
        </div>
        {longWaitCount > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1.5">
            <AlertTriangle className="size-4" />
            <span>{t("longWaitBanner").replace("{n}", String(longWaitCount))}</span>
          </div>
        )}
      </Card>

      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="text-start">
                <th className="text-start px-3 py-2 font-medium">{t("patientName")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("appointmentTime")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("checkedInAt")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("doctor")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("status")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("waitingTime")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("inSessionTime")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-0"><ListSkeleton rows={6} /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-10">{t("noPatientsInQueue")}</td></tr>
              ) : (
                filtered.map((r) => {
                  const waitMs = rowWaitingMs(r);
                  const sessMs = rowSessionMs(r);
                  const longWait = waitMs > LONG_WAIT_MS;
                  return (
                    <tr key={r.id} className={cn("border-t border-border hover:bg-muted/30", longWait && "bg-amber-500/5")}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Link to={`/patients/${r.patient_id}`} className="font-medium hover:underline">{patientName(r)}</Link>
                          {r.patients?.patient_code != null && (
                            <span className="text-[11px] text-muted-foreground">#{r.patients.patient_code}</span>
                          )}
                          {(r.priority ?? 0) > 0 && (
                            <Badge variant="destructive" className="text-[10px] h-5">{t("urgent")}</Badge>
                          )}
                        </div>
                        {r.room && <div className="text-[11px] text-muted-foreground">{t("room")}: {r.room}</div>}
                      </td>
                      <td className="px-3 py-2">{formatTime(r.scheduled_at)}</td>
                      <td className="px-3 py-2">{formatTime(r.checked_in_at)}</td>
                      <td className="px-3 py-2">{doctorName(r.doctor_id)}</td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium", STATUS_BADGE[r.status])}>
                          {uiStatusLabel(r.status, t)}
                        </span>
                      </td>
                      <td className={cn("px-3 py-2 tabular-nums", longWait && "text-amber-700 dark:text-amber-300 font-medium")}>
                        {r.status === "confirmed" ? (
                          <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{formatDur(waitMs)}</span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.status === "in_progress" ? (
                          <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{formatDur(sessMs)}</span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-end">{renderActions(r)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <Card className="p-0 overflow-hidden"><ListSkeleton rows={5} /></Card>
        ) : filtered.length === 0 ? (
          <Card className="py-10 text-center text-muted-foreground">{t("noPatientsInQueue")}</Card>
        ) : (
          filtered.map((r) => {
            const waitMs = rowWaitingMs(r);
            const sessMs = rowSessionMs(r);
            const longWait = waitMs > LONG_WAIT_MS;
            return (
              <Card key={r.id} className={cn("p-3", longWait && "bg-amber-500/5")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/patients/${r.patient_id}`} className="font-semibold hover:underline">{patientName(r)}</Link>
                    <div className="text-[11px] text-muted-foreground">
                      {t("appointmentTime")}: {formatTime(r.scheduled_at)}
                      {r.checked_in_at && <> · {t("checkedInAt")}: {formatTime(r.checked_in_at)}</>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{doctorName(r.doctor_id)}{r.room ? ` · ${r.room}` : ""}</div>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium", STATUS_BADGE[r.status])}>
                        {uiStatusLabel(r.status, t)}
                      </span>
                      {(r.priority ?? 0) > 0 && (
                        <Badge variant="destructive" className="text-[10px] h-5">{t("urgent")}</Badge>
                      )}
                      {r.status === "confirmed" && (
                        <span className={cn("text-[11px] inline-flex items-center gap-1", longWait && "text-amber-700 dark:text-amber-300 font-medium")}>
                          <Clock className="size-3" />{formatDur(waitMs)}
                        </span>
                      )}
                      {r.status === "in_progress" && (
                        <span className="text-[11px] inline-flex items-center gap-1">
                          <Clock className="size-3" />{formatDur(sessMs)}
                        </span>
                      )}
                    </div>
                  </div>
                  {renderActions(r)}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Walk-in dialog */}
      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("newWalkInTitle")}</DialogTitle>
            <DialogDescription>{t("newWalkInDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitWalkIn} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("selectPatient")}</Label>
              <Combobox
                options={patientOptions.map((p) => ({
                  value: p.id,
                  label: `${patientDisplay(p)} · #${p.patient_code}`,
                  keywords: `${p.first_name_en} ${p.last_name_en ?? ""} ${p.first_name_ar ?? ""} ${p.last_name_ar ?? ""} ${p.phone ?? ""} ${p.patient_code}`,
                }))}
                value={walkInPatient}
                onChange={setWalkInPatient}
                placeholder={t("selectPatient")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("selectDoctorOptional")}</Label>
              <Combobox
                options={[{ value: "", label: "—" }, ...doctors.map((d) => ({ value: d.id, label: d.full_name }))]}
                value={walkInDoctor}
                onChange={setWalkInDoctor}
                placeholder={t("selectDoctorOptional")}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{t("roomOptional")}</Label>
                <Input value={walkInRoom} onChange={(e) => setWalkInRoom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("procedureOptional")}</Label>
                <Input value={walkInProcedure} onChange={(e) => setWalkInProcedure(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setWalkInOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={walkInSaving || !walkInPatient}>{t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "primary" | "emerald" | "amber" | "destructive";
}) {
  const toneCls =
    tone === "primary"     ? "text-primary"
  : tone === "emerald"     ? "text-emerald-600 dark:text-emerald-400"
  : tone === "amber"       ? "text-amber-600 dark:text-amber-400"
  : tone === "destructive" ? "text-destructive"
  : "text-foreground";
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {icon}<span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", toneCls)}>{value}</div>
    </Card>
  );
}