import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useDataSync } from "@/lib/dataSync";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Plus, Send, CalendarDays, LayoutGrid, Clock, Filter, X, CalendarRange, Check, ChevronsUpDown, ArrowRight, Wallet as WalletIcon, AlertCircle, History } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Can } from "@/components/Can";
import { doctorDisplayName } from "@/lib/doctorName";
import { patientDisplayName } from "@/lib/patientName";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Combobox } from "@/components/ui/combobox";
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

const statusClass: Record<Appt["status"], string> = {
  scheduled: "status-progress",
  confirmed: "status-completed",
  in_progress: "status-progress",
  completed: "status-completed",
  cancelled: "status-cancelled",
  no_show: "status-cancelled",
  departed: "status-departed",
};

// HSL tokens for time-grid blocks (uses semantic tokens)
const statusBlock: Record<Appt["status"], string> = {
  scheduled:   "bg-primary/15 border-primary/40 text-foreground",
  confirmed:   "bg-emerald-500/15 border-emerald-500/40 text-foreground",
  in_progress: "bg-amber-500/15 border-amber-500/40 text-foreground",
  completed:   "bg-emerald-500/20 border-emerald-500/50 text-foreground",
  cancelled:   "bg-destructive/15 border-destructive/40 text-foreground line-through opacity-70",
  no_show:     "bg-destructive/10 border-destructive/30 text-foreground opacity-70",
  departed:    "bg-muted border-border text-muted-foreground",
};

// Left-accent border color per status — used to make blocks pop on the grid.
const statusAccent: Record<Appt["status"], string> = {
  scheduled:   "border-l-primary",
  confirmed:   "border-l-emerald-500",
  in_progress: "border-l-amber-500",
  completed:   "border-l-emerald-600",
  cancelled:   "border-l-destructive",
  no_show:     "border-l-destructive",
  departed:    "border-l-muted-foreground",
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
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [miniOpen, setMiniOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(new Date()));
  const [items, setItems] = useState<Appt[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<{ id: string; full_name: string | null; full_name_en?: string | null; full_name_ar?: string | null }[]>([]);
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
  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [services, setServices] = useState<{ id: string; name_en: string; name_ar: string; duration: number }[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);
  const [resources, setResources] = useState<{ id: string; name_en: string; name_ar: string; capacity: number; is_active: boolean }[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    patient_id: "", doctor_id: "", scheduled_at: "", duration_minutes: 30, service_id: "", procedure: "", room: "", resource_id: "", notes: "",
    status: "scheduled" as Appt["status"],
  });
  const [patientCtx, setPatientCtx] = useState<{ wallet: number; outstanding: number; lastVisit: string | null } | null>(null);
  const [patientCtxLoading, setPatientCtxLoading] = useState(false);

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
    if (!open || !form.patient_id) { setPatientCtx(null); return; }
    let cancelled = false;
    setPatientCtxLoading(true);
    (async () => {
      const [walletRes, invRes, lastApptRes] = await Promise.all([
        (supabase as any).from("patient_wallets").select("balance").eq("patient_id", form.patient_id).maybeSingle(),
        supabase.from("invoices").select("total,paid_amount").eq("patient_id", form.patient_id).is("deleted_at", null).in("status", ["pending", "partial"]),
        supabase.from("appointments").select("scheduled_at").eq("patient_id", form.patient_id).is("deleted_at", null).in("status", ["completed", "departed"]).order("scheduled_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      const wallet = Number(walletRes?.data?.balance ?? 0);
      const outstanding = ((invRes.data ?? []) as any[]).reduce((s, r) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)), 0);
      const lastVisit = (lastApptRes.data as any)?.scheduled_at ?? null;
      setPatientCtx({ wallet, outstanding, lastVisit });
      setPatientCtxLoading(false);
    })();
    return () => { cancelled = true; };
  }, [form.patient_id, open]);

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
    const start = rangeStart.toISOString();
    const end = rangeEnd.toISOString();
    let q = supabase.from("appointments")
      .select("*, patients!inner(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code,deleted_at), services(name_en,name_ar)")
      .gte("scheduled_at", start).lt("scheduled_at", end)
      .is("deleted_at", null)
      .is("patients.deleted_at", null)
      .order("scheduled_at", { ascending: true });
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as any);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [rangeStart.getTime(), rangeEnd.getTime(), currentBranchId]);
  useDataSync(["appointments", "calendar"], () => { load(); });

  // Load doctor options for filter
  useEffect(() => {
    (async () => {
      // Use SECURITY DEFINER RPC so non-admin roles can populate the doctor filter
      // without direct SELECT on user_roles (which restricts to own row).
      const { data } = await supabase.rpc("list_doctors");
      const list = ((data ?? []) as any[]).map((p: any) => ({
        id: p.id,
        full_name: p.full_name ?? p.id.slice(0, 8),
        full_name_en: p.full_name_en ?? null,
        full_name_ar: p.full_name_ar ?? null,
      }));
      list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
      setDoctors(list);
    })();
  }, []);

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

  // Month dots
  const loadMonthDots = async () => {
    const start = startOfMonth(monthCursor).toISOString();
    const endDate = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    const end = endDate.toISOString();
    let q = supabase.from("appointments")
      .select("scheduled_at")
      .gte("scheduled_at", start).lt("scheduled_at", end)
      .is("deleted_at", null);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data } = await q;
    const dots: Record<string, number> = {};
    for (const r of (data ?? []) as { scheduled_at: string }[]) {
      const k = new Date(r.scheduled_at).toDateString();
      dots[k] = (dots[k] ?? 0) + 1;
    }
    setMonthDots(dots);
  };
  useEffect(() => { loadMonthDots(); /* eslint-disable-next-line */ }, [monthCursor.getTime(), currentBranchId]);
  useDataSync(["appointments"], () => loadMonthDots());

  const loadPatientOptions = () => {
    supabase.from("patients").select("id,first_name_en,last_name_en,first_name_ar,last_name_ar,name_language").is("deleted_at", null).order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setPatients((data ?? []).map((p: any) => ({ id: p.id, label: patientDisplayName(p, lang) }))));
  };
  useEffect(() => { loadPatientOptions(); }, [lang]);
  useDataSync(["patients"], () => loadPatientOptions());

  // Booking uses tenant-scoped services/visit types. Clinical procedures remain
  // part of the medical record rather than the receptionist-facing booking list.
  const loadServices = () => {
    supabase.from("services")
      .select("id,name_en,name_ar,default_duration_minutes")
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
    const resourceQuery = (supabase as any).from("booking_resources")
      .select("id,name_en,name_ar,capacity,is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    const appointmentQuery = supabase.from("appointments").select("room").not("room", "is", null).is("deleted_at", null).limit(1000);
    if (currentBranchId) {
      resourceQuery.eq("branch_id", currentBranchId);
      appointmentQuery.eq("branch_id", currentBranchId);
    }
    const [{ data: resourceData }, { data: appointmentData }] = await Promise.all([resourceQuery, appointmentQuery]);
    const nextResources = (resourceData ?? []) as { id: string; name_en: string; name_ar: string; capacity: number; is_active: boolean }[];
    setResources(nextResources);
    const set = new Set<string>(nextResources.map((r) => r.name_en).filter(Boolean));
    (appointmentData ?? []).forEach((r: any) => { if (r.room) set.add(String(r.room).trim()); });
    setRooms(Array.from(set).sort());
  };
  useEffect(() => { loadServices(); }, [lang, currentBranchId]);
  useEffect(() => { loadRooms(); }, [currentBranchId]);
  useDataSync(["appointments"], () => loadRooms());

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
    const tz = base.getTimezoneOffset();
    const local = new Date(base.getTime() - tz * 60000).toISOString().slice(0, 16);
    setForm({ patient_id: "", doctor_id: "", scheduled_at: local, duration_minutes: 30, service_id: "", procedure: "", room: "", resource_id: "", notes: "", status: "scheduled" });
    setOpen(true);
  };
  const openNewAt = (slot: Date) => {
    setEditId(null);
    const tz = slot.getTimezoneOffset();
    const local = new Date(slot.getTime() - tz * 60000).toISOString().slice(0, 16);
    setForm({ patient_id: "", doctor_id: "", scheduled_at: local, duration_minutes: 30, service_id: "", procedure: "", room: "", resource_id: "", notes: "", status: "scheduled" });
    setOpen(true);
  };
  const openEdit = (a: Appt) => {
    setEditId(a.id);
    const dt = new Date(a.scheduled_at);
    const tz = dt.getTimezoneOffset();
    const local = new Date(dt.getTime() - tz * 60000).toISOString().slice(0,16);
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
    if (a.status === "cancelled") { toast.message(lang === "ar" ? "الموعد ملغي بالفعل" : "Appointment already cancelled"); return; }
    const patch = buildStatusPatch("cancelled", {
      checked_in_at: (a as any).checked_in_at ?? null,
      started_at: (a as any).started_at ?? null,
    });
    const { error } = await supabase.from("appointments").update(patch as any).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم إلغاء الموعد" : "Appointment cancelled");
    load();
  };

  const changeStatus = async (a: Appt, status: Appt["status"]): Promise<void> => {
    // Use shared helper so checked_in_at / started_at stay consistent with Queue.
    const patch = buildStatusPatch(status, {
      checked_in_at: (a as any).checked_in_at ?? null,
      started_at: (a as any).started_at ?? null,
    });
    const { error } = await supabase.from("appointments").update(patch as any).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    load();
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
    if (lang === "ar") {
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
      if (insErr) { toast.error(insErr.message); return; }
      reminderId = ins!.id as string;
    }
    const { data, error } = await supabase.functions.invoke("send-reminder", { body: { reminder_id: reminderId } });
    if (error) { toast.error(error.message); return; }
    if (data?.sent > 0) toast.success(lang === "ar" ? "تم إرسال التذكير" : "Reminder sent");
    else toast.error(data?.results?.[0]?.error ?? (lang === "ar" ? "فشل الإرسال" : "Send failed"));
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
        ? (lang === "ar" ? "المريض والتاريخ/الوقت" : "a patient and a date/time")
        : !form.patient_id
          ? (lang === "ar" ? "المريض" : "a patient")
          : (lang === "ar" ? "التاريخ والوقت" : "a date/time");
      toast.error(lang === "ar" ? `من فضلك اختر ${missing}` : `Please select ${missing}`);
      return;
    }
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
    if (editId) payload.status = form.status;
    const { error } = editId
      ? await supabase.from("appointments").update(payload).eq("id", editId)
      : await supabase.from("appointments").insert({ ...payload, branch_id: currentBranchId, status: "scheduled" });
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حفظ الموعد" : "Appointment saved");
    setOpen(false); setEditId(null);
    setForm({ patient_id: "", doctor_id: "", scheduled_at: "", duration_minutes: 30, service_id: "", procedure: "", room: "", notes: "", status: "scheduled" });
    load();
  };

  // Group items by day for week view
  const itemsByDay = useMemo(() => {
    const filtered = items.filter((a) => {
      if (doctorFilter !== "all" && (a.doctor_id ?? "__none__") !== doctorFilter) return false;
      if (roomFilter !== "all" && (a.room ?? "__none__") !== roomFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      return true;
    });
    const map: Record<string, Appt[]> = {};
    for (const a of filtered) {
      const k = new Date(a.scheduled_at).toDateString();
      (map[k] ??= []).push(a);
    }
    return map;
  }, [items, doctorFilter, roomFilter, statusFilter]);

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
    const s = { total: filteredItems.length, scheduled: 0, completed: 0, cancelled: 0 };
    for (const a of filteredItems) {
      if (a.status === "scheduled" || a.status === "confirmed") s.scheduled++;
      else if (a.status === "completed") s.completed++;
      else if (a.status === "cancelled" || a.status === "no_show") s.cancelled++;
    }
    return s;
  }, [filteredItems]);

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
        "absolute rounded-md border border-l-4 text-start px-2 py-1 overflow-hidden shadow-sm",
        "hover:shadow-md hover:z-20 hover:scale-[1.01] transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        statusBlock[a.status],
        statusAccent[a.status],
        highlightId === a.id && "ring-2 ring-primary shadow-lg z-20",
        lanes > 1 && "ring-1 ring-background/60",
        // Pinned to the top/bottom edge of the visible grid because its real
        // time falls outside the branch's configured working hours -- the
        // dashed ring calls that out so the pinned position isn't mistaken
        // for the actual appointment time (shown correctly below regardless).
        isOutOfHours && "ring-2 ring-dashed ring-muted-foreground/50",
      )}
      style={style}
      title={`${fullName(a.patients!)} · ${timeStr(new Date(a.scheduled_at))}${isOutOfHours ? ` (${lang === "ar" ? "خارج ساعات العمل" : "outside working hours"})` : ""}`}
    >
      <div className="text-xs font-bold leading-tight truncate">
        {fullName(a.patients!)}
      </div>
      <div className="text-[11px] leading-tight truncate text-muted-foreground">
        {timeStr(new Date(a.scheduled_at))}
        {isOutOfHours && <span className="ms-1" aria-hidden>⚠</span>}
      </div>
      {(appointmentServiceLabel(a) || a.room) && (
        <div className="text-[10px] leading-tight truncate text-muted-foreground/90">
          {appointmentServiceLabel(a) || "—"}{a.room ? ` · ${a.room}` : ""}
        </div>
      )}
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
    <div className="space-y-4">
      <Card className={`p-4 shadow-card ${workStartMin == null || workEndMin == null ? "border-dashed bg-muted/40" : ""}`}>
        {(workStartMin == null || workEndMin == null) && (
          <div className="mb-3 text-[11px] text-muted-foreground text-center leading-snug">
            {lang === "ar" ? "لا توجد ساعات عمل محددة لهذا الفرع" : "No working hours for this branch"}
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
            className="size-7 inline-flex items-center justify-center rounded hover:bg-muted">
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </button>
          <div className="text-sm font-semibold">
            {monthCursor.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { month: "long", year: "numeric" })}
          </div>
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
            className="size-7 inline-flex items-center justify-center rounded hover:bg-muted">
            <ChevronRight className="size-4 rtl:rotate-180" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
          {(lang === "ar"
            ? ["أحد","اثن","ثلا","أرب","خمي","جمع","سبت"]
            : ["S","M","T","W","T","F","S"]
          ).map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {monthGrid.map((d, i) => {
            if (!d) return <div key={i} />;
            const active = sameDay(d, date);
            const today = sameDay(d, new Date());
            const count = monthDots[d.toDateString()] ?? 0;
            return (
              <button key={i} onClick={() => { setDate(d); setMiniOpen(false); }}
                className={`aspect-square rounded-lg relative flex flex-col items-center justify-center
                  ${active ? "gradient-primary text-primary-foreground" : today ? "ring-1 ring-primary text-primary" : "hover:bg-muted"}`}>
                <span className="font-medium">{d.getDate()}</span>
                {count > 0 && (
                  <span className={`absolute bottom-1 size-1 rounded-full ${active ? "bg-primary-foreground" : "bg-primary"}`} />
                )}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("calendar")}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{dayLabel}</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView("day")}
              className={`px-3 h-9 text-sm inline-flex items-center gap-1 ${view === "day" ? "bg-muted" : "hover:bg-muted/50"}`}
            >
              <CalendarDays className="size-4" /> {lang === "ar" ? "يوم" : "Day"}
            </button>
            {!isMobile && (
              <button
                onClick={() => setView("week")}
                className={`px-3 h-9 text-sm inline-flex items-center gap-1 border-s border-border ${view === "week" ? "bg-muted" : "hover:bg-muted/50"}`}
              >
                <LayoutGrid className="size-4" /> {lang === "ar" ? "أسبوع" : "Week"}
              </button>
            )}
            <button
              onClick={() => setView("month")}
              className={`px-3 h-9 text-sm inline-flex items-center gap-1 border-s border-border ${view === "month" ? "bg-muted" : "hover:bg-muted/50"}`}
            >
              <CalendarRange className="size-4" /> {lang === "ar" ? "شهر" : "Month"}
            </button>
          </div>
          {view === "day" && resources.length ? (
            <Button variant={roomBoard ? "default" : "outline"} size="sm" onClick={() => setRoomBoard((value) => !value)} className="gap-1">
              <LayoutGrid className="size-4" />{lang === "ar" ? "جدول الغرف" : "Room board"}
            </Button>
          ) : null}
          <Button variant="outline" size="icon" onClick={() => {
            if (view === "month") setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1));
            else setDate(addDays(date, view === "week" ? -7 : -1));
          }}><ChevronLeft className="size-4 rtl:rotate-180" /></Button>
          <Button variant="outline" size="sm" onClick={() => setDate(startOfDay(new Date()))}>{t("today")}</Button>
          <Button variant="outline" size="icon" onClick={() => {
            if (view === "month") setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1));
            else setDate(addDays(date, view === "week" ? 7 : 1));
          }}><ChevronRight className="size-4 rtl:rotate-180" /></Button>
          <Popover open={miniOpen} onOpenChange={setMiniOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" aria-label={lang === "ar" ? "التقويم" : "Calendar"}>
                <CalendarDays className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] p-0">
              {sidebarContent}
            </PopoverContent>
          </Popover>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground hidden md:inline-flex" onClick={openNew}><Plus className="me-2 size-4" />{t("newAppointment")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg w-[calc(100vw-2rem)] sm:w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editId ? t("edit") : t("newAppointment")}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("patientName")}</Label>
                  <Popover open={patientPickerOpen} onOpenChange={setPatientPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={patientPickerOpen}
                        className="w-full justify-between font-normal"
                      >
                        <span className={cn("truncate", !form.patient_id && "text-muted-foreground")}>
                          {form.patient_id
                            ? (patients.find((p) => p.id === form.patient_id)?.label ?? "—")
                            : (lang === "ar" ? "ابحث عن مريض..." : "Search patient...")}
                        </span>
                        <ChevronsUpDown className="ms-2 size-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-0 w-[--radix-popover-trigger-width] max-w-[calc(100vw-2rem)]"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder={lang === "ar" ? "ابحث بالاسم..." : "Search by name..."} />
                        <CommandList className="max-h-[260px]">
                          <CommandEmpty>{lang === "ar" ? "لا يوجد مرضى" : "No patients found"}</CommandEmpty>
                          <CommandGroup>
                            {patients.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.label} ${p.id}`}
                                onSelect={() => {
                                  setForm({ ...form, patient_id: p.id });
                                  setPatientPickerOpen(false);
                                }}
                              >
                                <Check className={cn("me-2 size-4", form.patient_id === p.id ? "opacity-100" : "opacity-0")} />
                                {p.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {form.patient_id && (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
                      {patientCtxLoading || !patientCtx ? (
                        <span className="text-muted-foreground">{lang === "ar" ? "جارٍ تحميل بيانات المريض..." : "Loading patient context..."}</span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <WalletIcon className="size-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">{lang === "ar" ? "المحفظة:" : "Wallet:"}</span>
                            <span className={`font-medium tabular-nums ${patientCtx.wallet > 0 ? "text-emerald-600" : ""}`}>{formatMoney(patientCtx.wallet, lang)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <AlertCircle className={`size-3.5 ${patientCtx.outstanding > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                            <span className="text-muted-foreground">{lang === "ar" ? "متبقي:" : "Outstanding:"}</span>
                            <span className={`font-medium tabular-nums ${patientCtx.outstanding > 0 ? "text-destructive" : ""}`}>{formatMoney(patientCtx.outstanding, lang)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <History className="size-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">{lang === "ar" ? "آخر زيارة:" : "Last visit:"}</span>
                            <span className="font-medium">{patientCtx.lastVisit ? formatDate(patientCtx.lastVisit, lang) : (lang === "ar" ? "—" : "—")}</span>
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "الطبيب" : "Doctor"}</Label>
                  <Combobox
                    value={form.doctor_id}
                    onChange={(v) => setForm({ ...form, doctor_id: v })}
                    options={doctors.map((d) => ({ value: d.id, label: doctorDisplayName(d, lang) }))}
                    placeholder={lang === "ar" ? "— بدون —" : "— None —"}
                    searchPlaceholder={lang === "ar" ? "ابحث عن طبيب..." : "Search doctor..."}
                    emptyText={lang === "ar" ? "لا يوجد أطباء" : "No doctors found"}
                    allowClear
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("scheduledAt")}</Label>
                    <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("durationMin")}</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{lang === "ar" ? "الخدمة / نوع الزيارة" : "Service / appointment type"}</Label>
                    <Select
                      value={form.service_id || "__none__"}
                      onValueChange={(v) => {
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
                      <SelectTrigger><SelectValue placeholder={lang === "ar" ? "اختر الخدمة" : "Choose service"} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— {lang === "ar" ? "بدون خدمة" : "No service"} —</SelectItem>
                        {services.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {lang === "ar" ? service.name_ar : service.name_en} · {service.duration}m
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      {lang === "ar" ? "الإجراءات الطبية التي تم تنفيذها تُسجل داخل السجل الطبي بعد حضور المريض." : "Clinical procedures performed are documented in the medical record after the patient visit."}
                    </p>
                    {form.procedure && !form.service_id ? (
                      <p className="text-[11px] leading-4 text-amber-600">
                        {lang === "ar" ? "هذا موعد قديم يحتوي على إجراء محفوظ؛ اختر خدمة جديدة لتحديثه." : "This legacy appointment has a saved procedure; choose a service to update it."}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>{t("room")}</Label>
                    {resources.length ? (
                      <Select value={form.resource_id || "__none__"} onValueChange={(value) => {
                        const selected = resources.find((resource) => resource.id === value);
                        setForm({ ...form, resource_id: value === "__none__" ? "" : value, room: selected?.name_en || "" });
                      }}>
                        <SelectTrigger><SelectValue placeholder={lang === "ar" ? "اختر الغرفة" : "Choose room"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— {lang === "ar" ? "بدون غرفة محددة" : "No specific room"} —</SelectItem>
                          {resources.map((resource) => <SelectItem key={resource.id} value={resource.id}>{lang === "ar" ? resource.name_ar : resource.name_en} · {resource.capacity} {lang === "ar" ? "سعة" : "capacity"}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <>
                        <Input list="calendar-rooms-list" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value, resource_id: "" })} maxLength={40} placeholder={t("selectRoom")} />
                        <datalist id="calendar-rooms-list">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
                      </>
                    )}
                    <p className="text-[11px] leading-4 text-muted-foreground">{resources.length ? (lang === "ar" ? "اختيار الغرفة يثبت المورد الذي سيستهلكه الموعد." : "Selecting a room assigns the resource consumed by this appointment.") : (lang === "ar" ? "أضف الغرف من إعدادات المواعيد لتفعيل حساب السعة." : "Add rooms in Appointment Settings to enable capacity-aware booking.")}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("notes")}</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
                </div>
                {editId && (
                  <div className="space-y-2">
                    <Label>{t("status")}</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Appt["status"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">{t("statusScheduled")}</SelectItem>
                        <SelectItem value="confirmed">{t("statusConfirmed")}</SelectItem>
                        <SelectItem value="in_progress">{t("statusInProgress")}</SelectItem>
                        <SelectItem value="completed">{t("statusCompleted")}</SelectItem>
                        <SelectItem value="cancelled">{t("statusCancelled")}</SelectItem>
                        <SelectItem value="no_show">{t("statusNoShow")}</SelectItem>
                        <SelectItem value="departed">{t("statusDeparted")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                  <Button type="submit" className="gradient-primary text-primary-foreground">{t("save")}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { key: "all",      label: lang === "ar" ? "إجمالي"  : "Total",     value: stats.total,     cls: "text-foreground" },
          { key: "scheduled",label: lang === "ar" ? "قادمة"   : "Upcoming",  value: stats.scheduled, cls: "text-primary" },
          { key: "completed",label: lang === "ar" ? "مكتمل"   : "Completed", value: stats.completed, cls: "text-emerald-500" },
          { key: "cancelled",label: lang === "ar" ? "ملغية"   : "Cancelled", value: stats.cancelled, cls: "text-destructive" },
        ] as const).map((s) => {
          const active = (s.key === "all" && statusFilter === "all")
            || (s.key === "scheduled" && (statusFilter === "scheduled" || statusFilter === "confirmed"))
            || (s.key === "completed" && statusFilter === "completed")
            || (s.key === "cancelled" && (statusFilter === "cancelled" || statusFilter === "no_show"));
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatusFilter(s.key === "all" ? "all" : s.key === "scheduled" ? "scheduled" : s.key)}
              className="text-start"
            >
              <Card className={`p-4 shadow-card transition-all hover:shadow-elegant ${active ? "ring-2 ring-primary" : ""}`}>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className={`text-2xl font-bold mt-1 ${s.cls}`}>{s.value}</div>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="p-3 shadow-card flex md:flex-wrap items-stretch md:items-center gap-2 overflow-x-auto md:overflow-visible">
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground me-1 shrink-0">
          <Filter className="size-3.5" /> {lang === "ar" ? "تصفية:" : "Filter:"}
        </div>
        <Select value={doctorFilter} onValueChange={setDoctorFilter}>
          <SelectTrigger className="h-10 md:h-9 w-auto min-w-[140px] text-sm md:text-xs shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الأطباء" : "All doctors"}</SelectItem>
            {isDoctorUser && user?.id && (
              <SelectItem value={user.id}>{lang === "ar" ? "جدولي" : "My schedule"}</SelectItem>
            )}
            <SelectItem value="__none__">{lang === "ar" ? "بدون طبيب" : "Unassigned"}</SelectItem>
            {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{doctorDisplayName(d, lang)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roomFilter} onValueChange={setRoomFilter}>
          <SelectTrigger className="h-10 md:h-9 w-auto min-w-[120px] text-sm md:text-xs shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الغرف" : "All rooms"}</SelectItem>
            <SelectItem value="__none__">{lang === "ar" ? "بدون غرفة" : "No room"}</SelectItem>
            {rooms.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 md:h-9 w-auto min-w-[130px] text-sm md:text-xs shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الحالات" : "All statuses"}</SelectItem>
            <SelectItem value="scheduled">{t("statusScheduled")}</SelectItem>
            <SelectItem value="confirmed">{t("statusConfirmed")}</SelectItem>
            <SelectItem value="in_progress">{t("statusInProgress")}</SelectItem>
            <SelectItem value="completed">{t("statusCompleted")}</SelectItem>
            <SelectItem value="cancelled">{t("statusCancelled")}</SelectItem>
            <SelectItem value="no_show">{t("statusNoShow")}</SelectItem>
            <SelectItem value="departed">{t("statusDeparted")}</SelectItem>
          </SelectContent>
        </Select>
        {(doctorFilter !== "all" || roomFilter !== "all" || statusFilter !== "all") && (
          <Button size="sm" variant="ghost" className="h-8 text-xs"
            onClick={() => { setDoctorFilter("all"); setRoomFilter("all"); setStatusFilter("all"); }}>
            <X className="size-3 me-1" />{lang === "ar" ? "مسح" : "Clear"}
          </Button>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {view === "day" && roomBoard && roomBoardColumns.length ? (
          <Card className="shadow-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div><h2 className="font-bold">{lang === "ar" ? "جدول الغرف اليومي" : "Daily room board"}</h2><p className="text-xs text-muted-foreground">{lang === "ar" ? "كل عمود يمثل غرفة، والإلغاء يحرر السعة تلقائيًا." : "Each column is a room; cancelled appointments release capacity automatically."}</p></div>
              <Badge variant="outline">{roomBoardColumns.length} {lang === "ar" ? "موارد" : "resources"}</Badge>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: `76px repeat(${roomBoardColumns.length}, minmax(180px, 1fr))` }}>
                  <div className="border-e p-3 text-xs font-semibold text-muted-foreground">{lang === "ar" ? "الوقت" : "Time"}</div>
                  {roomBoardColumns.map((resource) => <div key={resource.id} className="border-e p-3 text-sm font-semibold last:border-e-0">{lang === "ar" ? resource.name_ar : resource.name_en}<span className="ms-2 text-xs font-normal text-muted-foreground">{resource.capacity ? `${resource.capacity} ${lang === "ar" ? "سعة" : "capacity"}` : ""}</span></div>)}
                </div>
                {hours.map((hour) => {
                  const hourStart = hour * 60;
                  const hourEnd = hourStart + 60;
                  return <div key={hour} className="grid min-h-[84px] border-b last:border-b-0" style={{ gridTemplateColumns: `76px repeat(${roomBoardColumns.length}, minmax(180px, 1fr))` }}>
                    <div className="border-e p-2 text-end text-xs text-muted-foreground">{new Date(2000, 0, 1, hour).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</div>
                    {roomBoardColumns.map((resource) => {
                      const roomItems = (itemsByDay[date.toDateString()] ?? []).filter((item) => {
                        const start = new Date(item.scheduled_at);
                        const minute = start.getHours() * 60 + start.getMinutes();
                        const isRoom = resource.id === "__unassigned__" ? !resources.some((candidate) => roomBoardMatches(item, candidate)) : roomBoardMatches(item, resource);
                        return isRoom && minute >= hourStart && minute < hourEnd;
                      });
                      return <div key={resource.id} className="border-e p-2 last:border-e-0"><div className="space-y-1">{roomItems.map((item) => <button key={item.id} type="button" onClick={() => openEdit(item)} className={cn("w-full rounded-md border p-2 text-start text-xs", statusBlock[item.status])}><div className="font-semibold">{timeStr(new Date(item.scheduled_at))} · {fullName(item.patients!)}</div><div className="mt-1 truncate text-muted-foreground">{item.services?.[lang === "ar" ? "name_ar" : "name_en"] || item.procedure || (lang === "ar" ? "موعد" : "Appointment")}</div></button>)}</div></div>;
                    })}
                  </div>;
                })}
              </div>
            </div>
          </Card>
        ) : null}
        {view === "month" ? (
          <Card className="shadow-card p-3">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground mb-2">
              {(lang === "ar"
                ? ["أحد","إثن","ثلا","أرب","خمي","جمع","سبت"]
                : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
              ).map((d) => <div key={d} className="font-medium">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
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
                      className={`text-start rounded-lg border border-border p-1.5 sm:p-2 hover:bg-muted/40 transition-colors min-h-[64px] sm:min-h-[88px] flex flex-col gap-1 ${today ? "ring-1 ring-primary" : ""}`}
                    >
                      <div className={`text-xs font-semibold ${today ? "text-primary" : ""}`}>{d.getDate()}</div>
                      <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                        {dayItems.slice(0, isMobile ? 2 : 3).map((a) => (
                          <div key={a.id} className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 border ${statusBlock[a.status]}`}>
                            {timeStr(new Date(a.scheduled_at))} {fullName(a.patients!)}
                          </div>
                        ))}
                        {dayItems.length > (isMobile ? 2 : 3) && (
                          <div className="text-[10px] text-muted-foreground">+{dayItems.length - (isMobile ? 2 : 3)}</div>
                        )}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </Card>
        ) : (
        /* Time grid */
        <Card className="shadow-card overflow-hidden">
          {view === "week" && (
            <div
              className="grid border-b border-border overflow-x-auto"
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
                    className={`p-2 text-center hover:bg-muted/40 transition-colors ${today ? "bg-primary/5" : ""}`}>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{weekHeader(d)}</div>
                    <div className={`text-lg font-semibold ${today ? "text-primary" : ""}`}>{d.getDate()}</div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
            {workStartMin == null || workEndMin == null ? (
              <div className="p-12 text-center">
                <Clock className="size-10 mx-auto text-muted-foreground mb-3" />
                <div className="text-base font-medium">
                  {lang === "ar" ? "لا توجد ساعات عمل محددة لهذا الفرع" : "No working hours configured for this branch"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {lang === "ar"
                    ? "قم بتحديد ساعات عمل الفرع من الإعدادات لعرض التقويم هنا."
                    : "Set branch working hours in Settings to show the calendar here."}
                </div>
              </div>
            ) : (
            <div
              className="grid relative"
              style={{
                gridTemplateColumns: view === "week"
                  ? `56px repeat(7, minmax(${isMobile ? "72px" : "0"}, 1fr))`
                  : "56px 1fr",
                minWidth: view === "week" && isMobile ? "640px" : undefined,
              }}
            >
              {/* Hour labels column */}
              <div className="border-e border-border bg-muted/20">
                {hours.map((h) => (
                  <div key={h} className="text-[10px] text-muted-foreground text-end pe-2 pt-1" style={{ height: HOUR_HEIGHT }}>
                    {new Date(2000, 0, 1, h).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour: "numeric", hour12: true })}
                  </div>
                ))}
                {/* Closing-hour marker — sits flush with the bottom edge of
                    the last row so the branch's end time is visible. */}
                <div className="text-[10px] text-muted-foreground text-end pe-2 -mt-2">
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
                  <div key={dayKey} className="relative border-e border-border last:border-e-0">
                    {/* Working-hours highlight band (behind everything, non-interactive) */}
                    {hasHours && !isClosed && (
                      <div
                        aria-hidden
                        className="absolute inset-x-0 bg-primary/5 pointer-events-none"
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
                        className="block w-full border-b border-border/60 hover:bg-primary/5 transition-colors"
                        style={{ height: HOUR_HEIGHT }}
                        aria-label={`${t("createAt")} ${h}:00`}
                      />
                    ))}
                    {/* Now line */}
                    {isToday && showNowLine && (
                      <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: nowTop }}>
                        <div className="h-px bg-destructive" />
                        <div className="size-2 -mt-1 ms-0 rounded-full bg-destructive" />
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
                        className="absolute inset-0 pointer-events-none bg-muted/40 backdrop-blur-[0.5px] flex items-start justify-center pt-3"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(135deg, hsl(var(--muted-foreground) / 0.06) 0 6px, transparent 6px 12px)",
                        }}
                      >
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-background/70 border border-border rounded-full px-2 py-0.5">
                          {lang === "ar" ? "مغلق" : "Closed"}
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
            <div className="p-6 text-center text-sm text-muted-foreground border-t border-border">
              {t("noAppointments")} — {lang === "ar" ? "اضغط على أي خانة لإنشاء موعد" : "click any slot to create one"}
            </div>
          )}
        </Card>
        )}
      </div>
      <Fab ariaLabel={t("newAppointment")} onClick={openNew}>
        <Plus className="size-6" />
      </Fab>
    </div>
  );
}