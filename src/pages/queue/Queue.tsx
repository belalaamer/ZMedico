import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Combobox } from "@/components/ui/combobox";
import { RowActions } from "@/components/RowActions";
import { ListSkeleton } from "@/components/ListSkeleton";
import { AlertTriangle, CheckCircle2, Clock, Flag, ListChecks, Play, UserPlus, X, ExternalLink, RotateCcw, Plus, Stethoscope, Users, Activity, CheckCheck, UserX, Timer, UserCog, DoorOpen, Settings as SettingsIcon, ScrollText, Link2 as Link2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { subscribeResilient } from "@/lib/realtime";
import { toast } from "sonner";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { patientDisplayName } from "@/lib/patientName";
import { doctorDisplayName } from "@/lib/doctorName";
import { formatDateTime } from "@/lib/format";
import { buildStatusPatch, type ApptStatus } from "@/lib/appointmentStatus";
import { updateQueueAppointment } from "@/lib/queueMutation";
import { deskFailure } from "@/lib/deskFailure";
import { openQueueConsultation, queueConsultationErrorCode, queueConsultationErrorMessage } from "@/lib/queueConsultation";
import type { DictKey } from "@/lib/i18n";
import { getQueueSettings, fetchQueueSettings, type QueueSettings } from "@/lib/queueSettings";
import { showLoadingPlaceholder } from "@/lib/quietRefresh";
import { listOpenAlerts, effectiveState, type QueueAlert } from "@/lib/queueAlerts";
import { useOperationScope } from "@/hooks/useOperationScope";
import { usePatientSearch } from "@/hooks/usePatientSearch";
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
  type SignalTone,
} from "@/components/zds/surface";
import {
  PATIENT_PICKER_LIMIT,
  patientPickerCopy,
  pickedPatientLabel,
  type PatientOption,
} from "@/lib/patientSearch";

type QueueDoctor = {
  id: string;
  full_name: string | null;
  full_name_en?: string | null;
  full_name_ar?: string | null;
};

type QueueRow = {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  branch_id: string | null;
  room: string | null;
  scheduled_at: string;
  updated_at: string;
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

// Signal colour is meaning: a status is a chip with its word, not a palette wash.
const STATUS_TONE: Record<ApptStatus, SignalTone> = {
  scheduled:   "neutral",
  confirmed:   "positive",
  in_progress: "caution",
  completed:   "positive",
  cancelled:   "critical",
  no_show:     "critical",
  departed:    "neutral",
};

function uiStatusLabel(s: ApptStatus, t: (k: DictKey) => string) {
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
  const { currentBranchId, branchSelectionReady } = useBranch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isArabic = lang === "ar";
  // R2: canonical authorization entry point.
  const { authz } = useAuthorization("Queue");
  // Queue mutations are gated behind appointments.edit — the real permission
  // key (RBAC-04 fix). The matrix's canonical action vocabulary is strictly
  // view/create/edit/delete/export (src/lib/rolePermissions.ts ACTIONS); the
  // previous check here — "appointments.update" / "appointments.manage" —
  // referenced two actions that do not exist anywhere in that vocabulary, so
  // `authz.can(...)` always resolved false for every non-admin role. Since
  // doctor, nurse, receptionist, and manager all legitimately hold
  // appointments.edit (confirmed against the live role_permissions table and
  // the appointments RLS policies, which already allow their UPDATEs), this
  // silently blocked check-in/status-change/cancel for all of them in the
  // Queue UI alone — a front-end-only regression, not a security boundary
  // (the DB never depended on this check). Only `isAdmin` bypassed it via
  // AuthorizationService's own short-circuit, which is why the bug went
  // unnoticed for admin testing.
  const canMutate = authz.can("appointments.edit");
  const canStartConsultation = canMutate && authz.can("medical_records.create");
  const beginConsultationScope = useOperationScope(user?.id && currentBranchId
    ? `${user.id}:${currentBranchId}:${canStartConsultation ? "write" : "read"}` : null);
  const consultationPendingRef = useRef(new Set<string>());
  const [rows, setRows] = useState<QueueRow[]>([]);
  const loadRequestRef = useRef(0);
  const [doctors, setDoctors] = useState<QueueDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | ApptStatus>("active");
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  // remembers whether we've auto-defaulted the view for this doctor session
  const [doctorDefaultApplied, setDoctorDefaultApplied] = useState(false);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [tick, setTick] = useState(0);
  // walk-in dialog state
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInPatient, setWalkInPatient] = useState("");
  const [walkInDoctor, setWalkInDoctor] = useState("");
  const [walkInRoom, setWalkInRoom] = useState("");
  const [walkInProcedure, setWalkInProcedure] = useState("");
  const [walkInSaving, setWalkInSaving] = useState(false);
  const walkInSubmittingRef = useRef(false);
  const [selfCheckinRow, setSelfCheckinRow] = useState<QueueRow | null>(null);
  const [selfCheckinUrl, setSelfCheckinUrl] = useState<string | null>(null);
  const [selfCheckinExpiresAt, setSelfCheckinExpiresAt] = useState<string | null>(null);
  const [selfCheckinSaving, setSelfCheckinSaving] = useState(false);
  // C4: the walk-in picker is one bounded page of server-side matches, not the
  // newest 500 patients of the clinic. `walkInEcho` remembers the row the desk
  // chose so the button keeps naming that patient after the list moves on.
  const walkInPatientSearch = usePatientSearch({
    ready: branchSelectionReady,
    branchId: currentBranchId,
    lang,
  });
  const [walkInEcho, setWalkInEcho] = useState<PatientOption | null>(null);
  const walkInPickerCopy = patientPickerCopy(lang);
  // Reassign doctor dialog state
  const [reassignRow, setReassignRow] = useState<QueueRow | null>(null);
  const [reassignDoctor, setReassignDoctor] = useState<string>("");
  const [reassignSaving, setReassignSaving] = useState(false);
  // Assign room dialog state
  const [roomRow, setRoomRow] = useState<QueueRow | null>(null);
  const [roomValue, setRoomValue] = useState<string>("");
  const [roomSaving, setRoomSaving] = useState(false);
  // Per-branch policy settings (localStorage). Re-loaded on branch switch.
  const [settings, setSettings] = useState<QueueSettings>(() => getQueueSettings(currentBranchId));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openAlerts, setOpenAlerts] = useState<QueueAlert[]>([]);
  const LONG_WAIT_MS = settings.longWaitMinutes * 60 * 1000;
  // On branch change: paint from local cache instantly, then hydrate from server.
  useEffect(() => {
    setSettings(getQueueSettings(currentBranchId));
    let active = true;
    void fetchQueueSettings(currentBranchId).then((s) => { if (active) setSettings(s); });
    return () => { active = false; };
  }, [currentBranchId]);

  // Refresh open-alerts on branch change + tick so snooze expiry is reflected.
  useEffect(() => {
    if (!currentBranchId) { setOpenAlerts([]); return; }
    let active = true;
    void listOpenAlerts(currentBranchId).then((rows) => { if (active) setOpenAlerts(rows); });
    return () => { active = false; };
  }, [currentBranchId, tick]);

  // Phase 14: realtime — push alert state changes (snooze/ack/resolve) into
  // the queue page without waiting for the next tick.
  useEffect(() => {
    if (!currentBranchId) return;
    const refresh = async () => {
      const rows = await listOpenAlerts(currentBranchId);
      setOpenAlerts(rows);
    };
    return subscribeResilient({
      name: `queue_alerts_queue:${currentBranchId}`,
      bind: (ch) => ch.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "queue_alerts", filter: `branch_id=eq.${currentBranchId}` },
        () => { void refresh(); }
      ),
      onReconnect: () => { void refresh(); },
    });
  }, [currentBranchId]);

  // 30s tick so waiting/in-session timers re-render without per-row intervals.
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    const requestId = ++loadRequestRef.current;
    const branchId = currentBranchId;
    setLoading(true);
    // System Owner can read globally at the database layer; the workspace UI
    // must therefore fail closed until a valid branch is selected.
    if (!branchSelectionReady || !branchId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const from = startOfDay(new Date()).toISOString();
    const to = endOfDay(new Date()).toISOString();
    let q = supabase
      .from("appointments")
      .select("id,patient_id,doctor_id,branch_id,room,scheduled_at,updated_at,status,procedure,priority,checked_in_at,started_at,is_walk_in,patients!inner(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code,deleted_at)")
      .is("deleted_at", null)
      .is("patients.deleted_at", null)
      .gte("scheduled_at", from)
      .lte("scheduled_at", to)
      .eq("branch_id", branchId);
    const { data, error } = await q;
    if (requestId !== loadRequestRef.current) return;
    if (error) {
      const failure = deskFailure(error, lang, isArabic ? "تعذر تحميل الطابور." : "Could not load the queue.");
      toast.error(failure.title, { description: failure.description });
      setRows([]);
    } else {
      setRows((data ?? []) as QueueRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!branchSelectionReady || !currentBranchId) {
      setRows([]);
      setLoading(false);
      return;
    }
    // Clearing the board is what makes the quiet refresh safe: the rows on
    // screen belong to the branch that was selected before this one, and a
    // refresh of a different clinic's queue may never be shown as if it were the
    // current one. With rows empty, the skeleton comes back for this read only.
    setRows((prev) => (prev.length === 0 ? prev : []));
    void load();
    // Realtime is also scoped strictly to the selected branch.
    const filter = `branch_id=eq.${currentBranchId}`;
    return subscribeResilient({
      name: `queue-appts:${currentBranchId}`,
      bind: (ch) => ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter } as never,
        () => { void load(); }
      ),
      onReconnect: () => { void load(); },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchSelectionReady, currentBranchId]);

  // Doctors are loaded through the branch-scoped SECURITY DEFINER RPC so the
  // filter cannot reveal doctors outside the caller's permitted branches.
  useEffect(() => {
    if (!branchSelectionReady || !currentBranchId) {
      setDoctors([]);
      return;
    }
    supabase.rpc("list_doctors_for_branch", { _branch_id: currentBranchId }).then(({ data }) => {
      const list = ((data ?? []) as QueueDoctor[]).map((d) => ({
        id: d.id,
        full_name: d.full_name ?? null,
        full_name_en: d.full_name_en ?? null,
        full_name_ar: d.full_name_ar ?? null,
      }));
      setDoctors(list);
    });
  }, [branchSelectionReady, currentBranchId]);

  // If the signed-in user IS one of the doctors, default the view to "My queue"
  // on first load. They can switch to All freely afterwards (we don't re-apply).
  useEffect(() => {
    if (doctorDefaultApplied || !user?.id || doctors.length === 0) return;
    if (!settings.defaultMyQueue) { setDoctorDefaultApplied(true); return; }
    if (doctors.some((d) => d.id === user.id)) {
      setDoctorFilter(user.id);
    }
    setDoctorDefaultApplied(true);
  }, [user?.id, doctors, doctorDefaultApplied, settings.defaultMyQueue]);

  const isDoctorUser = !!user?.id && doctors.some((d) => d.id === user.id);

  // Unique rooms present in today's loaded rows, for the room filter.
  const roomOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.room && r.room.trim()) set.add(r.room.trim()); });
    return Array.from(set).sort();
  }, [rows]);

  const patientName = (r: QueueRow) => patientDisplayName(r.patients, lang);

  const doctorName = (id: string | null) => {
    const doctor = doctors.find((d) => d.id === id);
    return doctor ? doctorDisplayName(doctor, lang) : "—";
  };

  const filtered = useMemo(() => {
    const ACTIVE: ApptStatus[] = settings.showNoShowsInDefault
      ? ["scheduled", "confirmed", "in_progress", "no_show"]
      : ["scheduled", "confirmed", "in_progress"];
    let list = rows.filter((r) => {
      if (statusFilter === "active") return ACTIVE.includes(r.status);
      if (statusFilter === "all") return true;
      return r.status === statusFilter;
    });
    if (doctorFilter !== "all") list = list.filter((r) => r.doctor_id === doctorFilter);
    if (roomFilter !== "all") list = list.filter((r) => (r.room ?? "") === roomFilter);
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
  }, [rows, statusFilter, doctorFilter, urgentOnly, roomFilter, settings.showNoShowsInDefault]);

  const longWaitCount = useMemo(() => {
    const now = Date.now();
    return filtered.filter((r) => r.status === "confirmed" && r.checked_in_at && (now - new Date(r.checked_in_at).getTime()) > LONG_WAIT_MS).length;
    // tick included so this recomputes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, tick]);

  const updateRow = async (id: string, patch: Record<string, unknown>, expectedStatus: ApptStatus, expectedPriority?: number | null): Promise<boolean> => {
    if (!canMutate) { toast.error(isArabic ? "غير مسموح" : "Not allowed"); return false; }
    if (!currentBranchId) { toast.error(t("selectBranch")); return false; }
    let updated = false;
    try {
      updated = await updateQueueAppointment({ appointmentId: id, branchId: currentBranchId, patch, expectedStatus, expectedPriority });
    } catch (error) {
      const failure = deskFailure(error, lang, isArabic ? "تعذر حفظ هذا التغيير في الطابور." : "This queue change could not be saved.");
      toast.error(failure.title, { description: failure.description });
      void load();
      return false;
    }
    if (!updated) {
      toast.error(isArabic ? "تم تحديث الموعد بواسطة مستخدم آخر؛ أعد تحميل الطابور." : "This appointment was updated by another user. Refresh the queue and try again.");
      await load();
      return false;
    }
    toast.success(t("saved"));
    load();
    return true;
  };

  const transition = async (r: QueueRow, next: ApptStatus) => {
    const patch = buildStatusPatch(next, { checked_in_at: r.checked_in_at, started_at: r.started_at });
    if (!await updateRow(r.id, patch, r.status)) return;
  };

  const doCheckIn  = (r: QueueRow) => transition(r, "confirmed");
  const doStart    = (r: QueueRow) => transition(r, "in_progress");
  const doComplete = (r: QueueRow) => transition(r, "completed");
  const doNoShow   = (r: QueueRow) => transition(r, "no_show");
  const doCancel   = (r: QueueRow) => transition(r, "cancelled");
  const doReopen   = (r: QueueRow) => transition(r, "scheduled");

  const generateSelfCheckinLink = async (r: QueueRow) => {
    if (!canMutate) { toast.error(isArabic ? "غير مسموح" : "Not allowed"); return; }
    setSelfCheckinRow(r);
    setSelfCheckinUrl(null);
    setSelfCheckinExpiresAt(null);
    setSelfCheckinSaving(true);
    const { data, error } = await supabase.rpc("create_self_checkin_link", {
      p_appointment_id: r.id,
      p_ttl_minutes: 180,
    });
    setSelfCheckinSaving(false);
    if (error) {
      setSelfCheckinRow(null);
      const failure = deskFailure(error, lang, t("selfCheckinLinkError"));
      toast.error(failure.title, { description: failure.description });
      return;
    }
    const result = (Array.isArray(data) ? data[0] : data) as { token?: string; expires_at?: string } | null;
    if (!result?.token) {
      setSelfCheckinRow(null);
      toast.error(t("selfCheckinLinkError"));
      return;
    }
    setSelfCheckinUrl(`${window.location.origin}/check-in?token=${encodeURIComponent(result.token)}`);
    setSelfCheckinExpiresAt(result.expires_at ?? null);
  };

  const copySelfCheckinLink = async () => {
    if (!selfCheckinUrl) return;
    try {
      await navigator.clipboard.writeText(selfCheckinUrl);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(t("selfCheckinLinkError"));
    }
  };

  // priority is binary today (0 / 1); column kept numeric for future tiers.
  const togglePriority = (r: QueueRow) => updateRow(r.id, { priority: (r.priority ?? 0) > 0 ? 0 : 1 }, r.status, r.priority);

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
    // "Total today" sits next to the waiting/in-session/completed cards and the
    // desk reads it as the day's workload. The rows query keeps cancelled rows on
    // purpose — they are the undo surface at :668 and the explicit status filter
    // option — but a cancelled booking is not work, so it is out of this count.
    const total = rows.filter((r) => r.status !== "cancelled").length;
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
    // Longest currently-waiting patient (status=confirmed with check-in stamp).
    const nowMs = Date.now();
    let longestMs = 0;
    let longestRow: QueueRow | null = null;
    rows.forEach((r) => {
      if (r.status === "confirmed" && r.checked_in_at) {
        const ms = nowMs - new Date(r.checked_in_at).getTime();
        if (ms > longestMs) { longestMs = ms; longestRow = r; }
      }
    });
    return { total, waiting, inSession, completed, noShow, avgWaitMs, longestMs, longestRow };
    // tick: recompute live for waiting counts visible in the strip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tick]);

  // ---- Walk-in creation
  const submitWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (walkInSubmittingRef.current) return;
    if (!canMutate) { toast.error(isArabic ? "غير مسموح" : "Not allowed"); return; }
    if (!walkInPatient) { toast.error(t("selectPatient")); return; }
    if (!branchSelectionReady || !currentBranchId) { toast.error(t("selectBranch")); return; }
    walkInSubmittingRef.current = true;
    setWalkInSaving(true);
    try {
    const nowIso = new Date().toISOString();
    // Walk-in = a brand-new appointment scheduled "now", immediately checked-in.
    // Reuses the same appointments row shape so it flows through every existing
    // queue/calendar/permissions path without a parallel system.
    const patch = buildStatusPatch("confirmed", { checked_in_at: nowIso, started_at: null }, nowIso);
    const payload: import("@/integrations/supabase/types").TablesInsert<"appointments"> = {
      patient_id: walkInPatient,
      doctor_id: walkInDoctor || null,
      branch_id: currentBranchId,
      scheduled_at: nowIso,
      duration_minutes: 30,
      room: walkInRoom || null,
      procedure: walkInProcedure || null,
      is_walk_in: true,
      ...patch,
    };
    const { error } = await supabase.from("appointments").insert(payload).select("id").single();
    if (error) {
      const failure = deskFailure(error, lang, isArabic ? "تعذر تسجيل الزيارة." : "The walk-in could not be booked.");
      toast.error(failure.title, { description: failure.description });
      return;
    }
    toast.success(t("walkInCreated"));
    setWalkInOpen(false);
    setWalkInPatient(""); setWalkInDoctor(""); setWalkInRoom(""); setWalkInProcedure("");
    setWalkInEcho(null);
    load();
    } catch (error) {
      console.error("[Queue] walk-in outcome needs review", error);
      toast.error(isArabic
        ? "تعذر تأكيد تسجيل الزيارة. راجع الطابور قبل إعادة المحاولة."
        : "Walk-in outcome could not be confirmed. Check the queue before retrying.");
    } finally {
      walkInSubmittingRef.current = false;
      setWalkInSaving(false);
    }
  };

  // State and encounter creation commit together inside the caller-scoped RPC.
  const openConsultation = async (r: QueueRow) => {
    if (!currentBranchId || r.branch_id !== currentBranchId) {
      toast.error(t("selectBranch"));
      return;
    }
    if (consultationPendingRef.current.has(r.id)) return;
    consultationPendingRef.current.add(r.id);
    const canStart = canStartConsultation;
    const stillCurrent = beginConsultationScope();
    try {
      let recordId: string | undefined;
      if (canStart) {
        recordId = await openQueueConsultation({
          appointmentId: r.id,
          branchId: currentBranchId,
          expectedStatus: r.status,
          doctorId: r.doctor_id ?? user?.id ?? null,
          expectedSnapshot: {patient_id: r.patient_id, doctor_id: r.doctor_id, updated_at: r.updated_at},
        });
      } else {
        const { data: existing, error } = await supabase
        .from("medical_records")
        .select("id")
        .eq("appointment_id", r.id)
        .eq("branch_id", currentBranchId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
        if (error) throw error;
        recordId = existing?.[0]?.id;
      }
      if (!stillCurrent()) return;
      if (recordId) navigate(`/medical/consultation/${recordId}`);
      else navigate(`/patients/${r.patient_id}?tab=clinical`);
    } catch (error: unknown) {
      if (!stillCurrent()) return;
      console.warn("[Queue] consultation could not be confirmed", { code: queueConsultationErrorCode(error) });
      toast.error(queueConsultationErrorMessage(error, lang));
      if (queueConsultationErrorCode(error) === "PT409") await load();
    } finally {
      consultationPendingRef.current.delete(r.id);
    }
  };

  // No-show follow-up helpers
  const recallNoShow = (r: QueueRow) =>
    // Re-arrive the patient: clear stamps and stamp checked_in_at = now.
    updateRow(r.id, buildStatusPatch("confirmed", { checked_in_at: null, started_at: null }), r.status);
  const moveBackToWaiting = (r: QueueRow) =>
    updateRow(r.id, buildStatusPatch("scheduled", { checked_in_at: r.checked_in_at, started_at: r.started_at }), r.status);

  // ---- Reassign doctor
  const openReassign = (r: QueueRow) => {
    setReassignRow(r);
    setReassignDoctor(r.doctor_id ?? "");
  };
  const submitReassign = async () => {
    if (!reassignRow) return;
    if (!canMutate) { toast.error(isArabic ? "غير مسموح" : "Not allowed"); return; }
    const r = reassignRow;
    if (!currentBranchId || r.branch_id !== currentBranchId) { toast.error(t("selectBranch")); return; }
    const next = reassignDoctor || null;
    if (next === (r.doctor_id ?? null)) { setReassignRow(null); return; }
    setReassignSaving(true);
    // Status + timestamps intentionally untouched — only the assignee changes.
    let reassignQuery = supabase
      .from("appointments")
      .update({ doctor_id: next } as never)
      .eq("id", r.id)
      .eq("branch_id", currentBranchId)
      .eq("status", r.status);
    reassignQuery = (r.doctor_id === null
      ? reassignQuery.is("doctor_id", null)
      : reassignQuery.eq("doctor_id", r.doctor_id)) as typeof reassignQuery;
    const { data: reassigned, error } = await reassignQuery.select("id").maybeSingle();
    setReassignSaving(false);
    if (error) {
      const failure = deskFailure(error, lang, isArabic ? "تعذر تغيير الطبيب المعالج." : "The doctor could not be changed.");
      toast.error(failure.title, { description: failure.description });
      return;
    }
    if (!reassigned) {
      toast.error(isArabic ? "تم تعديل الموعد بواسطة مستخدم آخر؛ أعد تحميل الطابور." : "This appointment was changed by another user. Refresh the queue and try again.");
      setReassignRow(null);
      await load();
      return;
    }
    toast.success(t("saved"));
    setReassignRow(null);
    load();
  };

  // ---- Assign / change room
  const openRoom = (r: QueueRow) => {
    setRoomRow(r);
    setRoomValue(r.room ?? "");
  };
  const submitRoom = async () => {
    if (!roomRow) return;
    if (!canMutate) { toast.error(isArabic ? "غير مسموح" : "Not allowed"); return; }
    const r = roomRow;
    if (!currentBranchId || r.branch_id !== currentBranchId) { toast.error(t("selectBranch")); return; }
    const next = roomValue.trim() ? roomValue.trim() : null;
    if (next === (r.room ?? null)) { setRoomRow(null); return; }
    setRoomSaving(true);
    let roomQuery = supabase
      .from("appointments")
      .update({ room: next } as never)
      .eq("id", r.id)
      .eq("branch_id", currentBranchId)
      .eq("status", r.status);
    roomQuery = r.room == null ? roomQuery.is("room", null) : roomQuery.eq("room", r.room);
    const { data: updated, error } = await roomQuery.select("id").maybeSingle();
    setRoomSaving(false);
    if (error) {
      const failure = deskFailure(error, lang, isArabic ? "تعذر تغيير غرفة الموعد." : "The room could not be changed.");
      toast.error(failure.title, { description: failure.description });
      return;
    }
    if (!updated) { toast.error(isArabic ? "تم تغيير الغرفة بواسطة مستخدم آخر؛ أعد تحميل الطابور." : "The room was changed by another user. Refresh the queue."); await load(); return; }
    toast.success(t("saved"));
    setRoomRow(null);
    load();
  };

  const renderActions = (r: QueueRow) => {
    const items: { label: string; icon?: React.ReactNode; onClick: () => void }[] = [];
    // Fast path to consultation/chart — shown for any active row.
    if (r.status !== "cancelled" && r.status !== "no_show") {
      items.push({
        label: t("openConsultation"),
        icon: <Stethoscope className="size-4" />,
        onClick: () => { void openConsultation(r); },
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
      if (r.status === "no_show") {
        items.push({ label: t("recallPatient"), icon: <UserPlus className="size-4" />, onClick: () => recallNoShow(r) });
        items.push({ label: t("moveBackToWaiting"), icon: <RotateCcw className="size-4" />, onClick: () => moveBackToWaiting(r) });
      }
      items.push({ label: t("reopen"), icon: <RotateCcw className="size-4" />, onClick: () => doReopen(r) });
    } else if (canMutate && r.status === "departed") {
      // A mistapped "departed" used to strand the patient: the row left the
      // active board, the filter had no entry for it, and nothing offered a
      // way back, so staff had to leave the desk screen to fix it.
      items.push({ label: t("reopen"), icon: <RotateCcw className="size-4" />, onClick: () => doReopen(r) });
    }
    if (canMutate && (r.status === "scheduled" || r.status === "confirmed")) {
      items.push({
        label: t("generateSelfCheckinLink"),
        icon: <UserPlus className="size-4" />,
        onClick: () => { void generateSelfCheckinLink(r); },
      });
    }
    if (canMutate) {
      items.push({
        label: (r.priority ?? 0) > 0 ? t("unmarkUrgent") : t("markUrgent"),
        icon: <Flag className="size-4" />,
        onClick: () => togglePriority(r),
      });
      items.push({
        label: t("reassignDoctor"),
        icon: <UserCog className="size-4" />,
        onClick: () => openReassign(r),
      });
      items.push({
        label: r.room ? t("changeRoom") : t("assignRoom"),
        icon: <DoorOpen className="size-4" />,
        onClick: () => openRoom(r),
      });
    }
    items.push({
      label: t("openChart"),
      icon: <ExternalLink className="size-4" />,
      onClick: () => navigate(`/patients/${r.patient_id}`),
    });
    return <RowActions extraItems={items} canEdit={false} canDelete={false} />;
  };

  const urgentWaitingCount = filtered.filter((r) => r.status === "scheduled" || r.status === "confirmed").length;

  return (
    <div className="z-desk min-h-screen space-y-z4 p-z4 sm:p-z6" dir={isArabic ? "rtl" : "ltr"}>
      <PageHeader
        title={t("queue")}
        lead={t("queueSubtitle")}
        icon={<ListChecks />}
        actions={
          <>
            <ActionButton tone="quiet" asChild>
              <Link to="/queue/audit"><ScrollText className="size-4" aria-hidden="true" />{t("queueAuditLink")}</Link>
            </ActionButton>
            <ActionButton tone="quiet" onClick={() => setSettingsOpen(true)} aria-label={t("queueSettings")}>
              <SettingsIcon className="size-4" aria-hidden="true" />
            </ActionButton>
            {canMutate ? (
              <ActionButton onClick={() => setWalkInOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                {t("addWalkIn")}
              </ActionButton>
            ) : null}
          </>
        }
      />

      {/* Mini analytics strip — today, current branch */}
      <div className="grid grid-cols-2 gap-z2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={<Users className="size-4" />}      label={t("queueTotalToday")}     value={analytics.total} />
        <StatCard icon={<Clock className="size-4" />}      label={t("queueWaitingNow")}     value={analytics.waiting} tone="brand" />
        <StatCard icon={<Activity className="size-4" />}   label={t("queueInSessionNow")}   value={analytics.inSession} tone="caution" />
        <StatCard icon={<CheckCheck className="size-4" />} label={t("queueCompletedToday")} value={analytics.completed} tone="positive" />
        <StatCard icon={<UserX className="size-4" />}      label={t("queueNoShowToday")}    value={analytics.noShow} tone="critical" />
        <StatCard icon={<Timer className="size-4" />}      label={t("queueAvgWait")}        value={analytics.avgWaitMs == null ? "—" : formatDur(analytics.avgWaitMs)} />
      </div>

      {analytics.longestRow ? (
        <div className="flex flex-wrap items-center gap-z2 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
          <Clock className="size-3.5" aria-hidden="true" />
          <span>{t("queueLongestWait")}</span>
          <span className="font-medium text-z-ink-900">{patientName(analytics.longestRow)}</span>
          <span className="z-num">{formatDur(analytics.longestMs)}</span>
        </div>
      ) : null}

      {/* Sticky filter bar */}
      <Panel className="sticky top-z2 z-10 space-y-z2 p-z3">
        <div className="flex flex-wrap items-end gap-z3">
          <div className="space-y-z1">
            <FieldLabel htmlFor="queue-status-filter">{t("statusFilter")}</FieldLabel>
            <SelectField
              id="queue-status-filter"
              className="h-z9 w-[170px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "active" | "all" | ApptStatus)}
            >
              <option value="active">{t("queue")}</option>
              <option value="all">{t("allStatuses")}</option>
              <option value="scheduled">{t("queueWaiting")}</option>
              <option value="confirmed">{t("queueCheckedIn")}</option>
              <option value="in_progress">{t("queueWithDoctor")}</option>
              <option value="completed">{t("statusCompleted")}</option>
              <option value="cancelled">{t("statusCancelled")}</option>
              <option value="no_show">{t("statusNoShow")}</option>
              <option value="departed">{t("statusDeparted")}</option>
            </SelectField>
          </div>
          <div className="space-y-z1">
            <FieldLabel htmlFor="queue-doctor-filter">{t("doctorFilter")}</FieldLabel>
            <SelectField id="queue-doctor-filter" className="h-z9 w-[180px]" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
              <option value="all">{t("allDoctors")}</option>
              {isDoctorUser && user?.id ? <option value={user.id}>{t("queueViewMine")}</option> : null}
              {doctors.map((d) => (<option key={d.id} value={d.id}>{doctorDisplayName(d, lang)}</option>))}
            </SelectField>
          </div>
          {roomOptions.length > 0 ? (
            <div className="space-y-z1">
              <FieldLabel htmlFor="queue-room-filter">{t("roomFilter")}</FieldLabel>
              <SelectField id="queue-room-filter" className="h-z9 w-[140px]" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
                <option value="all">{t("allRooms")}</option>
                {roomOptions.map((rm) => (<option key={rm} value={rm}>{rm}</option>))}
              </SelectField>
            </div>
          ) : null}
          <ActionButton
            tone={urgentOnly ? "primary" : "quiet"}
            onClick={() => setUrgentOnly((x) => !x)}
            aria-pressed={urgentOnly}
          >
            <Flag className="size-4" aria-hidden="true" />
            {t("onlyUrgent")}
          </ActionButton>
          <ActionButton
            tone={statusFilter === "no_show" ? "primary" : "quiet"}
            onClick={() => setStatusFilter((s) => (s === "no_show" ? "active" : "no_show"))}
            aria-pressed={statusFilter === "no_show"}
          >
            <UserX className="size-4" aria-hidden="true" />
            {t("noShowsTodayChip")}
            {analytics.noShow > 0 ? <StatusChip tone="critical">{analytics.noShow}</StatusChip> : null}
          </ActionButton>
          <span className="ms-auto z-num text-z-small rtl:text-z-small-ar text-z-ink-500">{filtered.length}</span>
        </div>
        {(() => {
          const nowMs = Date.now();
          const activeCount = openAlerts.filter((a) => effectiveState(a, nowMs) === "active").length;
          const snoozedCount = openAlerts.filter((a) => effectiveState(a, nowMs) === "snoozed").length;
          const ackCount = openAlerts.filter((a) => effectiveState(a, nowMs) === "acknowledged").length;
          if (activeCount + snoozedCount + ackCount === 0) return null;
          return (
            <div className="flex flex-wrap items-center gap-z2 text-z-micro rtl:text-z-micro-ar">
              {activeCount > 0 ? <StatusChip tone="caution"><AlertTriangle className="size-3" aria-hidden="true" />{activeCount} {isArabic ? "نشط" : "active"}</StatusChip> : null}
              {snoozedCount > 0 ? <StatusChip tone="neutral">{snoozedCount} {isArabic ? "مؤجل" : "snoozed"}</StatusChip> : null}
              {ackCount > 0 ? <StatusChip tone="neutral">{ackCount} {isArabic ? "مؤكد" : "ack"}</StatusChip> : null}
              <Link to="/branches/dashboard" className="text-z-ink-500 hover:text-z-ink-900 hover:underline">{isArabic ? "إدارة" : "Manage"}</Link>
            </div>
          );
        })()}
        {(() => {
          const nowMs = Date.now();
          const muted = openAlerts.some((a) => a.alert_type === "long_wait" && effectiveState(a, nowMs) !== "active");
          return settings.alertsOnQueue && longWaitCount > 0 && !muted;
        })() ? (
          <div className="flex items-center gap-z2 rounded-z2 border border-s-2 border-z-caution-stroke bg-z-caution-fill px-z3 py-z2 text-z-micro rtl:text-z-micro-ar text-z-caution-ink">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>{t("longWaitBanner").replace("{n}", String(longWaitCount))}</span>
          </div>
        ) : null}
        {(() => {
          const nowMs = Date.now();
          const muted = openAlerts.some((a) => a.alert_type === "busy_queue" && effectiveState(a, nowMs) !== "active");
          return settings.alertsOnQueue && urgentWaitingCount >= settings.busyQueueThreshold && !muted;
        })() ? (
          <div className="flex items-center gap-z2 rounded-z2 border border-s-2 border-z-caution-stroke bg-z-caution-fill px-z3 py-z2 text-z-micro rtl:text-z-micro-ar text-z-caution-ink">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>{isArabic ? `الطابور مزدحم (${urgentWaitingCount} / ${settings.busyQueueThreshold})` : `Queue is busy (${urgentWaitingCount} / ${settings.busyQueueThreshold})`}</span>
          </div>
        ) : null}
      </Panel>

      {/* Desktop table */}
      <TableShell className="hidden md:block">
        <table className="w-full text-z-small rtl:text-z-small-ar">
          <thead className="bg-z-sunk text-z-ink-500">
            <tr>
              <th className="px-z3 py-z2 text-start font-medium">{t("patientName")}</th>
              <th className="px-z3 py-z2 text-start font-medium">{t("appointmentTime")}</th>
              <th className="px-z3 py-z2 text-start font-medium">{t("checkedInAt")}</th>
              <th className="px-z3 py-z2 text-start font-medium">{t("doctor")}</th>
              <th className="px-z3 py-z2 text-start font-medium">{t("status")}</th>
              <th className="px-z3 py-z2 text-start font-medium">{t("waitingTime")}</th>
              <th className="px-z3 py-z2 text-start font-medium">{t("inSessionTime")}</th>
              <th className="px-z3 py-z2"></th>
            </tr>
          </thead>
          <tbody>
            {showLoadingPlaceholder(loading, rows.length) ? (
              <tr><td colSpan={8} className="p-0"><ListSkeleton rows={6} /></td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-z10 text-center">
                  <div className="flex flex-col items-center gap-z3 text-z-ink-500">
                    <span>{t("noPatientsInQueue")}</span>
                    <ActionButton tone="quiet" onClick={() => setWalkInOpen(true)}>
                      <Plus className="size-4" aria-hidden="true" />
                      {t("addWalkIn")}
                    </ActionButton>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const waitMs = rowWaitingMs(r);
                const sessMs = rowSessionMs(r);
                const longWait = waitMs > LONG_WAIT_MS;
                return (
                  <tr key={r.id} className={cn(
                    "border-t border-z-line-hairline hover:bg-z-sunk",
                    longWait && "bg-z-caution-fill",
                    r.status === "no_show" && "bg-z-critical-fill",
                  )}>
                    <td className="px-z3 py-z2">
                      <div className="flex flex-wrap items-center gap-z2">
                        <Link to={`/patients/${r.patient_id}`} className="font-medium text-z-ink-900 hover:underline">{patientName(r)}</Link>
                        {(r.priority ?? 0) > 0 ? <StatusChip tone="critical">{t("urgent")}</StatusChip> : null}
                        {r.is_walk_in ? <StatusChip tone="neutral">{t("walkIn")}</StatusChip> : null}
                      </div>
                      {r.room ? <div className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{t("room")}: {r.room}</div> : null}
                    </td>
                    <td className="z-num px-z3 py-z2 text-z-ink-700">{formatTime(r.scheduled_at)}</td>
                    <td className="z-num px-z3 py-z2 text-z-ink-700">{formatTime(r.checked_in_at)}</td>
                    <td className="px-z3 py-z2 text-z-ink-700">{doctorName(r.doctor_id)}</td>
                    <td className="px-z3 py-z2"><StatusChip tone={STATUS_TONE[r.status]}>{uiStatusLabel(r.status, t)}</StatusChip></td>
                    <td className={cn("z-num px-z3 py-z2", longWait ? "font-medium text-z-caution-ink" : "text-z-ink-700")}>
                      {r.status === "confirmed" ? (
                        <span className="inline-flex items-center gap-z1"><Clock className="size-3.5" aria-hidden="true" />{formatDur(waitMs)}</span>
                      ) : "—"}
                    </td>
                    <td className="z-num px-z3 py-z2 text-z-ink-700">
                      {r.status === "in_progress" ? (
                        <span className="inline-flex items-center gap-z1"><Clock className="size-3.5" aria-hidden="true" />{formatDur(sessMs)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-z3 py-z2 text-end">{renderActions(r)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableShell>

      {/* Mobile cards */}
      <div className="space-y-z2 md:hidden">
        {showLoadingPlaceholder(loading, rows.length) ? (
          <Panel className="overflow-hidden"><ListSkeleton rows={5} /></Panel>
        ) : filtered.length === 0 ? (
          <Panel className="flex flex-col items-center gap-z3 py-z10 text-center text-z-ink-500">
            <span>{t("noPatientsInQueue")}</span>
            <ActionButton tone="quiet" onClick={() => setWalkInOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              {t("addWalkIn")}
            </ActionButton>
          </Panel>
        ) : (
          filtered.map((r) => {
            const waitMs = rowWaitingMs(r);
            const sessMs = rowSessionMs(r);
            const longWait = waitMs > LONG_WAIT_MS;
            return (
              <Panel key={r.id} className={cn(
                "p-z3",
                longWait && "bg-z-caution-fill",
                r.status === "no_show" && "border-z-critical-stroke bg-z-critical-fill",
              )}>
                <div className="flex items-start justify-between gap-z2">
                  <div className="min-w-0">
                    <Link to={`/patients/${r.patient_id}`} className="font-semibold text-z-ink-900 hover:underline">{patientName(r)}</Link>
                    <div className="flex flex-wrap items-center gap-x-z3 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
                      <span>{t("appointmentTime")}: <span className="z-num">{formatTime(r.scheduled_at)}</span></span>
                      {r.checked_in_at ? <span>{t("checkedInAt")}: <span className="z-num">{formatTime(r.checked_in_at)}</span></span> : null}
                    </div>
                    <div className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{doctorName(r.doctor_id)}{r.room ? <span className="z-num"> — {r.room}</span> : null}</div>
                    <div className="mt-z1 flex flex-wrap items-center gap-z2">
                      <StatusChip tone={STATUS_TONE[r.status]}>{uiStatusLabel(r.status, t)}</StatusChip>
                      {(r.priority ?? 0) > 0 ? <StatusChip tone="critical">{t("urgent")}</StatusChip> : null}
                      {r.is_walk_in ? <StatusChip tone="neutral">{t("walkIn")}</StatusChip> : null}
                      {r.status === "confirmed" ? (
                        <span className={cn("z-num inline-flex items-center gap-z1 text-z-micro rtl:text-z-micro-ar", longWait && "font-medium text-z-caution-ink")}>
                          <Clock className="size-3" aria-hidden="true" />{formatDur(waitMs)}
                        </span>
                      ) : null}
                      {r.status === "in_progress" ? (
                        <span className="z-num inline-flex items-center gap-z1 text-z-micro rtl:text-z-micro-ar text-z-ink-700">
                          <Clock className="size-3" aria-hidden="true" />{formatDur(sessMs)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {renderActions(r)}
                </div>
              </Panel>
            );
          })
        )}
      </div>

      {/* Patient self check-in link dialog */}
      <PlatformDialog
        open={!!selfCheckinRow}
        onOpenChange={(open) => { if (!open && !selfCheckinSaving) setSelfCheckinRow(null); }}
        title={t("selfCheckinLinkTitle")}
        icon={<Link2Icon />}
        dir={isArabic ? "rtl" : "ltr"}
        busy={selfCheckinSaving}
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setSelfCheckinRow(null)} disabled={selfCheckinSaving}>{t("cancel")}</ActionButton>
            {selfCheckinUrl ? (
              <ActionButton onClick={() => void copySelfCheckinLink()}>
                <Link2Icon className="size-4" aria-hidden="true" />
                {t("copyLink")}
              </ActionButton>
            ) : null}
          </>
        }
      >
        <p className="text-z-small rtl:text-z-small-ar text-z-ink-500">{t("selfCheckinLinkDesc")}</p>
        {selfCheckinSaving ? (
          <div className="py-z6 text-center text-z-small rtl:text-z-small-ar text-z-ink-500" role="status" aria-live="polite">
            {isArabic ? "جارٍ إنشاء الرابط…" : "Creating link…"}
          </div>
        ) : selfCheckinUrl ? (
          <div className="space-y-z3">
            <div className="rounded-z2 border border-z-line-edge bg-z-sunk p-z3">
              <div className="text-z-small rtl:text-z-small-ar font-medium text-z-ink-900">{patientName(selfCheckinRow!)}</div>
              <div className="flex flex-wrap items-center gap-x-z3 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
                <span className="z-num">{formatTime(selfCheckinRow?.scheduled_at)}</span>
                <span>{doctorName(selfCheckinRow?.doctor_id ?? null)}</span>
              </div>
            </div>
            <div className="space-y-z1">
              <FieldLabel htmlFor="self-checkin-link">{t("selfCheckinLinkReady")}</FieldLabel>
              <PlatformInput
                id="self-checkin-link"
                value={selfCheckinUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                dir="ltr"
                className="z-ident text-z-micro"
              />
            </div>
            {selfCheckinExpiresAt ? (
              <p className="z-num text-z-micro rtl:text-z-micro-ar text-z-ink-500">{t("linkExpires")}: {formatDateTime(selfCheckinExpiresAt, lang)}</p>
            ) : null}
          </div>
        ) : null}
      </PlatformDialog>

      {/* Walk-in dialog */}
      <PlatformDialog
        open={walkInOpen}
        onOpenChange={(nextOpen) => { if (!walkInSubmittingRef.current) setWalkInOpen(nextOpen); }}
        title={t("newWalkInTitle")}
        icon={<UserPlus />}
        dir={isArabic ? "rtl" : "ltr"}
        busy={walkInSaving}
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setWalkInOpen(false)} disabled={walkInSaving}>{t("cancel")}</ActionButton>
            <ActionButton form="walk-in-form" type="submit" disabled={walkInSaving || !walkInPatient}>{t("save")}</ActionButton>
          </>
        }
      >
        <p className="text-z-small rtl:text-z-small-ar text-z-ink-500">{t("newWalkInDesc")}</p>
        <form id="walk-in-form" onSubmit={submitWalkIn} className="space-y-z3">
          <div className="space-y-z1">
            <FieldLabel>{t("selectPatient")}</FieldLabel>
            <Combobox
              options={walkInPatientSearch.options.map((p) => ({
                value: p.id,
                // Only the patient's name; the "#N" clinic number stays exclusive
                // to the main Patients list. Typing the number still finds them --
                // the server matches it -- it is just not printed here.
                label: p.label,
                // Two patients can share a name; the number they were found by is
                // the one piece of evidence that says which one this is.
                detail: p.phone ?? undefined,
              }))}
              value={walkInPatient}
              onChange={(next) => {
                const picked = walkInPatientSearch.options.find((p) => p.id === next);
                setWalkInEcho(picked ? { id: picked.id, label: picked.label } : null);
                setWalkInPatient(next);
              }}
              placeholder={t("selectPatient")}
              searchPlaceholder={walkInPickerCopy.searchPlaceholder}
              emptyText={walkInPatientSearch.failed ? walkInPickerCopy.failed : walkInPickerCopy.empty}
              searchingText={walkInPickerCopy.searching}
              hintText={
                walkInPatientSearch.options.length >= PATIENT_PICKER_LIMIT
                  ? walkInPickerCopy.truncated
                  : undefined
              }
              selectedLabel={pickedPatientLabel(walkInEcho, walkInPatientSearch.options, walkInPatient)}
              searching={walkInPatientSearch.searching}
              onSearch={(term) => walkInPatientSearch.search(term)}
            />
          </div>
          <div className="space-y-z1">
            <FieldLabel>{t("selectDoctorOptional")}</FieldLabel>
            <Combobox
              options={[{ value: "", label: "—" }, ...doctors.map((d) => ({ value: d.id, label: doctorDisplayName(d, lang) }))]}
              value={walkInDoctor}
              onChange={setWalkInDoctor}
              placeholder={t("selectDoctorOptional")}
            />
          </div>
          <div className="grid grid-cols-2 gap-z2">
            <div className="space-y-z1">
              <FieldLabel>{t("roomOptional")}</FieldLabel>
              <PlatformInput value={walkInRoom} onChange={(e) => setWalkInRoom(e.target.value)} />
            </div>
            <div className="space-y-z1">
              <FieldLabel>{t("procedureOptional")}</FieldLabel>
              <PlatformInput value={walkInProcedure} onChange={(e) => setWalkInProcedure(e.target.value)} />
            </div>
          </div>
        </form>
      </PlatformDialog>

      {/* Reassign doctor dialog */}
      <PlatformDialog
        open={!!reassignRow}
        onOpenChange={(o) => { if (!o) setReassignRow(null); }}
        title={t("reassignDoctorTitle")}
        icon={<UserCog />}
        dir={isArabic ? "rtl" : "ltr"}
        busy={reassignSaving}
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setReassignRow(null)}>{t("cancel")}</ActionButton>
            <ActionButton onClick={submitReassign} disabled={reassignSaving}>{t("save")}</ActionButton>
          </>
        }
      >
        <p className="text-z-small rtl:text-z-small-ar text-z-ink-500">{t("reassignDoctorDesc")}</p>
        <div className="space-y-z1">
          <FieldLabel>{t("doctor")}</FieldLabel>
          <Combobox
            options={[{ value: "", label: `— ${t("unassigned")} —` }, ...doctors.map((d) => ({ value: d.id, label: doctorDisplayName(d, lang) }))]}
            value={reassignDoctor}
            onChange={setReassignDoctor}
            placeholder={t("selectDoctorOptional")}
          />
        </div>
      </PlatformDialog>

      {/* Assign room dialog */}
      <PlatformDialog
        open={!!roomRow}
        onOpenChange={(o) => { if (!o) setRoomRow(null); }}
        title={t("assignRoomTitle")}
        icon={<DoorOpen />}
        dir={isArabic ? "rtl" : "ltr"}
        busy={roomSaving}
        footer={
          <>
            <ActionButton tone="ghost" onClick={() => setRoomValue("")}>{t("clearRoom")}</ActionButton>
            <ActionButton tone="quiet" onClick={() => setRoomRow(null)}>{t("cancel")}</ActionButton>
            <ActionButton onClick={submitRoom} disabled={roomSaving}>{t("save")}</ActionButton>
          </>
        }
      >
        <p className="text-z-small rtl:text-z-small-ar text-z-ink-500">{t("assignRoomDesc")}</p>
        <div className="space-y-z3">
          {roomOptions.length > 0 ? (
            <div className="flex flex-wrap gap-z2">
              {roomOptions.map((rm) => (
                <ActionButton
                  key={rm}
                  tone={roomValue === rm ? "primary" : "quiet"}
                  onClick={() => setRoomValue(rm)}
                  aria-pressed={roomValue === rm}
                >
                  {rm}
                </ActionButton>
              ))}
            </div>
          ) : null}
          <div className="space-y-z1">
            <FieldLabel htmlFor="queue-room-value">{t("room")}</FieldLabel>
            <PlatformInput id="queue-room-value" value={roomValue} onChange={(e) => setRoomValue(e.target.value)} placeholder={t("roomOptional")} />
          </div>
        </div>
      </PlatformDialog>

      {/* Queue settings dialog (localStorage, per-branch) */}
      <PlatformDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={t("queueSettings")}
        icon={<SettingsIcon />}
        dir={isArabic ? "rtl" : "ltr"}
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setSettingsOpen(false)}>{t("cancel")}</ActionButton>
            <ActionButton asChild>
              <a href="/branches">{isArabic ? "افتح إدارة الفروع" : "Open Branches"}</a>
            </ActionButton>
          </>
        }
      >
        <p className="text-z-small rtl:text-z-small-ar text-z-ink-500">{t("queueSettingsDesc")}</p>
        <div className="space-y-z2">
          {[
            [t("longWaitThresholdMin"), `${settings.longWaitMinutes} ${t("minutesShort")}`],
            [t("defaultMyQueueLabel"), settings.defaultMyQueue ? t("enabled") : t("disabled")],
            [t("showNoShowsInDefaultLabel"), settings.showNoShowsInDefault ? t("enabled") : t("disabled")],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-z3 rounded-z2 border border-z-line-edge px-z3 py-z2">
              <SectionLabel className="font-normal text-z-ink-500">{label}</SectionLabel>
              <span className="z-num text-z-small rtl:text-z-small-ar font-medium text-z-ink-900">{value}</span>
            </div>
          ))}
        </div>
        <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">
          {isArabic ? "يتم تعديل هذه الإعدادات من إدارة الفروع." : "These settings are now edited in Branch administration."}
        </p>
      </PlatformDialog>
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "brand" | "positive" | "caution" | "critical";
}) {
  const toneCls =
    tone === "brand"    ? "text-z-brand-700"
  : tone === "positive" ? "text-z-positive-ink"
  : tone === "caution"  ? "text-z-caution-ink"
  : tone === "critical" ? "text-z-critical-ink"
  : "text-z-ink-900";
  return (
    <Panel className="p-z3">
      <div className="flex items-center gap-z2 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
        {icon}<span className="truncate">{label}</span>
      </div>
      <div className={cn("z-num mt-z1 text-z-title rtl:text-z-title-ar font-semibold", toneCls)}>{value}</div>
    </Panel>
  );
}
