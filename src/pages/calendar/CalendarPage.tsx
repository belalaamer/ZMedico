import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Appt = {
  id: string;
  patient_id: string;
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

const statusClass: Record<Appt["status"], string> = {
  scheduled: "status-progress",
  confirmed: "status-completed",
  in_progress: "status-progress",
  completed: "status-completed",
  cancelled: "status-cancelled",
  no_show: "status-cancelled",
  departed: "status-departed",
};

export default function CalendarPage() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [items, setItems] = useState<Appt[]>([]);
  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    patient_id: "", scheduled_at: "", duration_minutes: 30, procedure: "", room: "", notes: "",
  });

  const dayLabel = useMemo(
    () => date.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    [date, lang]
  );

  const load = async () => {
    const start = startOfDay(date).toISOString();
    const end = addDays(startOfDay(date), 1).toISOString();
    let q = supabase.from("appointments")
      .select("*, patients!inner(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
      .gte("scheduled_at", start).lt("scheduled_at", end)
      .order("scheduled_at", { ascending: true });
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as any);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date, currentBranchId]);

  useEffect(() => {
    supabase.from("patients").select("id,first_name_en,last_name_en").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setPatients((data ?? []).map((p: any) => ({ id: p.id, label: `${p.first_name_en} ${p.last_name_en ?? ""}`.trim() }))));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id || !form.scheduled_at) { toast.error("Pick a patient and time"); return; }
    const { error } = await supabase.from("appointments").insert({
      patient_id: form.patient_id,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_minutes: Number(form.duration_minutes) || 30,
      procedure: form.procedure || null,
      room: form.room || null,
      notes: form.notes || null,
      branch_id: currentBranchId,
      status: "scheduled",
    });
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حفظ الموعد" : "Appointment saved");
    setOpen(false);
    setForm({ patient_id: "", scheduled_at: "", duration_minutes: 30, procedure: "", room: "", notes: "" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("calendar")}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{dayLabel}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setDate(startOfDay(new Date()))}>{t("today")}</Button>
          <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, 1))}><ChevronRight className="size-4" /></Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />{t("newAppointment")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("newAppointment")}</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("patientName")}</Label>
                  <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("scheduledAt")}</Label>
                    <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("durationMin")}</Label>
                    <Input type="number" min={5} max={480} value={form.duration_minutes}
                      onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("procedure")}</Label>
                    <Input value={form.procedure} onChange={(e) => setForm({ ...form, procedure: e.target.value })} maxLength={120} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("room")}</Label>
                    <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} maxLength={40} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("notes")}</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                  <Button type="submit" className="gradient-primary text-primary-foreground">{t("save")}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr,300px] gap-4">
        <Card className="shadow-card overflow-hidden">
          {items.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">{t("noAppointments")}</div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((a) => {
                const time = new Date(a.scheduled_at).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US",
                  { hour: "2-digit", minute: "2-digit", hour12: true });
                const p = a.patients!;
                const name = lang === "ar"
                  ? `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim()
                  : `${p.first_name_en} ${p.last_name_en ?? ""}`.trim();
                return (
                  <div key={a.id} className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors">
                    <div className="w-20 text-sm font-mono tabular-nums text-muted-foreground">{time}</div>
                    <div className="w-1 self-stretch rounded-full gradient-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{name} <span className="text-xs text-muted-foreground">#{p.patient_code}</span></div>
                      <div className="text-xs text-muted-foreground truncate">
                        {a.procedure || "—"} {a.room ? `· ${a.room}` : ""} · {a.duration_minutes} min
                      </div>
                    </div>
                    <Badge variant="outline" className={statusClass[a.status]}>{t(`status${a.status.charAt(0).toUpperCase() + a.status.slice(1).replace("_","")}` as any) ?? a.status}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4 shadow-card h-fit">
          <div className="text-sm font-semibold mb-3">{t("today")}</div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: 14 }).map((_, i) => {
              const d = addDays(startOfDay(new Date()), i - 2);
              const active = d.getTime() === date.getTime();
              return (
                <button key={i} onClick={() => setDate(d)}
                  className={`p-2 rounded-lg ${active ? "gradient-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  <div className="text-[10px] opacity-70">{d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { weekday: "short" })}</div>
                  <div className="font-semibold">{d.getDate()}</div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}