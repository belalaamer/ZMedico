import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useDataSync } from "@/lib/dataSync";
import { Fab } from "@/components/ui/fab";
import { ChevronLeft, ChevronRight, Plus, Send, CalendarDays, LayoutGrid, Clock, Filter, X, CalendarRange, Check, ArrowRight, Wallet as WalletIcon, AlertCircle, AlertTriangle, History } from "lucide-react";
import { Can } from "@/components/Can";
import { doctorDisplayName } from "@/lib/doctorName";
import { patientDisplayName } from "@/lib/patientName";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Combobox } from "@/components/ui/combobox";
import { usePatientSearch } from "@/hooks/usePatientSearch";
import { cn } from "@/lib/utils";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { RowActions } from "@/components/RowActions";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildStatusPatch } from "@/lib/appointmentStatus";
import { matchesStatusFilter, nextStatusFilter } from "@/lib/appointmentStatusFilter";
import { reminderSendOutcome } from "@/lib/reminderSendOutcome";
import {
  deepLinkBanner, deepLinkPatientId, patientDeepLinkId, withoutPatientParam,
  type DeepLinkedPatient, type PatientNameRow,
} from "@/lib/calendarPatientDeepLink";
import { PATIENT_PICKER_LIMIT, patientPickerCopy, pickedPatientLabel } from "@/lib/patientSearch";
import { notConfirmedCopy, rowsWritten } from "@/lib/writeOutcome";
import { deskFailure } from "@/lib/deskFailure";
import { localDateTimeInput } from "@/lib/localDate";
import {
  ActionButton,
  FieldLabel,
  Panel,
  PlatformDialog,
  PlatformInput,
  PlatformTextarea,
  SectionLabel,
  SelectField,
  StatusChip,
  TableShell,
  type SignalTone,
} from "@/components/zds/surface";

function statusLabel(s: Appt["status"], t: (k: any) => string) {
  const map: Record<Appt["status"], string> = {
    scheduled: "statusScheduled",
    confirmed: "statusConfirmed",
    in_progress: "statusInProgress",
    completed: "statusCompleted",
    cancelled: "statusCancelled",
    no_show: "statusNoShow",
    departed: "statusDeparted",
  };
  return t(map[s]);
}

type Appt = {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show" | "departed";
  booking_request_status?: "not_applicable" | "pending" | "confirmed" | "rejected" | "expired";
  booking_request_expires_at?: string | null;
  booking_rejection_reason?: string | null;
  service_id: string | null;
  procedure: string | null;
  room: string | null;
  resource_id: string | null;
  notes: string | null;
  services?: { name_en: string | null; name_ar: string | null } | null;
  patients?: { first_name_en: string; last_name_en: string | null; first_name_ar: string | null; last_name_ar: string | null; patient_code: number };
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); const dow = x.getDay(); return addDays(x, -dow); }
function startOfMonth(d: Date) { const x = new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x; }
function sameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

// Signal colour is meaning, never decoration: a status is a chip with a word, and a grid
// block takes its fill and its start-edge accent from the same signal family.
const STATUS_TONE: Record<Appt["status"], SignalTone> = {
  scheduled:   "neutral",
  confirmed:   "positive",
  in_progress: "caution",
  completed:   "positive",
  cancelled:   "critical",
  no_show:     "critical",
  departed:    "neutral",
};

const statusBlock: Record<Appt["status"], string> = {
  scheduled:   "bg-z-brand-050 border-z-brand-100 text-z-ink-900",
  confirmed:   "bg-z-positive-fill border-z-positive-stroke text-z-ink-900",
  in_progress: "bg-z-caution-fill border-z-caution-stroke text-z-ink-900",
  completed:   "bg-z-positive-fill border-z-positive-stroke text-z-ink-900",
  cancelled:   "bg-z-critical-fill border-z-critical-stroke text-z-ink-900 line-through opacity-70",
  no_show:     "bg-z-critical-fill border-z-critical-stroke text-z-ink-900 opacity-70",
  departed:    "bg-z-sunk border-z-line-edge text-z-ink-500",
};

// Start-edge accent per status — makes a block pop on the grid without a second fill.
const statusAccent: Record<Appt["status"], string> = {
  scheduled:   "border-s-z-brand-500",
  confirmed:   "border-s-z-positive",
  in_progress: "border-s-z-caution",
  completed:   "border-s-z-positive",
  cancelled:   "border-s-z-critical",
  no_show:     "border-s-z-critical",
  departed:    "border-s-z-line-strong",
};

// Default fallback when a branch has no working hours configured.
const DEFAULT_DAY_START_HOUR = 0;
const DEFAULT_DAY_END_HOUR = 24; // exclusive
const HOUR_HEIGHT = 56; // px

// Parse "HH:MM[:SS]" → total minutes since midnight. Returns null on bad input.
function parseMinutes(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return Math.max(0, Math.min(24 * 60, h * 60 + mm));
}

// Parse "HH:MM[:SS]" → hour number (0..24). Returns null on bad input.
function parseHour(s: string | null | undefined, mode: "floor" | "ceil"): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h)) return null;
  if (mode === "floor") return Math.max(0, Math.min(24, h));
  // ceil to next full hour if any minutes
  const ceil = mm > 0 ? h + 1 : h;
  return Math.max(0, Math.min(24, ceil));
}

export default function CalendarPage() {
  const { t, lang } = useI18n();
  const { currentBranchId, branchSelectionReady, subscription } = useBranch();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isArabic = lang === "ar";
  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [miniOpen, setMiniOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(new Date()));
  const [items, setItems] = useState<Appt[]>([]);
  const loadRequestRef = useRef(0);
  // Queue's walk-in dialog already guarded this way; the booking dialog didn't,
  // so a double tap on a lagging phone created two appointments.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<{ id: string; full_name: string | null; full_name_en?: string | null; full_name_ar?: string | null }[]>([]);
  const [serviceDoctors, setServiceDoctors] = useState<{ id: string; full_name: string | null; full_name_en?: string | null; full_name_ar?: string | null }[] | null>(null);
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  // Doctor-centric default (FINAL-03 UX audit): mirrors the existing,
  // already-shipped Queue.tsx pattern (see doctorDefaultApplied there) so a
  // logged-in doctor lands on their own schedule instead of the branch-wide
  // list. Applied once per mount; the doctor can freely switch back to "All
  // doctors" afterwards and we do not re-apply. Presentation-only default —
  // does not change the underlying query, filters, or any authorization.
  const [doctorDefaultApplied, setDoctorDefaultApplied] = useState(false);
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [roomBoard, setRoomBoard] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthDots, setMonthDots] = useState<Record<string, number>>({});
  // C4: the booking picker holds one page of server matches, not the clinic. It used to
  // load the newest 200 patients and filter them in the browser, so a patient past #200
  // could not be booked from the calendar at all -- and a name list could never be found
  // by phone.
  const patientSearch = usePatientSearch({ ready: branchSelectionReady, branchId: currentBranchId, lang });
  const patients = patientSearch.options;
  const [rooms, setRooms] = useState<string[]>([]);
  const [services, setServices] = useState<{ id: string; name_en: string; name_ar: string; duration: number }[]>([]);
  const [resources, setResources] = useState<{ id: string; name_en: string; name_ar: string; capacity: number; is_active: boolean }[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    patient_id: "", doctor_id: "", scheduled_at: "", duration_minutes: 30, service_id: "", procedure: "", room: "", resource_id: "", notes: "",
    status: "scheduled" as Appt["status"],
  });
  const [patientCtx, setPatientCtx] = useState<{ wallet: number; outstanding: number; lastVisit: string | null } | null>(null);
  const [patientCtxLoading, setPatientCtxLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingAppointment, setRejectingAppointment] = useState<Appt | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // C3: ?patient_id=<uuid> is written by the patients list and by the profile's Book
  // action. The row is kept, not the label, so a language switch re-labels without a
  // second query.
  const [deepLinkRow, setDeepLinkRow] = useState<{ id: string; row: PatientNameRow | null; failed: boolean } | null>(null);

  // Per-branch working hours window (source of truth: branches.working_hours_start/end).
  const [dayStartHour, setDayStartHour] = useState<number>(DEFAULT_DAY_START_HOUR);
  const [dayEndHour, setDayEndHour] = useState<number>(DEFAULT_DAY_END_HOUR);
  // Exact minutes-since-midnight for the working band (null if branch has no config).
  const [workStartMin, setWorkStartMin] = useState<number | null>(null);
  const [workEndMin, setWorkEndMin] = useState<number | null>(null);

  const [workingDays, setWorkingDays] = useState<number[]>([0,1,2,3,4,5,6]);
  const loadBranchHours = async () => {
    if (!currentBranchId) {
      setDayStartHour(DEFAULT_DAY_START_HOUR);
      setDayEndHour(DEFAULT_DAY_END_HOUR);
      setWorkingDays([0,1,2,3,4,5,6]);
      return;
    }
    const { data } = await supabase
      .from("branches")
      .select("working_hours_start,working_hours_end,working_days")
      .eq("id", currentBranchId)
      .maybeSingle();
    const start = parseHour((data as any)?.working_hours_start, "floor");
    const end = parseHour((data as any)?.working_hours_end, "ceil");
    const sMin = parseMinutes((data as any)?.working_hours_start);
    const eMin = parseMinutes((data as any)?.working_hours_end);
    const wd = (data as any)?.working_days;
    setWorkingDays(Array.isArray(wd) ? wd.map(Number).filter((n: number) => n >= 0 && n <= 6) : [0,1,2,3,4,5,6]);
    if (start != null && end != null && end > start) {
      setDayStartHour(start);
      setDayEndHour(end);
    } else {
      setDayStartHour(DEFAULT_DAY_START_HOUR);
      setDayEndHour(DEFAULT_DAY_END_HOUR);
    }
    if (sMin != null && eMin != null && eMin > sMin) {
      setWorkStartMin(sMin);
      setWorkEndMin(eMin);
    } else {
      setWorkStartMin(null);
      setWorkEndMin(null);
    }
  };
  useEffect(() => { loadBranchHours(); /* eslint-disable-next-line */ }, [currentBranchId]);
  useDataSync(["branches"], () => { loadBranchHours(); });

  // Load patient financial context whenever a patient is picked in the booking dialog
  useEffect(() => {
    if (!open || !form.patient_id || !branchSelectionReady || !currentBranchId) { setPatientCtx(null); return; }
    let cancelled = false;
    setPatientCtxLoading(true);
    (async () => {
      const [walletRes, invRes, lastApptRes] = await Promise.all([
        (supabase as any).from("patient_wallets").select("balance").eq("patient_id", form.patient_id).maybeSingle(),
        supabase.from("invoices").select("total,paid_amount").eq("patient_id", form.patient_id).eq("branch_id", currentBranchId).is("deleted_at", null).in("status", ["pending", "partial"]),
        supabase.from("appointments").select("scheduled_at").eq("patient_id", form.patient_id).eq("branch_id", currentBranchId).is("deleted_at", null).in("status", ["completed", "departed"]).order("scheduled_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      const wallet = Number(walletRes?.data?.balance ?? 0);
      const outstanding = ((invRes.data ?? []) as any[]).reduce((s, r) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)), 0);
      const lastVisit = (lastApptRes.data as any)?.scheduled_at ?? null;
      setPatientCtx({ wallet, outstanding, lastVisit });
      setPatientCtxLoading(false);
    })();
    return () => { cancelled = true; };
  }, [form.patient_id, open, branchSelectionReady, currentBranchId]);

  // Force day view on mobile when user lands on week (too cramped). Month is fine.
  useEffect(() => {
    if (isMobile && view === "week") setView("day");
  }, [isMobile, view]);

  // Keep mini month cursor in sync with selected date
  useEffect(() => {
    setMonthCursor((mc) =>
      (mc.getFullYear() === date.getFullYear() && mc.getMonth() === date.getMonth())
        ? mc
        : startOfMonth(date)
    );
  }, [date]);

  const dayLabel = useMemo(
    () => date.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    [date, lang]
  );

  const rangeStart = useMemo(() => {
    if (view === "day") return startOfDay(date);
    if (view === "week") return startOfWeek(date);
    return startOfMonth(date);
  }, [date, view]);
  const rangeEnd = useMemo(() => {
    if (view === "day") return addDays(rangeStart, 1);
    if (view === "week") return addDays(rangeStart, 7);
    return new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1);
  }, [rangeStart, view]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i)), [rangeStart]);
  const hours = useMemo(
    () => Array.from({ length: Math.max(1, dayEndHour - dayStartHour) }, (_, i) => dayStartHour + i),
    [dayStartHour, dayEndHour]
  );
  // Extra label for the closing hour (e.g. 10 PM) rendered at the bottom
  // edge of the last hour row so the full branch window is visible.
  const endHourLabel = dayEndHour;

  const load = async () => {
    const requestId = ++loadRequestRef.current;
    const branchId = currentBranchId;
    if (!branchSelectionReady || !branchId) {
      setItems([]);
      return;
    }
    {
      const { error: expiryError } = await supabase.rpc("expire_public_booking_requests", { p_branch_id: branchId });
      if (expiryError && !String(expiryError.message).includes("booking_request_expiry_forbidden")) {
        console.warn("Could not expire booking requests", expiryError.message);
      }
    }
    const start = rangeStart.toISOString();
    const end = rangeEnd.toISOString();
    let q = supabase.from("appointments")
      .select("*, patients!inner(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code,deleted_at), services(name_en,name_ar)")
      .gte("scheduled_at", start).lt("scheduled_at", end)
      .is("deleted_at", null)
      .is("patients.deleted_at", null)
      .order("scheduled_at", { ascending: true });
    q = q.eq("branch_id", branchId);
    const { data, error } = await q;
    if (requestId !== loadRequestRef.current) return;
    if (error) {
      const failure = deskFailure(error, lang, isArabic ? "تعذر تحميل التقويم." : "Could not load the calendar.");
      toast.error(failure.title, { description: failure.description });
      return;
    }
    setItems((data ?? []) as any);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [rangeStart.getTime(), rangeEnd.getTime(), branchSelectionReady, currentBranchId]);
  useDataSync(["appointments", "calendar"], () => { void load(); });

  // Load doctor options for filter
  useEffect(() => {
    (async () => {
      // Use SECURITY DEFINER RPC so non-admin roles can populate the doctor filter
      // without direct SELECT on user_roles (which restricts to own row).
      if (!currentBranchId) {
        setDoctors([]);
        return;
      }
      const { data } = await supabase.rpc("list_doctors_for_branch", { _branch_id: currentBranchId });
      const list = ((data ?? []) as any[]).map((p: any) => ({
        id: p.id,
        full_name: p.full_name ?? p.id.slice(0, 8),
        full_name_en: p.full_name_en ?? null,
        full_name_ar: p.full_name_ar ?? null,
      }));
      list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
      setDoctors(list);
    })();
  }, [currentBranchId]);

  // If the signed-in user IS one of the doctors, default the calendar to
  // "My schedule" on first load — mirrors the equivalent, already-approved
  // Queue.tsx behavior. The doctor can switch to "All doctors" freely
  // afterwards; we never re-apply once the default has run.
  useEffect(() => {
    if (doctorDefaultApplied || !user?.id || doctors.length === 0) return;
    if (doctors.some((d) => d.id === user.id)) {
      setDoctorFilter(user.id);
    }
    setDoctorDefaultApplied(true);
  }, [user?.id, doctors, doctorDefaultApplied]);

  const isDoctorUser = !!user?.id && doctors.some((d) => d.id === user.id);
  const bookingDoctors = form.service_id ? (serviceDoctors ?? []) : doctors;

  useEffect(() => {
    if (!form.service_id || !currentBranchId) {
      setServiceDoctors(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).rpc("list_doctors_for_service", {
        p_branch_id: currentBranchId,
        p_service_id: form.service_id,
        p_service_kind: "service",
      });
      if (cancelled) return;
      if (error) {
        const failure = deskFailure(error, lang, isArabic ? "تعذر تحميل أطباء هذه الخدمة." : "Could not load the doctors for this service.");
        toast.error(failure.title, { description: failure.description });
        setServiceDoctors([]);
        return;
      }
      setServiceDoctors((data ?? []) as typeof doctors);
      if (form.doctor_id && !(data ?? []).some((doctor: { id: string }) => doctor.id === form.doctor_id)) {
        setForm((current) => ({ ...current, doctor_id: "" }));
      }
    })();
    return () => { cancelled = true; };
  }, [form.service_id, currentBranchId]);

  // Read ?date=YYYY-MM-DD and ?appt=<id> from URL
  useEffect(() => {
    const d = searchParams.get("date");
    const appt = searchParams.get("appt");
    if (d) {
      const parsed = new Date(d + "T00:00:00");
      if (!isNaN(parsed.getTime())) {
        setDate(startOfDay(parsed));
        setMonthCursor(startOfMonth(parsed));
        setView("day");
      }
    }
    if (appt) {
      setHighlightId(appt);
      const tm = setTimeout(() => {
        const el = document.getElementById(`appt-${appt}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      const clear = setTimeout(() => {
        setHighlightId(null);
        const next = new URLSearchParams(searchParams);
        next.delete("appt");
        next.delete("date");
        setSearchParams(next, { replace: true });
      }, 4000);
      return () => { clearTimeout(tm); clearTimeout(clear); };
    }
    // eslint-disable-next-line
  }, [searchParams]);


  // C3: resolve the deep-linked patient once per id. A failed lookup and a patient that
  // genuinely is not there are kept apart, because the desk needs to know which happened.
  const deepLinkId = patientDeepLinkId(searchParams.get("patient_id"));
  useEffect(() => {
    if (!deepLinkId) { setDeepLinkRow(null); return; }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("patients")
        .select("id,first_name_en,last_name_en,first_name_ar,last_name_ar,name_language")
        .eq("id", deepLinkId).is("deleted_at", null).maybeSingle();
      if (cancelled) return;
      if (error) { setDeepLinkRow({ id: deepLinkId, row: null, failed: true }); return; }
      setDeepLinkRow({ id: deepLinkId, row: (data ?? null) as PatientNameRow | null, failed: false });
    })();
    return () => { cancelled = true; };
  }, [deepLinkId]);

  const deepLink: DeepLinkedPatient | null = useMemo(() => {
    if (!deepLinkId || deepLinkRow?.id !== deepLinkId) return null;
    return {
      id: deepLinkId,
      name: deepLinkRow.row ? patientDisplayName(deepLinkRow.row, lang) : null,
      lookupFailed: deepLinkRow.failed,
    };
  }, [deepLinkRow, deepLinkId, lang]);

  const deepLinkPending = Boolean(deepLinkId) && !deepLink;
  const deepLinkCopy = deepLinkBanner(lang, deepLink);

  const clearPatientDeepLink = () => {
    if (deepLinkId) {
      // "Clear patient" means the form too, not only the banner: the id it just
      // removed was the one the picker was holding.
      setForm((current) => (current.patient_id === deepLinkId ? { ...current, patient_id: "" } : current));
      setPatientEcho((current) => (current?.id === deepLinkId ? null : current));
      setSearchParams(withoutPatientParam(searchParams), { replace: true });
    }
    setDeepLinkRow(null);
  };

  // The page of matches is bounded, so the chosen patient is often legitimately absent
  // from it. The row the desk picked -- or the appointment being edited -- names them.
  const [patientEcho, setPatientEcho] = useState<{ id: string; label: string } | null>(null);
  const bookingPatientLabel = (patientId: string): string | null =>
    pickedPatientLabel(patientEcho, patients, patientId)
    ?? (patientId && deepLinkPatientId(deepLink) === patientId ? deepLink?.name ?? null : null);

  const pickerCopy = patientPickerCopy(lang);
  const loadPatientOptions = (term: string) => {
    void patientSearch.search(term);
  };
  useDataSync(["patients"], () => patientSearch.reload());

  // Month dots
  const loadMonthDots = async () => {
    if (!branchSelectionReady || !currentBranchId) {
      setMonthDots({});
      return;
    }
    const start = startOfMonth(monthCursor).toISOString();
    const endDate = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    const end = endDate.toISOString();
    let q = supabase.from("appointments")
      .select("scheduled_at")
      .gte("scheduled_at", start).lt("scheduled_at", end)
      .is("deleted_at", null)
      // The dot is "how busy is this day"; a cancelled visit is not work, and
      // cancellation is a status, so deleted_at alone kept counting it.
      .neq("status", "cancelled")
      .eq("branch_id", currentBranchId);
    const { data } = await q;
    const dots: Record<string, number> = {};
    for (const r of (data ?? []) as { scheduled_at: string }[]) {
      const k = new Date(r.scheduled_at).toDateString();
      dots[k] = (dots[k] ?? 0) + 1;
    }
    setMonthDots(dots);
  };
  useEffect(() => { void loadMonthDots(); /* eslint-disable-next-line */ }, [monthCursor.getTime(), branchSelectionReady, currentBranchId]);
  useDataSync(["appointments"], () => { void loadMonthDots(); });

  // Booking uses tenant-scoped services/visit types. Clinical procedures remain
  // part of the medical record rather than the receptionist-facing booking list.
  const loadServices = () => {
    if (!branchSelectionReady || !currentBranchId || !subscription?.tenant_id) {
      setServices([]);
      return;
    }
    supabase.from("services")
      .select("id,name_en,name_ar,default_duration_minutes")
      .eq("tenant_id", subscription.tenant_id)
      .eq("is_active", true).eq("requires_appointment", true).is("deleted_at", null)
      .order("display_order").order("name_en")
      .then(({ data }) => {
        setServices((data ?? []).map((s: any) => ({
          id: s.id,
          name_en: s.name_en || s.name_ar || "",
          name_ar: s.name_ar || s.name_en || "",
          duration: Number(s.default_duration_minutes) || 30,
        })));
      });
  };
  const loadRooms = async () => {
    if (!branchSelectionReady || !currentBranchId) {
      setResources([]);
      setRooms([]);
      return;
    }
    const resourceQuery = (supabase as any).from("booking_resources")
      .select("id,name_en,name_ar,capacity,is_active")
      .eq("branch_id", currentBranchId)
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    const appointmentQuery = supabase.from("appointments").select("room").eq("branch_id", currentBranchId).not("room", "is", null).is("deleted_at", null).limit(1000);
    const [{ data: resourceData }, { data: appointmentData }] = await Promise.all([resourceQuery, appointmentQuery]);
    const nextResources = (resourceData ?? []) as { id: string; name_en: string; name_ar: string; capacity: number; is_active: boolean }[];
    setResources(nextResources);
    const set = new Set<string>(nextResources.map((r) => r.name_en).filter(Boolean));
    (appointmentData ?? []).forEach((r: any) => { if (r.room) set.add(String(r.room).trim()); });
    setRooms(Array.from(set).sort());
  };
  useEffect(() => { loadServices(); }, [lang, branchSelectionReady, currentBranchId, subscription?.tenant_id]);
  useEffect(() => { void loadRooms(); }, [branchSelectionReady, currentBranchId]);
  useDataSync(["appointments"], () => { void loadRooms(); });

  const openNew = () => {
    setEditId(null);
    // UX fix: this entry point (the toolbar "New Appointment" button and the
    // mobile FAB) previously left scheduled_at completely empty -- unlike
    // openNewAt() below (triggered by clicking a grid slot), which always
    // prefills it. An empty required datetime-local field gives no visual
    // cue that anything is wrong until the user tries to save, so default
    // it to the next half-hour slot on the day currently being viewed --
    // easy to adjust, never blank.
    const now = new Date();
    const base = sameDay(date, now) ? new Date(now) : (() => { const d = new Date(date); d.setHours(9, 0, 0, 0); return d; })();
    // Round up to the next 30-minute mark (e.g. 10:07 -> 10:30, 10:35 -> 11:00).
    const remainder = base.getMinutes() % 30;
    if (remainder !== 0 || base.getSeconds() > 0) base.setMinutes(base.getMinutes() + (30 - remainder), 0, 0);
    const local = localDateTimeInput(base);
    // C3: an arrival from a patient screen carries that patient into the form instead of
    // being discarded, and an unverified id is never prefilled.
    const linked = deepLinkPatientId(deepLink);
    setPatientEcho(linked && deepLink?.name ? { id: linked, label: deepLink.name } : null);
    setForm({ patient_id: linked, doctor_id: "", scheduled_at: local, duration_minutes: 30, service_id: "", procedure: "", room: "", resource_id: "", notes: "", status: "scheduled" });
    setOpen(true);
  };
  const openNewAt = (slot: Date) => {
    setEditId(null);
    const local = localDateTimeInput(slot);
    const linked = deepLinkPatientId(deepLink);
    setPatientEcho(linked && deepLink?.name ? { id: linked, label: deepLink.name } : null);
    setForm({ patient_id: linked, doctor_id: "", scheduled_at: local, duration_minutes: 30, service_id: "", procedure: "", room: "", resource_id: "", notes: "", status: "scheduled" });
    setOpen(true);
  };
  const openEdit = (a: Appt) => {
    setEditId(a.id);
    const dt = new Date(a.scheduled_at);
    const local = localDateTimeInput(dt);
    setPatientEcho(a.patient_id && a.patients ? { id: a.patient_id, label: patientDisplayName(a.patients, lang) } : null);
    setForm({
      patient_id: a.patient_id,
      doctor_id: a.doctor_id ?? "",
      scheduled_at: local,
      duration_minutes: a.duration_minutes,
      service_id: a.service_id ?? "",
      procedure: a.procedure ?? "",
      room: a.room ?? "",
      resource_id: a.resource_id ?? resources.find((resource) => resource.name_en === a.room)?.id ?? "",
      notes: a.notes ?? "",
      status: a.status,
    });
    setOpen(true);
  };

  // Soft-cancel an appointment instead of hard-deleting it so the row stays
  // available for queue history, reports, and audit. Hard delete is no longer
  // exposed in the UI; admins can purge rows via the database directly.
  const cancelAppointment = async (a: Appt): Promise<void> => {
    if (a.status === "cancelled") { toast.message(isArabic ? "الموعد ملغي بالفعل" : "Appointment already cancelled"); return; }
    const patch = buildStatusPatch("cancelled", {
      checked_in_at: (a as any).checked_in_at ?? null,
      started_at: (a as any).started_at ?? null,
    });
    const { data, error } = await supabase.from("appointments").update(patch as any).eq("id", a.id).select("id");
    if (error) {
      const failure = deskFailure(error, lang, isArabic ? "تعذر إلغاء الموعد." : "The appointment could not be cancelled.");
      toast.error(failure.title, { description: failure.description });
      return;
    }
    if (rowsWritten(data) === 0) { toast.error(notConfirmedCopy(lang, "save")); load(); return; }
    toast.success(isArabic ? "تم إلغاء الموعد" : "Appointment cancelled");
    load();
  };

  const changeStatus = async (a: Appt, status: Appt["status"]): Promise<void> => {
    // Use shared helper so checked_in_at / started_at stay consistent with Queue.
    const patch = buildStatusPatch(status, {
      checked_in_at: (a as any).checked_in_at ?? null,
      started_at: (a as any).started_at ?? null,
    });
    const { data, error } = await supabase.from("appointments").update(patch as any).eq("id", a.id).select("id");
    if (error) {
      const failure = deskFailure(error, lang, isArabic ? "تعذر تحديث حالة الموعد." : "The appointment status could not be changed.");
      toast.error(failure.title, { description: failure.description });
      return;
    }
    if (rowsWritten(data) === 0) { toast.error(notConfirmedCopy(lang, "save")); load(); return; }
    toast.success(t("saved"));
    load();
  };

  const editingAppointment = editId ? items.find((item) => item.id === editId) ?? null : null;

  const confirmBookingRequest = async (appointment: Appt) => {
    if (actionBusy) return;
    setActionBusy(true);
    const { error } = await supabase.rpc("confirm_public_booking", { p_appointment_id: appointment.id });
    setActionBusy(false);
    if (error) {
      const message = String(error.message || "");
      toast.error(message.includes("booking_request_expired")
        ? (isArabic ? "انتهت مهلة طلب الحجز وتحررت السعة." : "The booking request expired and its capacity was released.")
        : message.includes("slot_unavailable")
          ? (isArabic ? "لم تعد السعة متاحة لهذا الموعد." : "The capacity is no longer available for this appointment.")
          : (isArabic ? "تعذر تأكيد طلب الحجز." : "Could not confirm the booking request."));
      await load();
      return;
    }
    toast.success(isArabic ? "تم تأكيد طلب الحجز" : "Booking request confirmed");
    setOpen(false);
    await load();
  };

  const openRejectDialog = (appointment: Appt) => {
    setRejectingAppointment(appointment);
    setRejectReason("");
    setRejectOpen(true);
  };

  const rejectBookingRequest = async () => {
    if (!rejectingAppointment || actionBusy) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error(isArabic ? "اكتب سبب رفض طلب الحجز" : "Enter a reason for rejecting the booking request");
      return;
    }
    setActionBusy(true);
    const { error } = await supabase.rpc("reject_public_booking", {
      p_appointment_id: rejectingAppointment.id,
      p_reason: reason,
    });
    setActionBusy(false);
    if (error) {
      toast.error(isArabic ? "تعذر رفض طلب الحجز" : "Could not reject the booking request");
      return;
    }
    toast.success(isArabic ? "تم رفض طلب الحجز وتحرير السعة" : "Booking request rejected and capacity released");
    setRejectOpen(false);
    setRejectingAppointment(null);
    setOpen(false);
    await load();
  };

  // Forward-only progression along the standard reception flow.
  const nextStatus = (s: Appt["status"]): Appt["status"] | null => {
    switch (s) {
      case "scheduled":   return "confirmed";
      case "confirmed":   return "in_progress";
      case "in_progress": return "completed";
      default: return null;
    }
  };
  const nextStatusLabel = (s: Appt["status"]): string | null => {
    const n = nextStatus(s);
    if (!n) return null;
    if (isArabic) {
      return n === "confirmed" ? "وصل" : n === "in_progress" ? "ابدأ" : "تم";
    }
    return n === "confirmed" ? "Arrived" : n === "in_progress" ? "Start" : "Done";
  };

  const sendReminderNow = async (a: Appt) => {
    // Find a pending reminder for this appointment (or create an immediate one) then trigger send.
    const { data: existing } = await supabase
      .from("reminders")
      .select("id")
      .eq("appointment_id", a.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    let reminderId = existing?.id as string | undefined;
    if (!reminderId) {
      const p = a.patients!;
      const nameEn = patientDisplayName(p, "en");
      const nameAr = patientDisplayName(p, "ar");
      const when = new Date(a.scheduled_at).toLocaleString();
      const { data: ins, error: insErr } = await supabase.from("reminders").insert({
        appointment_id: a.id, patient_id: a.patient_id, branch_id: currentBranchId,
        reminder_type: "whatsapp", scheduled_time: new Date().toISOString(),
        message_en: `Hi ${nameEn}, reminder for your appointment on ${when}.`,
        message_ar: `مرحبا ${nameAr}، تذكير بموعدك في ${when}.`,
        status: "pending",
      } as any).select("id").single();
      if (insErr) {
        const failure = deskFailure(insErr, lang, isArabic ? "تعذر جدولة التذكير." : "The reminder could not be scheduled.");
        toast.error(failure.title, { description: failure.description });
        return;
      }
      reminderId = ins!.id as string;
    }
    const { data, error } = await supabase.functions.invoke("send-reminder", { body: { reminder_id: reminderId } });
    const outcome = await reminderSendOutcome({ data: data as any, error, lang, single: true });
    if (outcome.tone === "error") toast.error(outcome.title, { description: outcome.description });
    else toast.success(outcome.title, { description: outcome.description });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // UX fix: this validation message was hardcoded in English regardless of
    // the active language, and was a single generic message even when only
    // one of the two required fields was missing. Localized, and now names
    // the specific missing field(s) so the user knows exactly what to fix
    // instead of guessing.
    if (!form.patient_id || !form.scheduled_at) {
      const missing = !form.patient_id && !form.scheduled_at
        ? (isArabic ? "المريض والتاريخ/الوقت" : "a patient and a date/time")
        : !form.patient_id
          ? (isArabic ? "المريض" : "a patient")
          : (isArabic ? "التاريخ والوقت" : "a date/time");
      toast.error(isArabic ? `من فضلك اختر ${missing}` : `Please select ${missing}`);
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
    const payload: any = {
      patient_id: form.patient_id,
      doctor_id: form.doctor_id || null,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_minutes: Number(form.duration_minutes) || 30,
      service_id: form.service_id || null,
      procedure: form.procedure || null,
      resource_id: form.resource_id || null,
      room: form.resource_id ? (resources.find((resource) => resource.id === form.resource_id)?.name_en || form.room || null) : (form.room || null),
      notes: form.notes || null,
    };
    if (editId && editingAppointment && form.status !== editingAppointment.status) {
      // The row quick-actions and this dialog were two separate implementations
      // of the same transition. Only the quick-actions kept the queue stamps,
      // so reopening a visit here left a stale checked_in_at and the Queue board
      // still showed a patient who was no longer in the room.
      Object.assign(payload, buildStatusPatch(form.status, {
        checked_in_at: (editingAppointment as any).checked_in_at ?? null,
        started_at: (editingAppointment as any).started_at ?? null,
      }));
    } else if (editId) {
      payload.status = form.status;
    }
    // Only the edit arm needs the read-back: an insert the policy rejects
    // raises (42501) and lands in the error path below, while an update that
    // filters to zero rows answers 2xx with no error.
    const { data, error } = editId
      ? await supabase.from("appointments").update(payload).eq("id", editId).select("id")
      : await supabase.from("appointments").insert({ ...payload, branch_id: currentBranchId, status: "scheduled" });
    if (error) {
      const failure = deskFailure(error, lang, isArabic ? "تعذر حفظ الموعد." : "The appointment could not be saved.");
      toast.error(failure.title, { description: failure.description });
      return;
    }
    if (editId && rowsWritten(data) === 0) { toast.error(notConfirmedCopy(lang, "save")); load(); return; }
    toast.success(isArabic ? "تم حفظ الموعد" : "Appointment saved");
    setOpen(false); setEditId(null);
    // C3: the link asked for one booking; keeping it would prefill the next form with the
    // patient who was just saved.
    clearPatientDeepLink();
    setPatientEcho(null);
    setForm({ patient_id: "", doctor_id: "", scheduled_at: "", duration_minutes: 30, service_id: "", procedure: "", room: "", resource_id: "", notes: "", status: "scheduled" });
    load();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Doctor/room scope only: the status cards below report this set, so their
  // numbers survive whichever card the operator selects.
  const scopedItems = useMemo(() => {
    return items.filter((a) => {
      if (doctorFilter !== "all" && (a.doctor_id ?? "__none__") !== doctorFilter) return false;
      if (roomFilter !== "all" && (a.room ?? "__none__") !== roomFilter) return false;
      return true;
    });
  }, [items, doctorFilter, roomFilter]);

  // Group items by day for week view
  const itemsByDay = useMemo(() => {
    const filtered = scopedItems.filter((a) => matchesStatusFilter(statusFilter, a.status));
    const map: Record<string, Appt[]> = {};
    for (const a of filtered) {
      const k = new Date(a.scheduled_at).toDateString();
      (map[k] ??= []).push(a);
    }
    return map;
  }, [scopedItems, statusFilter]);

  const filteredItems = useMemo(
    () => Object.values(itemsByDay).flat(),
    [itemsByDay]
  );

  const roomBoardColumns = useMemo(() => {
    if (!resources.length) return [];
    const dayItems = itemsByDay[date.toDateString()] ?? [];
    const hasUnassigned = dayItems.some((item) => !resources.some((resource) => resource.id === item.resource_id || (!item.resource_id && (item.room === resource.name_en || item.room === resource.name_ar))));
    return hasUnassigned ? [...resources, { id: "__unassigned__", name_en: "Unassigned", name_ar: "بدون غرفة", capacity: 0, is_active: true }] : resources;
  }, [resources, itemsByDay, date]);

  const roomBoardMatches = (item: Appt, resource: { id: string; name_en: string; name_ar: string }) =>
    item.resource_id === resource.id || (!item.resource_id && (item.room === resource.name_en || item.room === resource.name_ar));

  // Stats for current visible range
  const stats = useMemo(() => {
    const s = { total: scopedItems.length, upcoming: 0, completed: 0, missed: 0 };
    for (const a of scopedItems) {
      if (matchesStatusFilter("upcoming", a.status)) s.upcoming++;
      else if (matchesStatusFilter("completed", a.status)) s.completed++;
      else if (matchesStatusFilter("missed", a.status)) s.missed++;
    }
    return s;
  }, [scopedItems]);

  // Block position for time grid.
  //
  // Bug fix: an appointment scheduled outside the branch's configured
  // working-hours window (dayStartHour..dayEndHour) previously produced a
  // `top` value outside the day column's own bounds -- e.g. a 10:00 AM
  // appointment when the visible grid only covers 3 PM-10 PM computed to
  // `top: -300px`. Since the day column has no fixed/clipped height of its
  // own (its height comes implicitly from the stacked hour rows) and no
  // overflow clipping, that put the absolutely-positioned appointment card
  // outside the grid's visible area entirely -- overlapping whatever UI sits
  // above it (or scrolled out of reach with no way to scroll further up),
  // making the appointment effectively invisible/misplaced even though the
  // underlying scheduled_at was stored correctly. This is a real scenario:
  // walk-ins, emergencies, or manually-created appointments can legitimately
  // fall outside standard business hours.
  //
  // Fix: clamp `top` to the visible grid range [0, gridHeightPx - height],
  // and flag clamped (out-of-hours) appointments with `isOutOfHours` so the
  // caller can render a visual indicator -- the displayed time label itself
  // (via timeStr) is untouched and always reflects the real scheduled_at.
  const blockStyle = (a: Appt, lane = 0, lanes = 1) => {
    const dt = new Date(a.scheduled_at);
    const minutesFromStart = (dt.getHours() - dayStartHour) * 60 + dt.getMinutes();
    const rawTop = (minutesFromStart / 60) * HOUR_HEIGHT;
    const height = Math.max(28, (a.duration_minutes / 60) * HOUR_HEIGHT - 2);
    const gridHeightPx = Math.max(1, dayEndHour - dayStartHour) * HOUR_HEIGHT;
    const top = Math.max(0, Math.min(rawTop, gridHeightPx - height));
    const isOutOfHours = rawTop !== top;
    // Side-by-side lanes when appointments overlap. Small horizontal padding
    // is applied via inline left/right instead of the previous inset-x-1.
    const gap = 2; // px between lanes
    const widthPct = 100 / lanes;
    const leftPct = widthPct * lane;
    return {
      style: {
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPct}% + ${lane === 0 ? 4 : gap}px)`,
        width: `calc(${widthPct}% - ${lane === 0 || lane === lanes - 1 ? 6 : gap * 2}px)`,
      } as React.CSSProperties,
      isOutOfHours,
    };
  };

  // Assign each appointment to a lane so overlapping events render side-by-side.
  // Returns Map<apptId, {lane, lanes}> where `lanes` = total lanes in the
  // overlap cluster the appt belongs to.
  const layoutDay = (day: Appt[]) => {
    const sorted = [...day].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
    const out = new Map<string, { lane: number; lanes: number }>();
    let cluster: Appt[] = [];
    let clusterEnd = 0;
    const flush = () => {
      if (!cluster.length) return;
      const lanes: number[] = []; // end-time per lane
      const assigned: Record<string, number> = {};
      for (const a of cluster) {
        const s = new Date(a.scheduled_at).getTime();
        const e = s + a.duration_minutes * 60000;
        let idx = lanes.findIndex((end) => end <= s);
        if (idx === -1) { lanes.push(e); idx = lanes.length - 1; }
        else lanes[idx] = e;
        assigned[a.id] = idx;
      }
      const total = lanes.length;
      for (const a of cluster) out.set(a.id, { lane: assigned[a.id], lanes: total });
      cluster = [];
      clusterEnd = 0;
    };
    for (const a of sorted) {
      const s = new Date(a.scheduled_at).getTime();
      const e = s + a.duration_minutes * 60000;
      if (cluster.length && s >= clusterEnd) flush();
      cluster.push(a);
      clusterEnd = Math.max(clusterEnd, e);
    }
    flush();
    return out;
  };

  const timeStr = (d: Date) => d.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US",
    { hour: "2-digit", minute: "2-digit", hour12: true });
  const fullName = (p: NonNullable<Appt["patients"]>) => patientDisplayName(p, lang);
  const appointmentServiceLabel = (a: Appt) => {
    if (a.services) return lang === "ar" ? (a.services.name_ar || a.services.name_en) : (a.services.name_en || a.services.name_ar);
    return a.procedure;
  };

  const renderApptBlock = (a: Appt, lane = 0, lanes = 1) => {
    const { style, isOutOfHours } = blockStyle(a, lane, lanes);
    return (
    <button
      key={a.id}
      id={`appt-${a.id}`}
      onClick={(e) => { e.stopPropagation(); navigate(`/appointments/${a.id}`); }}
      className={cn(
        "absolute overflow-hidden rounded-z2 border border-s-4 px-z2 py-z1 text-start shadow-z1",
        "transition-[transform,box-shadow] duration-zquick ease-z-out hover:z-20 hover:shadow-z2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-z-brand-500",
        statusBlock[a.status],
        statusAccent[a.status],
        highlightId === a.id && "z-20 ring-2 ring-z-brand-500 shadow-z2",
        lanes > 1 && "ring-1 ring-z-raised",
        // Pinned to the top/bottom edge of the visible grid because its real
        // time falls outside the branch's configured working hours -- the
        // ring calls that out so the pinned position isn't mistaken for the
        // actual appointment time (shown correctly below regardless).
        isOutOfHours && "ring-2 ring-z-line-strong",
        // A public booking awaiting staff confirmation must be easy to spot
        // without opening it -- without this ring it renders identically to
        // any other scheduled appointment on the grid.
        a.booking_request_status === "pending" && "ring-2 ring-z-caution ring-offset-1",
      )}
      style={style}
      title={`${fullName(a.patients!)} · ${timeStr(new Date(a.scheduled_at))}${isOutOfHours ? ` (${isArabic ? "خارج ساعات العمل" : "outside working hours"})` : ""}`}
    >
      <div className="truncate text-z-micro rtl:text-z-micro-ar font-semibold leading-tight text-z-ink-900">
        {fullName(a.patients!)}
      </div>
      <div className="flex flex-wrap items-center gap-x-z1 truncate text-z-micro rtl:text-z-micro-ar leading-tight text-z-ink-500">
        <span className="z-num">{timeStr(new Date(a.scheduled_at))}</span>
        {isOutOfHours ? <AlertTriangle className="size-3 shrink-0 text-z-caution-ink" aria-hidden="true" /> : null}
        {a.booking_request_status === "pending" ? (
          <span className="font-semibold text-z-caution-ink" title={isArabic ? "طلب حجز في انتظار التأكيد" : "Booking request awaiting confirmation"}>
            {isArabic ? "بانتظار التأكيد" : "Needs confirmation"}
          </span>
        ) : null}
      </div>
      {(appointmentServiceLabel(a) || a.room) ? (
        <div className="truncate text-z-micro rtl:text-z-micro-ar leading-tight text-z-ink-500">
          {appointmentServiceLabel(a) || "—"}{a.room ? ` · ${a.room}` : ""}
        </div>
      ) : null}
    </button>
    );
  };

  // Month grid (sidebar mini calendar)
  const monthGrid = useMemo(() => {
    const first = startOfMonth(monthCursor);
    const leading = first.getDay();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < leading; i++) cells.push(null);
    const daysIn = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysIn; d++) cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor]);

  const weekHeader = (d: Date) => d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { weekday: "short" });

  // Now-line position (only on current day cells)
  const now = new Date();
  const nowTop = ((now.getHours() - dayStartHour) * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT;
  const showNowLine = now.getHours() >= dayStartHour && now.getHours() < dayEndHour;

  const sidebarContent = (
    <div className="space-y-z4">
      <Panel className={cn("p-z4", (workStartMin == null || workEndMin == null) && "border-dashed bg-z-sunk")}>
        {(workStartMin == null || workEndMin == null) && (
          <div className="mb-z3 text-center text-z-micro rtl:text-z-micro-ar leading-snug text-z-ink-500">
            {isArabic ? "لا توجد ساعات عمل محددة لهذا الفرع" : "No working hours for this branch"}
          </div>
        )}
        <div className="mb-z3 flex items-center justify-between">
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
            className="inline-flex size-7 items-center justify-center rounded-z2 hover:bg-z-sunk">
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </button>
          <div className="text-z-small rtl:text-z-small-ar font-semibold text-z-ink-900">
            {monthCursor.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { month: "long", year: "numeric" })}
          </div>
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
            className="inline-flex size-7 items-center justify-center rounded-z2 hover:bg-z-sunk">
            <ChevronRight className="size-4 rtl:rotate-180" />
          </button>
        </div>
        <div className="mb-z1 grid grid-cols-7 gap-z1 text-center text-z-micro rtl:text-z-micro-ar text-z-ink-500">
          {(isArabic
            ? ["أحد","اثن","ثلا","أرب","خمي","جمع","سبت"]
            : ["S","M","T","W","T","F","S"]
          ).map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-z1 text-center text-z-micro rtl:text-z-micro-ar">
          {monthGrid.map((d, i) => {
            if (!d) return <div key={i} />;
            const active = sameDay(d, date);
            const today = sameDay(d, new Date());
            const count = monthDots[d.toDateString()] ?? 0;
            return (
              <button key={i} onClick={() => { setDate(d); setMiniOpen(false); }}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-z2",
                  active ? "bg-z-brand-700 text-z-raised" : today ? "ring-1 ring-z-brand-500 text-z-brand-700" : "hover:bg-z-sunk",
                )}>
                <span className="z-num font-medium">{d.getDate()}</span>
                {count > 0 && (
                  <span className={cn("absolute bottom-1 size-1 rounded-full", active ? "bg-z-raised" : "bg-z-brand-500")} />
                )}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );

  const viewOptions: { key: "day" | "week" | "month"; label: string; icon: React.ReactNode; hideOnMobile?: boolean }[] = [
    { key: "day", label: isArabic ? "يوم" : "Day", icon: <CalendarDays className="size-4" aria-hidden="true" /> },
    { key: "week", label: isArabic ? "أسبوع" : "Week", icon: <LayoutGrid className="size-4" aria-hidden="true" />, hideOnMobile: true },
    { key: "month", label: isArabic ? "شهر" : "Month", icon: <CalendarRange className="size-4" aria-hidden="true" /> },
  ];

  return (
    <div className="z-desk min-h-screen space-y-z6 p-z4 sm:p-z6" dir={isArabic ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-z3">
        <div className="min-w-0">
          <h1 className="text-z-title rtl:text-z-title-ar font-semibold text-z-ink-900">{t("calendar")}</h1>
          <p className="z-num mt-z1 text-z-small rtl:text-z-small-ar text-z-ink-500">{dayLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-z2">
          <div className="inline-flex overflow-hidden rounded-z2 border border-z-line-edge bg-z-raised">
            {viewOptions.filter((o) => !(o.hideOnMobile && isMobile)).map((o) => (
              <button
                key={o.key}
                onClick={() => setView(o.key)}
                aria-pressed={view === o.key}
                className={cn(
                  "inline-flex h-z9 items-center gap-z1 border-s border-z-line-edge px-z3 text-z-small rtl:text-z-small-ar first:border-s-0",
                  view === o.key ? "bg-z-sunk text-z-ink-900" : "text-z-ink-500 hover:bg-z-sunk",
                )}
              >
                {o.icon} {o.label}
              </button>
            ))}
          </div>
          {view === "day" && resources.length ? (
            <ActionButton tone={roomBoard ? "primary" : "quiet"} onClick={() => setRoomBoard((value) => !value)} aria-pressed={roomBoard}>
              <LayoutGrid className="size-4" aria-hidden="true" />{isArabic ? "جدول الغرف" : "Room board"}
            </ActionButton>
          ) : null}
          <ActionButton
            tone="quiet"
            aria-label={isArabic ? "الفترة السابقة" : "Previous period"}
            onClick={() => {
              if (view === "month") setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1));
              else setDate(addDays(date, view === "week" ? -7 : -1));
            }}
          ><ChevronLeft className="size-4 rtl:rotate-180" /></ActionButton>
          <ActionButton tone="quiet" onClick={() => setDate(startOfDay(new Date()))}>{t("today")}</ActionButton>
          <ActionButton
            tone="quiet"
            aria-label={isArabic ? "الفترة التالية" : "Next period"}
            onClick={() => {
              if (view === "month") setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1));
              else setDate(addDays(date, view === "week" ? 7 : 1));
            }}
          ><ChevronRight className="size-4 rtl:rotate-180" /></ActionButton>
          <Popover open={miniOpen} onOpenChange={setMiniOpen}>
            <PopoverTrigger asChild>
              <ActionButton tone="quiet" aria-label={isArabic ? "التقويم" : "Calendar"}>
                <CalendarDays className="size-4" />
              </ActionButton>
            </PopoverTrigger>
            <PopoverContent align="end" className="z-desk w-[320px] border-z-line-edge bg-z-raised p-z2">
              {sidebarContent}
            </PopoverContent>
          </Popover>
          {/* Escape or a backdrop tap during the save hid the form while the write
              was still landing, so the operator never knew which way it went. */}
          <ActionButton className="hidden md:inline-flex" onClick={openNew}>
            <Plus className="size-4" aria-hidden="true" />
            {t("newAppointment")}
          </ActionButton>
        </div>
      </div>

      {/* C3: the patient the link arrived with, stated out loud instead of silently dropped. */}
      {deepLinkPending || deepLinkCopy ? (
        <Panel className="flex flex-wrap items-center justify-between gap-z3 border-z-brand-100 bg-z-brand-050 px-z3 py-z2">
          {deepLinkPending || !deepLinkCopy ? (
            <span role="status" className="text-z-small rtl:text-z-small-ar text-z-ink-500">
              {isArabic ? "جارٍ التحقق من المريض…" : "Checking the patient…"}
            </span>
          ) : (
            <>
              <div className="min-w-0">
                <div className="truncate text-z-small rtl:text-z-small-ar font-semibold text-z-ink-900">{deepLinkCopy.title}</div>
                <div className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{deepLinkCopy.detail}</div>
              </div>
              <div className="flex shrink-0 items-center gap-z1">
                <ActionButton tone={deepLink?.name ? "primary" : "quiet"} onClick={openNew}>
                  <Plus className="size-4" aria-hidden="true" />{deepLinkCopy.action}
                </ActionButton>
                <ActionButton tone="ghost" aria-label={deepLinkCopy.dismiss} onClick={clearPatientDeepLink}>
                  <X className="size-4" />
                </ActionButton>
              </div>
            </>
          )}
        </Panel>
      ) : null}

      {/* Stats strip — each card filters the list to exactly what it counted */}
      <div className="grid grid-cols-2 gap-z3 md:grid-cols-4">
        {([
          { key: "all",      label: isArabic ? "إجمالي"  : "Total",     value: stats.total,     cls: "text-z-ink-900" },
          { key: "upcoming", label: isArabic ? "قادمة"   : "Upcoming",  value: stats.upcoming,  cls: "text-z-brand-700" },
          { key: "completed",label: isArabic ? "مكتمل"   : "Completed", value: stats.completed, cls: "text-z-positive-ink" },
          { key: "missed",   label: isArabic ? "ملغية"   : "Cancelled", value: stats.missed,    cls: "text-z-critical-ink" },
        ] as const).map((s) => {
          const active = statusFilter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(nextStatusFilter(statusFilter, s.key))}
              className="text-start"
            >
              <Panel className={cn("p-z4 transition-colors duration-zquick hover:bg-z-sunk", active && "ring-2 ring-z-brand-500")}>
                <div className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{s.label}</div>
                <div className={cn("z-num mt-z1 text-z-title rtl:text-z-title-ar font-semibold", s.cls)}>{s.value}</div>
              </Panel>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Panel className="flex items-end gap-z2 overflow-x-auto p-z3">
        <div className="me-z1 inline-flex shrink-0 items-center gap-z1 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
          <Filter className="size-3.5" aria-hidden="true" /> {isArabic ? "تصفية:" : "Filter:"}
        </div>
        <SelectField aria-label={isArabic ? "كل الأطباء" : "All doctors"} className="h-z9 w-auto min-w-[140px] shrink-0" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
          <option value="all">{isArabic ? "كل الأطباء" : "All doctors"}</option>
          {isDoctorUser && user?.id ? <option value={user.id}>{isArabic ? "جدولي" : "My schedule"}</option> : null}
          <option value="__none__">{isArabic ? "بدون طبيب" : "Unassigned"}</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>{doctorDisplayName(d, lang)}</option>)}
        </SelectField>
        <SelectField aria-label={isArabic ? "كل الغرف" : "All rooms"} className="h-z9 w-auto min-w-[120px] shrink-0" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
          <option value="all">{isArabic ? "كل الغرف" : "All rooms"}</option>
          <option value="__none__">{isArabic ? "بدون غرفة" : "No room"}</option>
          {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
        </SelectField>
        <SelectField aria-label={isArabic ? "كل الحالات" : "All statuses"} className="h-z9 w-auto min-w-[130px] shrink-0" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">{isArabic ? "كل الحالات" : "All statuses"}</option>
          {/* The cards filter by these group tokens; without an option here the
              trigger would render blank after a card click. */}
          <option value="upcoming">{isArabic ? "قادمة (مجدولة + مؤكدة)" : "Upcoming (scheduled + confirmed)"}</option>
          <option value="missed">{isArabic ? "ملغية (ملغاة + لم تحضر)" : "Cancelled (cancelled + no-show)"}</option>
          <option value="scheduled">{t("statusScheduled")}</option>
          <option value="confirmed">{t("statusConfirmed")}</option>
          <option value="in_progress">{t("statusInProgress")}</option>
          <option value="completed">{t("statusCompleted")}</option>
          <option value="cancelled">{t("statusCancelled")}</option>
          <option value="no_show">{t("statusNoShow")}</option>
          <option value="departed">{t("statusDeparted")}</option>
        </SelectField>
        {(doctorFilter !== "all" || roomFilter !== "all" || statusFilter !== "all") ? (
          <ActionButton tone="ghost" onClick={() => { setDoctorFilter("all"); setRoomFilter("all"); setStatusFilter("all"); }}>
            <X className="size-3" aria-hidden="true" />{isArabic ? "مسح" : "Clear"}
          </ActionButton>
        ) : null}
      </Panel>

      <div className="grid grid-cols-1 gap-z4">
        {view === "day" && roomBoard && roomBoardColumns.length ? (
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between gap-z3 border-b border-z-line-hairline p-z4">
              <div>
                <h2 className="text-z-small rtl:text-z-small-ar font-semibold text-z-ink-900">{isArabic ? "جدول الغرف اليومي" : "Daily room board"}</h2>
                <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{isArabic ? "كل عمود يمثل غرفة، والإلغاء يحرر السعة تلقائيًا." : "Each column is a room; cancelled appointments release capacity automatically."}</p>
              </div>
              <StatusChip tone="neutral">{roomBoardColumns.length} {isArabic ? "موارد" : "resources"}</StatusChip>
            </div>
            <TableShell className="rounded-none border-0">
              <div className="min-w-[760px]">
                <div className="grid border-b border-z-line-hairline bg-z-sunk" style={{ gridTemplateColumns: `76px repeat(${roomBoardColumns.length}, minmax(180px, 1fr))` }}>
                  <div className="border-e border-z-line-hairline p-z3 text-z-micro rtl:text-z-micro-ar font-semibold text-z-ink-500">{isArabic ? "الوقت" : "Time"}</div>
                  {roomBoardColumns.map((resource) => <div key={resource.id} className="border-e border-z-line-hairline p-z3 text-z-small rtl:text-z-small-ar font-semibold text-z-ink-900 last:border-e-0">{isArabic ? resource.name_ar : resource.name_en}<span className="ms-z2 text-z-micro rtl:text-z-micro-ar font-normal text-z-ink-500">{resource.capacity ? `${resource.capacity} ${isArabic ? "سعة" : "capacity"}` : ""}</span></div>)}
                </div>
                {hours.map((hour) => {
                  const hourStart = hour * 60;
                  const hourEnd = hourStart + 60;
                  return <div key={hour} className="grid min-h-[84px] border-b border-z-line-hairline last:border-b-0" style={{ gridTemplateColumns: `76px repeat(${roomBoardColumns.length}, minmax(180px, 1fr))` }}>
                    <div className="z-num border-e border-z-line-hairline p-z2 text-end text-z-micro rtl:text-z-micro-ar text-z-ink-500">{new Date(2000, 0, 1, hour).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</div>
                    {roomBoardColumns.map((resource) => {
                      const roomItems = (itemsByDay[date.toDateString()] ?? []).filter((item) => {
                        const start = new Date(item.scheduled_at);
                        const minute = start.getHours() * 60 + start.getMinutes();
                        const isRoom = resource.id === "__unassigned__" ? !resources.some((candidate) => roomBoardMatches(item, candidate)) : roomBoardMatches(item, resource);
                        return isRoom && minute >= hourStart && minute < hourEnd;
                      });
                      return <div key={resource.id} className="border-e border-z-line-hairline p-z2 last:border-e-0"><div className="space-y-z1">{roomItems.map((item) => <button key={item.id} type="button" onClick={() => openEdit(item)} className={cn("w-full rounded-z2 border p-z2 text-start text-z-micro rtl:text-z-micro-ar", statusBlock[item.status])}><div className="font-semibold">{timeStr(new Date(item.scheduled_at))} · {fullName(item.patients!)}</div><div className="mt-z1 truncate text-z-ink-500">{item.services?.[lang === "ar" ? "name_ar" : "name_en"] || item.procedure || (isArabic ? "موعد" : "Appointment")}</div></button>)}</div></div>;
                    })}
                  </div>;
                })}
              </div>
            </TableShell>
          </Panel>
        ) : null}
        {view === "month" ? (
          <Panel className="p-z3">
            <div className="mb-z2 grid grid-cols-7 gap-z1 text-center text-z-micro rtl:text-z-micro-ar text-z-ink-500">
              {(isArabic
                ? ["أحد","إثن","ثلا","أرب","خمي","جمع","سبت"]
                : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
              ).map((d) => <div key={d} className="font-medium">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-z1">
              {(() => {
                const first = startOfMonth(date);
                const leading = first.getDay();
                const daysIn = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                const cells: (Date | null)[] = [];
                for (let i = 0; i < leading; i++) cells.push(null);
                for (let d = 1; d <= daysIn; d++) cells.push(new Date(date.getFullYear(), date.getMonth(), d));
                while (cells.length % 7 !== 0) cells.push(null);
                return cells.map((d, i) => {
                  if (!d) return <div key={i} className="aspect-square sm:aspect-auto sm:min-h-[88px]" />;
                  const today = sameDay(d, new Date());
                  const dayItems = itemsByDay[d.toDateString()] ?? [];
                  return (
                    <button
                      key={i}
                      onClick={() => { setDate(d); setView("day"); }}
                      className={cn(
                        "flex min-h-[64px] flex-col gap-z1 rounded-z2 border border-z-line-edge p-z1 text-start transition-colors duration-zquick hover:bg-z-sunk sm:min-h-[88px] sm:p-z2",
                        today && "ring-1 ring-z-brand-500",
                      )}
                    >
                      <div className={cn("z-num text-z-micro rtl:text-z-micro-ar font-semibold", today ? "text-z-brand-700" : "text-z-ink-700")}>{d.getDate()}</div>
                      <div className="flex flex-1 flex-col gap-z1 overflow-hidden">
                        {dayItems.slice(0, isMobile ? 2 : 3).map((a) => (
                          <div key={a.id} className={cn("truncate rounded-z1 border px-z1 py-z1 text-z-micro rtl:text-z-micro-ar leading-tight", statusBlock[a.status])}>
                            <span className="z-num">{timeStr(new Date(a.scheduled_at))}</span> {fullName(a.patients!)}
                          </div>
                        ))}
                        {dayItems.length > (isMobile ? 2 : 3) ? (
                          <div className="z-num text-z-micro rtl:text-z-micro-ar text-z-ink-500">+{dayItems.length - (isMobile ? 2 : 3)}</div>
                        ) : null}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </Panel>
        ) : (
        /* Time grid */
        <Panel className="overflow-hidden">
          {view === "week" && (
            <div
              className="grid overflow-x-auto border-b border-z-line-hairline"
              style={{
                gridTemplateColumns: `56px repeat(7, minmax(${isMobile ? "72px" : "0"}, 1fr))`,
                minWidth: isMobile ? "640px" : undefined,
              }}
            >
              <div />
              {weekDays.map((d) => {
                const today = sameDay(d, new Date());
                return (
                  <button key={d.toISOString()} onClick={() => { setDate(d); setView("day"); }}
                    className={cn("p-z2 text-center transition-colors duration-zquick hover:bg-z-sunk", today && "bg-z-brand-050")}>
                    <div className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{weekHeader(d)}</div>
                    <div className={cn("z-num text-z-subtitle rtl:text-z-subtitle-ar font-semibold", today ? "text-z-brand-700" : "text-z-ink-700")}>{d.getDate()}</div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
            {workStartMin == null || workEndMin == null ? (
              <div className="p-z12 text-center">
                <Clock className="mx-auto mb-z3 size-10 text-z-ink-400" />
                <div className="text-z-body rtl:text-z-body-ar font-medium text-z-ink-900">
                  {isArabic ? "لا توجد ساعات عمل محددة لهذا الفرع" : "No working hours configured for this branch"}
                </div>
                <div className="mt-z1 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
                  {isArabic
                    ? "قم بتحديد ساعات عمل الفرع من الإعدادات لعرض التقويم هنا."
                    : "Set branch working hours in Settings to show the calendar here."}
                </div>
              </div>
            ) : (
            <div
              className="relative grid"
              style={{
                gridTemplateColumns: view === "week"
                  ? `56px repeat(7, minmax(${isMobile ? "72px" : "0"}, 1fr))`
                  : "56px 1fr",
                minWidth: view === "week" && isMobile ? "640px" : undefined,
              }}
            >
              {/* Hour labels column */}
              <div className="border-e border-z-line-hairline bg-z-sunk">
                {hours.map((h) => (
                  <div key={h} className="z-num pe-z2 pt-z1 text-end text-z-micro rtl:text-z-micro-ar text-z-ink-500" style={{ height: HOUR_HEIGHT }}>
                    {new Date(2000, 0, 1, h).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour: "numeric", hour12: true })}
                  </div>
                ))}
                {/* Closing-hour marker — sits flush with the bottom edge of
                    the last row so the branch's end time is visible. */}
                <div className="z-num -mt-z2 pe-z2 text-end text-z-micro rtl:text-z-micro-ar text-z-ink-500">
                  {new Date(2000, 0, 1, Math.min(23, endHourLabel), endHourLabel >= 24 ? 59 : 0)
                    .toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour: "numeric", hour12: true })}
                </div>
              </div>

              {/* Day columns */}
              {(view === "week" ? weekDays : [date]).map((d) => {
                const dayKey = d.toDateString();
                const dayItems = itemsByDay[dayKey] ?? [];
                const isToday = sameDay(d, new Date());
                const hasHours = workStartMin != null && workEndMin != null;
                const bandTop = hasHours ? ((workStartMin! - dayStartHour * 60) / 60) * HOUR_HEIGHT : 0;
                const bandHeight = hasHours ? ((workEndMin! - workStartMin!) / 60) * HOUR_HEIGHT : 0;
                const isClosed = !workingDays.includes(d.getDay());
                return (
                  <div key={dayKey} className="relative border-e border-z-line-hairline last:border-e-0">
                    {/* Working-hours highlight band (behind everything, non-interactive) */}
                    {hasHours && !isClosed && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bg-z-brand-050"
                        style={{ top: bandTop, height: bandHeight }}
                      />
                    )}
                    {/* Hour rows (clickable to create) */}
                    {hours.map((h) => (
                      <button
                        key={h}
                        onClick={() => {
                          const slot = new Date(d); slot.setHours(h, 0, 0, 0);
                          openNewAt(slot);
                        }}
                        className="block w-full border-b border-z-line-hairline transition-colors duration-zquick hover:bg-z-brand-050"
                        style={{ height: HOUR_HEIGHT }}
                        aria-label={`${t("createAt")} ${h}:00`}
                      />
                    ))}
                    {/* Now line */}
                    {isToday && showNowLine && (
                      <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowTop }}>
                        <div className="h-px bg-z-critical" />
                        <div className="ms-0 -mt-1 size-2 rounded-full bg-z-critical" />
                      </div>
                    )}
                    {/* Appointment blocks (side-by-side when overlapping) */}
                    {(() => {
                      const lanesMap = layoutDay(dayItems);
                      return dayItems.map((a) => {
                        const info = lanesMap.get(a.id) ?? { lane: 0, lanes: 1 };
                        return renderApptBlock(a, info.lane, info.lanes);
                      });
                    })()}
                    {/* Closed-day overlay — subtle muted tint + label; keeps the
                        time grid readable and does not block interaction. */}
                    {isClosed && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 flex items-start justify-center bg-z-sunk/40 pt-z3"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(135deg, hsl(var(--z-ink-500) / 0.06) 0 6px, transparent 6px 12px)",
                        }}
                      >
                        <span className="rounded-z1 border border-z-line-edge bg-z-raised/70 px-z2 py-z1 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
                          {isArabic ? "مغلق" : "Closed"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {filteredItems.length === 0 && (
            <div className="border-t border-z-line-hairline p-z6 text-center text-z-small rtl:text-z-small-ar text-z-ink-500">
              {t("noAppointments")} — {isArabic ? "اضغط على أي خانة لإنشاء موعد" : "click any slot to create one"}
            </div>
          )}
        </Panel>
        )}
      </div>

      <PlatformDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={isArabic ? "رفض طلب الحجز" : "Reject booking request"}
        icon={<X />}
        dir={isArabic ? "rtl" : "ltr"}
        busy={actionBusy}
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setRejectOpen(false)}>{t("cancel")}</ActionButton>
            <ActionButton tone="danger" disabled={actionBusy || !rejectReason.trim()} onClick={rejectBookingRequest}>{isArabic ? "تأكيد الرفض" : "Confirm rejection"}</ActionButton>
          </>
        }
      >
        <div className="space-y-z2">
          <FieldLabel htmlFor="booking-rejection-reason">{isArabic ? "سبب الرفض" : "Reason for rejection"}</FieldLabel>
          <PlatformTextarea id="booking-rejection-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} maxLength={1000} rows={5} placeholder={isArabic ? "اكتب سببًا واضحًا يمكن الرجوع إليه..." : "Write a clear reason for the record..."} />
          <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{isArabic ? "سيتم حفظ السبب في سجل الموعد، ولن يتم إرسال رسالة خارجية تلقائيًا." : "The reason is saved with the appointment; no external message is sent automatically."}</p>
        </div>
      </PlatformDialog>

      <PlatformDialog
        open={open}
        onOpenChange={(o) => { if (!savingRef.current) setOpen(o); }}
        title={editId ? t("edit") : t("newAppointment")}
        icon={<CalendarDays />}
        dir={isArabic ? "rtl" : "ltr"}
        busy={saving}
        wide
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setOpen(false)} disabled={saving}>{t("cancel")}</ActionButton>
            <ActionButton form="calendar-booking-form" type="submit" disabled={saving}>{t("save")}</ActionButton>
          </>
        }
      >
              <form id="calendar-booking-form" onSubmit={handleSave} className="space-y-z4">
                <div className="space-y-z2">
                  <FieldLabel>{t("patientName")}</FieldLabel>
                  <Combobox
                    options={patients.map((p) => ({
                      value: p.id,
                      label: p.label,
                      // Two patients can share a name; the number they were found by is
                      // the one piece of evidence that says which one this is.
                      detail: p.phone ?? undefined,
                    }))}
                    value={form.patient_id}
                    onChange={(next) => {
                      const picked = patients.find((p) => p.id === next);
                      setPatientEcho(picked ? { id: picked.id, label: picked.label } : null);
                      setForm((current) => ({ ...current, patient_id: next }));
                    }}
                    placeholder={isArabic ? "ابحث عن مريض..." : "Search patient..."}
                    searchPlaceholder={pickerCopy.searchPlaceholder}
                    emptyText={patientSearch.failed ? pickerCopy.failed : pickerCopy.empty}
                    searchingText={pickerCopy.searching}
                    hintText={patients.length >= PATIENT_PICKER_LIMIT ? pickerCopy.truncated : undefined}
                    selectedLabel={bookingPatientLabel(form.patient_id)}
                    searching={patientSearch.searching}
                    onSearch={loadPatientOptions}
                  />
                  {form.patient_id && (
                    <div className="flex flex-wrap items-center gap-x-z4 gap-y-z1 rounded-z2 border border-z-line-edge bg-z-sunk px-z3 py-z2 text-z-micro rtl:text-z-micro-ar">
                      {patientCtxLoading || !patientCtx ? (
                        <span className="text-z-ink-500">{isArabic ? "جارٍ تحميل بيانات المريض..." : "Loading patient context..."}</span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-z1">
                            <WalletIcon className="size-3.5 text-z-ink-500" aria-hidden="true" />
                            <span className="text-z-ink-500">{isArabic ? "المحفظة:" : "Wallet:"}</span>
                            <span className={cn("z-num font-medium", patientCtx.wallet > 0 && "text-z-positive-ink")}>{formatMoney(patientCtx.wallet, lang)}</span>
                          </span>
                          <span className="inline-flex items-center gap-z1">
                            <AlertCircle className={cn("size-3.5", patientCtx.outstanding > 0 ? "text-z-critical-ink" : "text-z-ink-500")} aria-hidden="true" />
                            <span className="text-z-ink-500">{isArabic ? "متبقي:" : "Outstanding:"}</span>
                            <span className={cn("z-num font-medium", patientCtx.outstanding > 0 && "text-z-critical-ink")}>{formatMoney(patientCtx.outstanding, lang)}</span>
                          </span>
                          <span className="inline-flex items-center gap-z1">
                            <History className="size-3.5 text-z-ink-500" aria-hidden="true" />
                            <span className="text-z-ink-500">{isArabic ? "آخر زيارة:" : "Last visit:"}</span>
                            <span className="z-num font-medium text-z-ink-900">{patientCtx.lastVisit ? formatDate(patientCtx.lastVisit, lang) : "—"}</span>
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-z2">
                  <FieldLabel>{isArabic ? "الطبيب" : "Doctor"}</FieldLabel>
                  <Combobox
                    value={form.doctor_id}
                    onChange={(v) => setForm({ ...form, doctor_id: v })}
                    options={bookingDoctors.map((d) => ({ value: d.id, label: doctorDisplayName(d, lang) }))}
                    placeholder={isArabic ? "— بدون —" : "— None —"}
                    searchPlaceholder={isArabic ? "ابحث عن طبيب..." : "Search doctor..."}
                    emptyText={form.service_id && serviceDoctors?.length === 0 ? (isArabic ? "لا يوجد طبيب مؤهل لهذه الخدمة" : "No doctor is assigned to this service") : (isArabic ? "لا يوجد أطباء" : "No doctors found")}
                    allowClear
                  />
                </div>
                <div className="grid grid-cols-2 gap-z3">
                  <div className="space-y-z2">
                    <FieldLabel htmlFor="calendar-scheduled-at">{t("scheduledAt")}</FieldLabel>
                    <PlatformInput id="calendar-scheduled-at" type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} required />
                  </div>
                  <div className="space-y-z2">
                    <FieldLabel htmlFor="calendar-duration">{t("durationMin")}</FieldLabel>
                    <PlatformInput
                      id="calendar-duration"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      className="z-num"
                      value={String(form.duration_minutes ?? "")}
                      onChange={(e) => {
                        // Accept Arabic-Indic & Persian digits
                        const ascii = e.target.value
                          .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
                          .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
                          .replace(/[^\d]/g, "");
                        setForm({ ...form, duration_minutes: ascii === "" ? 0 : Number(ascii) });
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-z3">
                  <div className="space-y-z2">
                    <FieldLabel htmlFor="calendar-service">{isArabic ? "الخدمة / نوع الزيارة" : "Service / appointment type"}</FieldLabel>
                    <SelectField
                      id="calendar-service"
                      value={form.service_id || "__none__"}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__none__") {
                          setForm({ ...form, service_id: "", procedure: "" });
                          return;
                        }
                        const selected = services.find((s) => s.id === v);
                        setForm({
                          ...form,
                          service_id: v,
                          // Keep a snapshot for legacy reports and old rows while
                          // service_id remains the canonical booking relationship.
                          procedure: selected?.name_en || selected?.name_ar || "",
                          duration_minutes: selected?.duration || form.duration_minutes,
                        });
                      }}
                    >
                      <option value="__none__">— {isArabic ? "بدون خدمة" : "No service"} —</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {isArabic ? service.name_ar : service.name_en} · {service.duration}m
                        </option>
                      ))}
                    </SelectField>
                    <p className="text-z-micro rtl:text-z-micro-ar leading-4 text-z-ink-500">
                      {isArabic ? "الإجراءات الطبية التي تم تنفيذها تُسجل داخل السجل الطبي بعد حضور المريض." : "Clinical procedures performed are documented in the medical record after the patient visit."}
                    </p>
                    {form.procedure && !form.service_id ? (
                      <p className="text-z-micro rtl:text-z-micro-ar leading-4 text-z-caution-ink">
                        {isArabic ? "هذا موعد قديم يحتوي على إجراء محفوظ؛ اختر خدمة جديدة لتحديثه." : "This legacy appointment has a saved procedure; choose a service to update it."}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-z2">
                    <FieldLabel htmlFor="calendar-room">{t("room")}</FieldLabel>
                    {resources.length ? (
                      <SelectField id="calendar-room" value={form.resource_id || "__none__"} onChange={(e) => {
                        const value = e.target.value;
                        const selected = resources.find((resource) => resource.id === value);
                        setForm({ ...form, resource_id: value === "__none__" ? "" : value, room: selected?.name_en || "" });
                      }}>
                        <option value="__none__">— {isArabic ? "بدون غرفة محددة" : "No specific room"} —</option>
                        {resources.map((resource) => <option key={resource.id} value={resource.id}>{isArabic ? resource.name_ar : resource.name_en} · {resource.capacity} {isArabic ? "سعة" : "capacity"}</option>)}
                      </SelectField>
                    ) : (
                      <>
                        <PlatformInput id="calendar-room" list="calendar-rooms-list" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value, resource_id: "" })} maxLength={40} placeholder={t("selectRoom")} />
                        <datalist id="calendar-rooms-list">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
                      </>
                    )}
                    <p className="text-z-micro rtl:text-z-micro-ar leading-4 text-z-ink-500">{resources.length ? (isArabic ? "اختيار الغرفة يثبت المورد الذي سيستهلكه الموعد." : "Selecting a room assigns the resource consumed by this appointment.") : (isArabic ? "أضف الغرف من إعدادات المواعيد لتفعيل حساب السعة." : "Add rooms in Appointment Settings to enable capacity-aware booking.")}</p>
                  </div>
                </div>
                <div className="space-y-z2">
                  <FieldLabel htmlFor="calendar-notes">{t("notes")}</FieldLabel>
                  <PlatformTextarea id="calendar-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
                </div>
                {editId ? (
                  <div className="space-y-z2">
                    <FieldLabel htmlFor="calendar-status">{t("status")}</FieldLabel>
                    <SelectField
                      id="calendar-status"
                      disabled={editingAppointment?.booking_request_status === "pending"}
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as Appt["status"] })}
                    >
                      <option value="scheduled">{t("statusScheduled")}</option>
                      <option value="confirmed">{t("statusConfirmed")}</option>
                      <option value="in_progress">{t("statusInProgress")}</option>
                      <option value="completed">{t("statusCompleted")}</option>
                      <option value="cancelled">{t("statusCancelled")}</option>
                      <option value="no_show">{t("statusNoShow")}</option>
                      <option value="departed">{t("statusDeparted")}</option>
                    </SelectField>
                    {editingAppointment?.booking_request_status === "pending" ? (
                      <p className="text-z-micro rtl:text-z-micro-ar text-z-caution-ink">
                        {isArabic ? "استخدم زر التأكيد أو الرفض لمعالجة طلب الحجز. لا يمكن تغيير الحالة يدويًا قبل المعالجة." : "Use Confirm or Reject to process this booking request. Manual status changes are disabled until it is processed."}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {editingAppointment?.booking_request_status === "pending" ? (
                  <div className="space-y-z3 rounded-z2 border border-s-2 border-z-caution-stroke bg-z-caution-fill p-z3">
                    <div>
                      <div className="text-z-small rtl:text-z-small-ar font-semibold text-z-caution-ink">{isArabic ? "طلب حجز في انتظار المراجعة" : "Booking request awaiting review"}</div>
                      {editingAppointment.booking_request_expires_at ? <div className="z-num mt-z1 text-z-micro rtl:text-z-micro-ar text-z-ink-500">{isArabic ? "تنتهي المهلة: " : "Hold expires: "}{new Date(editingAppointment.booking_request_expires_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-EG")}</div> : null}
                    </div>
                    <Can permission="appointments.edit">
                      <div className="flex flex-wrap gap-z2">
                        <ActionButton disabled={actionBusy} onClick={() => confirmBookingRequest(editingAppointment)}>
                          <Check className="size-4" aria-hidden="true" />{isArabic ? "تأكيد الحجز" : "Confirm booking"}
                        </ActionButton>
                        <ActionButton tone="danger" disabled={actionBusy} onClick={() => openRejectDialog(editingAppointment)}>
                          <X className="size-4" aria-hidden="true" />{isArabic ? "رفض الطلب" : "Reject request"}
                        </ActionButton>
                      </div>
                    </Can>
                  </div>
                ) : null}
              </form>
      </PlatformDialog>

      <Fab ariaLabel={t("newAppointment")} onClick={openNew}>
        <Plus className="size-6" />
      </Fab>
    </div>
  );
}
