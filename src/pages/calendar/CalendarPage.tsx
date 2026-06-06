import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDataSync } from "@/lib/dataSync";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Plus, Send, CalendarDays, LayoutGrid, Clock, Filter, X, CalendarRange, Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Fab } from "@/components/ui/fab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RowActions } from "@/components/RowActions";
import { useIsMobile } from "@/hooks/use-mobile";

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
  procedure: string | null;
  room: string | null;
  notes: string | null;
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

const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24; // exclusive — show full 24h
const HOUR_HEIGHT = 56; // px

export default function CalendarPage() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [miniOpen, setMiniOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(new Date()));
  const [items, setItems] = useState<Appt[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<{ id: string; full_name: string }[]>([]);
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthDots, setMonthDots] = useState<Record<string, number>>({});
  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [procedures, setProcedures] = useState<{ id: string; name: string; duration: number | null }[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    patient_id: "", doctor_id: "", scheduled_at: "", duration_minutes: 30, procedure: "", room: "", notes: "",
    status: "scheduled" as Appt["status"],
  });

  // Force day view on mobile when user lands on week (too cramped). Month is fine.
  useEffect(() => {
    if (isMobile && view === "week") setView("day");
  }, [isMobile, view]);

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
  const hours = useMemo(() => Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i), []);

  const load = async () => {
    const start = rangeStart.toISOString();
    const end = rangeEnd.toISOString();
    let q = supabase.from("appointments")
      .select("*, patients!inner(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
      .gte("scheduled_at", start).lt("scheduled_at", end)
      .is("deleted_at", null)
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
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "doctor");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (!ids.length) { setDoctors([]); return; }
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const list = (profs ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name ?? p.id.slice(0, 8) }));
      list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
      setDoctors(list);
    })();
  }, []);

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
    supabase.from("patients").select("id,first_name_en,last_name_en").is("deleted_at", null).order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setPatients((data ?? []).map((p: any) => ({ id: p.id, label: `${p.first_name_en} ${p.last_name_en ?? ""}`.trim() }))));
  };
  useEffect(() => { loadPatientOptions(); }, []);
  useDataSync(["patients"], () => loadPatientOptions());

  // Load procedures + distinct rooms
  const loadProcedures = () => {
    supabase.from("procedures")
      .select("id,name_en,name_ar,default_duration")
      .eq("is_active", true).is("deleted_at", null)
      .order("name_en")
      .then(({ data }) => {
        setProcedures((data ?? []).map((p: any) => ({
          id: p.id,
          name: lang === "ar" ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar),
          duration: p.default_duration,
        })));
      });
  };
  const loadRooms = () => {
    let q = supabase.from("appointments").select("room").not("room", "is", null).is("deleted_at", null).limit(1000);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    q.then(({ data }) => {
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => { if (r.room) set.add(String(r.room).trim()); });
      setRooms(Array.from(set).sort());
    });
  };
  useEffect(() => { loadProcedures(); }, [lang]);
  useEffect(() => { loadRooms(); }, [currentBranchId]);
  useDataSync(["appointments"], () => loadRooms());

  const openNew = () => {
    setEditId(null);
    setForm({ patient_id: "", doctor_id: "", scheduled_at: "", duration_minutes: 30, procedure: "", room: "", notes: "", status: "scheduled" });
    setOpen(true);
  };
  const openNewAt = (slot: Date) => {
    setEditId(null);
    const tz = slot.getTimezoneOffset();
    const local = new Date(slot.getTime() - tz * 60000).toISOString().slice(0, 16);
    setForm({ patient_id: "", doctor_id: "", scheduled_at: local, duration_minutes: 30, procedure: "", room: "", notes: "", status: "scheduled" });
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
      procedure: a.procedure ?? "",
      room: a.room ?? "",
      notes: a.notes ?? "",
      status: a.status,
    });
    setOpen(true);
  };

  const softDelete = async (a: Appt): Promise<void> => {
    const { error } = await supabase.from("appointments").update({ deleted_at: new Date().toISOString() } as any).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete"));
    load();
  };

  const changeStatus = async (a: Appt, status: Appt["status"]): Promise<void> => {
    const { error } = await supabase.from("appointments").update({ status } as any).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    load();
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
      const nameEn = `${p.first_name_en} ${p.last_name_en ?? ""}`.trim();
      const nameAr = `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim();
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
    if (!form.patient_id || !form.scheduled_at) { toast.error("Pick a patient and time"); return; }
    const payload: any = {
      patient_id: form.patient_id,
      doctor_id: form.doctor_id || null,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_minutes: Number(form.duration_minutes) || 30,
      procedure: form.procedure || null,
      room: form.room || null,
      notes: form.notes || null,
    };
    if (editId) payload.status = form.status;
    const { error } = editId
      ? await supabase.from("appointments").update(payload).eq("id", editId)
      : await supabase.from("appointments").insert({ ...payload, branch_id: currentBranchId, status: "scheduled" });
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حفظ الموعد" : "Appointment saved");
    setOpen(false); setEditId(null);
    setForm({ patient_id: "", doctor_id: "", scheduled_at: "", duration_minutes: 30, procedure: "", room: "", notes: "", status: "scheduled" });
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

  // Block position for time grid
  const blockStyle = (a: Appt) => {
    const dt = new Date(a.scheduled_at);
    const minutesFromStart = (dt.getHours() - DAY_START_HOUR) * 60 + dt.getMinutes();
    const top = (minutesFromStart / 60) * HOUR_HEIGHT;
    const height = Math.max(28, (a.duration_minutes / 60) * HOUR_HEIGHT - 2);
    return { top: `${top}px`, height: `${height}px` };
  };

  const timeStr = (d: Date) => d.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US",
    { hour: "2-digit", minute: "2-digit", hour12: true });
  const fullName = (p: NonNullable<Appt["patients"]>) => lang === "ar"
    ? `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim()
    : `${p.first_name_en} ${p.last_name_en ?? ""}`.trim();

  const renderApptBlock = (a: Appt) => (
    <button
      key={a.id}
      id={`appt-${a.id}`}
      onClick={() => openEdit(a)}
      className={`absolute inset-x-1 rounded-md border text-start px-2 py-1 overflow-hidden hover:shadow-md transition-all ${statusBlock[a.status]} ${highlightId === a.id ? "ring-2 ring-primary shadow-lg z-10" : ""}`}
      style={blockStyle(a)}
      title={`${fullName(a.patients!)} · ${timeStr(new Date(a.scheduled_at))}`}
    >
      <div className="text-[11px] font-medium truncate">{timeStr(new Date(a.scheduled_at))} · {fullName(a.patients!)}</div>
      <div className="text-[10px] opacity-80 truncate">{a.procedure || "—"}{a.room ? ` · ${a.room}` : ""}</div>
    </button>
  );

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
  const nowTop = ((now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT;
  const showNowLine = now.getHours() >= DAY_START_HOUR && now.getHours() < DAY_END_HOUR;

  const sidebarContent = (
    <div className="space-y-4">
      <Card className="p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
            className="size-7 inline-flex items-center justify-center rounded hover:bg-muted">
            <ChevronLeft className="size-4" />
          </button>
          <div className="text-sm font-semibold">
            {monthCursor.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { month: "long", year: "numeric" })}
          </div>
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
            className="size-7 inline-flex items-center justify-center rounded hover:bg-muted">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
          {["S","M","T","W","T","F","S"].map((d, i) => <div key={i}>{d}</div>)}
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
              <CalendarDays className="size-4" /> {t("today")}
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-3 h-9 text-sm inline-flex items-center gap-1 border-s border-border ${view === "week" ? "bg-muted" : "hover:bg-muted/50"}`}
            >
              <LayoutGrid className="size-4" /> {lang === "ar" ? "أسبوع" : "Week"}
            </button>
          </div>
          <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, view === "week" ? -7 : -1))}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setDate(startOfDay(new Date()))}>{t("today")}</Button>
          <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, view === "week" ? 7 : 1))}><ChevronRight className="size-4" /></Button>
          <Sheet open={miniOpen} onOpenChange={setMiniOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label={lang === "ar" ? "التقويم" : "Calendar"}>
                <CalendarRange className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side={lang === "ar" ? "left" : "right"} className="w-[88vw] sm:w-[360px] p-4 overflow-y-auto">
              {sidebarContent}
            </SheetContent>
          </Sheet>
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
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "الطبيب" : "Doctor"}</Label>
                  <Combobox
                    value={form.doctor_id}
                    onChange={(v) => setForm({ ...form, doctor_id: v })}
                    options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
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
                    <Label>{t("procedure")}</Label>
                    <Select
                      value={procedures.find((p) => p.name === form.procedure) ? form.procedure : (form.procedure ? "__custom__" : "__none__")}
                      onValueChange={(v) => {
                        if (v === "__none__") { setForm({ ...form, procedure: "" }); return; }
                        if (v === "__custom__") return;
                        const sel = procedures.find((p) => p.name === v);
                        setForm({
                          ...form,
                          procedure: v,
                          duration_minutes: sel?.duration ? sel.duration : form.duration_minutes,
                        });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder={t("selectProcedure")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— {t("none")} —</SelectItem>
                        {procedures.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}{p.duration ? ` · ${p.duration}m` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("room")}</Label>
                    <Input
                      list="calendar-rooms-list"
                      value={form.room}
                      onChange={(e) => setForm({ ...form, room: e.target.value })}
                      maxLength={40}
                      placeholder={t("selectRoom")}
                    />
                    <datalist id="calendar-rooms-list">
                      {rooms.map((r) => <option key={r} value={r} />)}
                    </datalist>
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
        {[
          { label: lang === "ar" ? "إجمالي" : "Total", value: stats.total, cls: "text-foreground" },
          { label: lang === "ar" ? "قادمة" : "Upcoming", value: stats.scheduled, cls: "text-primary" },
          { label: lang === "ar" ? "مكتمل" : "Completed", value: stats.completed, cls: "text-emerald-500" },
          { label: lang === "ar" ? "ملغية" : "Cancelled", value: stats.cancelled, cls: "text-destructive" },
        ].map((s) => (
          <Card key={s.label} className="p-4 shadow-card">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.cls}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-3 shadow-card flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground me-1">
          <Filter className="size-3.5" /> {lang === "ar" ? "تصفية:" : "Filter:"}
        </div>
        <Select value={doctorFilter} onValueChange={setDoctorFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الأطباء" : "All doctors"}</SelectItem>
            <SelectItem value="__none__">{lang === "ar" ? "بدون طبيب" : "Unassigned"}</SelectItem>
            {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roomFilter} onValueChange={setRoomFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الغرف" : "All rooms"}</SelectItem>
            <SelectItem value="__none__">{lang === "ar" ? "بدون غرفة" : "No room"}</SelectItem>
            {rooms.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs"><SelectValue /></SelectTrigger>
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

      <div className="grid lg:grid-cols-[1fr,300px] gap-4">
        {/* Time grid */}
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
              </div>

              {/* Day columns */}
              {(view === "week" ? weekDays : [date]).map((d) => {
                const dayKey = d.toDateString();
                const dayItems = itemsByDay[dayKey] ?? [];
                const isToday = sameDay(d, new Date());
                return (
                  <div key={dayKey} className="relative border-e border-border last:border-e-0">
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
                        aria-label={`Create at ${h}:00`}
                      />
                    ))}
                    {/* Now line */}
                    {isToday && showNowLine && (
                      <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: nowTop }}>
                        <div className="h-px bg-destructive" />
                        <div className="size-2 -mt-1 ms-0 rounded-full bg-destructive" />
                      </div>
                    )}
                    {/* Appointment blocks */}
                    {dayItems.map(renderApptBlock)}
                  </div>
                );
              })}
            </div>
          </div>

          {filteredItems.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground border-t border-border">
              {t("noAppointments")} — {lang === "ar" ? "اضغط على أي خانة لإنشاء موعد" : "click any slot to create one"}
            </div>
          )}
        </Card>

        {/* Sidebar: mini month + agenda (desktop only) */}
        <div className="space-y-4 hidden lg:block">
          <Card className="p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
                className="size-7 inline-flex items-center justify-center rounded hover:bg-muted">
                <ChevronLeft className="size-4" />
              </button>
              <div className="text-sm font-semibold">
                {monthCursor.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { month: "long", year: "numeric" })}
              </div>
              <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
                className="size-7 inline-flex items-center justify-center rounded hover:bg-muted">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
              {["S","M","T","W","T","F","S"].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {monthGrid.map((d, i) => {
                if (!d) return <div key={i} />;
                const active = sameDay(d, date);
                const today = sameDay(d, new Date());
                const count = monthDots[d.toDateString()] ?? 0;
                return (
                  <button key={i} onClick={() => setDate(d)}
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

          <Card className="p-4 shadow-card">
            <div className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
              <Clock className="size-4" /> {lang === "ar" ? "أجندة اليوم" : "Today's agenda"}
            </div>
            {filteredItems.filter((a) => sameDay(new Date(a.scheduled_at), date)).length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">{t("noAppointments")}</div>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-auto">
                {filteredItems.filter((a) => sameDay(new Date(a.scheduled_at), date)).map((a) => {
                  const p = a.patients!;
                  return (
                    <div key={a.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                      <div className="w-1 self-stretch rounded-full gradient-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-mono tabular-nums text-muted-foreground">{timeStr(new Date(a.scheduled_at))}</div>
                          <Select value={a.status} onValueChange={(v) => changeStatus(a, v as Appt["status"])}>
                            <SelectTrigger className={`h-6 px-2 py-0 text-[10px] w-auto gap-1 ${statusClass[a.status]}`}>
                              <SelectValue>{statusLabel(a.status, t)}</SelectValue>
                            </SelectTrigger>
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
                        <div className="text-sm font-medium break-words leading-snug mt-0.5">{fullName(p)}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{a.procedure || "—"}</div>
                        <div className="flex items-center gap-1 mt-1 -ms-1">
                          <Button variant="ghost" size="icon" className="size-7" title={t("sendReminder")} onClick={() => sendReminderNow(a)}>
                            <Send className="size-3.5" />
                          </Button>
                          <RowActions onEdit={() => openEdit(a)} onDelete={() => softDelete(a)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
      <Fab ariaLabel={t("newAppointment")} onClick={openNew}>
        <Plus className="size-6" />
      </Fab>
    </div>
  );
}