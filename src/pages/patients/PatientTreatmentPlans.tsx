import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Check, X, Trash2, FileText } from "lucide-react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";

type Plan = any;
type Session = any;

export default function PatientTreatmentPlans({ patientId }: { patientId: string }) {
  const { lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sessionsByPlan, setSessionsByPlan] = useState<Record<string, Session[]>>({});
  const [doctors, setDoctors] = useState<{ id: string; full_name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name_ar: "", name_en: "", doctor_id: "", total_sessions: 10, price: 0, start_date: new Date().toISOString().slice(0, 10) });
  const [schedSession, setSchedSession] = useState<Session | null>(null);
  const [schedAt, setSchedAt] = useState<string>("");

  const load = async () => {
    const { data } = await (supabase as any)
      .from("treatment_plans")
      .select("*")
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setPlans(data ?? []);
    const ids = (data ?? []).map((p: any) => p.id);
    if (ids.length) {
      const { data: s } = await (supabase as any)
        .from("treatment_sessions")
        .select("*")
        .in("treatment_plan_id", ids)
        .order("session_number", { ascending: true });
      const map: Record<string, Session[]> = {};
      (s ?? []).forEach((x: any) => { (map[x.treatment_plan_id] ||= []).push(x); });
      setSessionsByPlan(map);
    } else { setSessionsByPlan({}); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patientId]);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "doctor");
      const doctorIds = (roles ?? []).map((r: any) => r.user_id);
      if (!doctorIds.length) { setDoctors([]); return; }
      const { data: staff } = await supabase.from("staff_profiles").select("id").in("id", doctorIds).eq("status", "active");
      const ids = (staff ?? []).map((s: any) => s.id);
      if (!ids.length) { setDoctors([]); return; }
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const list = (profs ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name ?? p.id.slice(0, 8) }));
      list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
      setDoctors(list);
    })();
  }, []);

  const createPlan = async () => {
    if (!form.name_en && !form.name_ar) { toast.error(lang === "ar" ? "أدخل اسم الخطة" : "Enter plan name"); return; }
    setSaving(true);
    const { data, error } = await (supabase as any).from("treatment_plans").insert({
      patient_id: patientId,
      doctor_id: form.doctor_id || null,
      branch_id: currentBranchId,
      name_ar: form.name_ar || form.name_en,
      name_en: form.name_en || form.name_ar,
      total_sessions: form.total_sessions,
      price: form.price,
      start_date: form.start_date,
      created_by: user?.id ?? null,
    }).select("id").single();
    if (error) { setSaving(false); toast.error(error.message); return; }
    // Pre-generate session placeholders
    const rows = Array.from({ length: form.total_sessions }, (_, i) => ({
      treatment_plan_id: data.id,
      session_number: i + 1,
      doctor_id: form.doctor_id || null,
      status: "pending",
      created_by: user?.id ?? null,
    }));
    await (supabase as any).from("treatment_sessions").insert(rows);
    setSaving(false);
    setOpen(false);
    setForm({ name_ar: "", name_en: "", doctor_id: "", total_sessions: 10, price: 0, start_date: new Date().toISOString().slice(0, 10) });
    toast.success(lang === "ar" ? "تم إنشاء الخطة" : "Plan created");
    load();
  };

  const setSessionStatus = async (s: Session, status: "completed" | "missed" | "pending") => {
    const patch: any = { status };
    if (status === "completed") patch.performed_at = new Date().toISOString();
    else if (status === "pending") patch.performed_at = null;
    const { error } = await (supabase as any).from("treatment_sessions").update(patch).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    // Sync linked appointment status if any
    if (s.appointment_id) {
      const apptStatus = status === "completed" ? "completed" : status === "missed" ? "no_show" : "scheduled";
      await (supabase as any).from("appointments").update({ status: apptStatus }).eq("id", s.appointment_id);
    }
    load();
  };

  const openSchedule = (s: Session) => {
    setSchedSession(s);
    const base = s.scheduled_date ? new Date(s.scheduled_date + "T10:00") : new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setSchedAt(`${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`);
  };

  const saveSchedule = async () => {
    if (!schedSession || !schedAt) return;
    const plan = plans.find((p) => p.id === schedSession.treatment_plan_id);
    const doctor_id = schedSession.doctor_id || plan?.doctor_id || null;
    const scheduled_at = new Date(schedAt).toISOString();
    let appointmentId = schedSession.appointment_id as string | null;
    if (appointmentId) {
      const { error } = await (supabase as any).from("appointments").update({ scheduled_at, doctor_id, branch_id: currentBranchId }).eq("id", appointmentId);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await (supabase as any).from("appointments").insert({
        patient_id: patientId,
        doctor_id,
        branch_id: currentBranchId,
        scheduled_at,
        duration_minutes: 30,
        status: "scheduled",
        procedure: (lang === "ar" ? (plan?.name_ar || plan?.name_en) : (plan?.name_en || plan?.name_ar)) ?? null,
        notes: `Session #${schedSession.session_number}`,
      }).select("id").single();
      if (error) { toast.error(error.message); return; }
      appointmentId = data.id;
    }
    const { error: e2 } = await (supabase as any).from("treatment_sessions").update({
      appointment_id: appointmentId,
      scheduled_date: scheduled_at.slice(0, 10),
    }).eq("id", schedSession.id);
    if (e2) { toast.error(e2.message); return; }
    toast.success(lang === "ar" ? "تم جدولة الجلسة" : "Session scheduled");
    setSchedSession(null);
    setSchedAt("");
    load();
  };

  const cancelPlan = async (p: Plan) => {
    await (supabase as any).from("treatment_plans").update({ status: "cancelled" }).eq("id", p.id);
    load();
  };

  const deletePlan = async (p: Plan) => {
    await (supabase as any).from("treatment_plans").update({ deleted_at: new Date().toISOString() }).eq("id", p.id);
    load();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { active: "status-progress", completed: "status-completed", cancelled: "status-cancelled", paused: "status-pending" };
    return map[s] || "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{lang === "ar" ? "خطط العلاج / الجلسات" : "Treatment Plans / Sessions"}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground"><Plus className="size-4 me-1" />{lang === "ar" ? "خطة جديدة" : "New Plan"}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{lang === "ar" ? "إنشاء خطة علاج" : "Create Treatment Plan"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2"><Label>{lang === "ar" ? "اسم الخطة" : "Plan Name"}</Label><Input dir="auto" value={lang === "ar" ? form.name_ar : form.name_en} onChange={(e) => setForm({ ...form, [lang === "ar" ? "name_ar" : "name_en"]: e.target.value } as any)} placeholder={lang === "ar" ? "مثال: علاج طبيعي" : "e.g. Physiotherapy"} /></div>
              <div className="space-y-1"><Label>{lang === "ar" ? "الطبيب" : "Doctor"}</Label>
                <Select value={form.doctor_id || "none"} onValueChange={(v) => setForm({ ...form, doctor_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— {lang === "ar" ? "لا يوجد" : "None"} —</SelectItem>
                    {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{lang === "ar" ? "تاريخ البدء" : "Start Date"}</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div className="space-y-1"><Label>{lang === "ar" ? "عدد الجلسات" : "Total Sessions"}</Label><Input type="number" min={1} value={form.total_sessions} onChange={(e) => setForm({ ...form, total_sessions: Math.max(1, +e.target.value) })} /></div>
              <div className="space-y-1"><Label>{lang === "ar" ? "السعر الإجمالي" : "Total Price"}</Label><Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
              <Button disabled={saving} onClick={createPlan} className="gradient-primary text-primary-foreground">{lang === "ar" ? "حفظ" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {plans.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">{lang === "ar" ? "لا توجد خطط علاج بعد" : "No treatment plans yet"}</Card>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => {
            const sessions = sessionsByPlan[p.id] ?? [];
            const done = sessions.filter((s) => s.status === "completed").length;
            const pct = p.total_sessions ? Math.round((done / p.total_sessions) * 100) : 0;
            const doc = doctors.find((d) => d.id === p.doctor_id);
            return (
              <Card key={p.id} className="p-5 shadow-card space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold">{lang === "ar" ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}</div>
                      <Badge variant="outline" className={statusBadge(p.status)}>{p.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {doc?.full_name ?? "—"} · {formatDate(p.start_date, lang)} · {formatMoney(p.price, lang)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.invoice_id && (
                      <Link to={`/invoices/${p.invoice_id}`}>
                        <Button size="sm" variant="outline"><FileText className="size-4 me-1" />{lang === "ar" ? "الفاتورة" : "Invoice"}</Button>
                      </Link>
                    )}
                    {p.status === "active" && <Button size="sm" variant="outline" onClick={() => cancelPlan(p)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => deletePlan(p)}><Trash2 className="size-4 text-destructive" /></Button>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{lang === "ar" ? `${done} من ${p.total_sessions} جلسات` : `${done} of ${p.total_sessions} sessions`}</span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {sessions.map((s) => (
                    <div key={s.id} className={`border rounded-md p-2 text-xs ${s.status === "completed" ? "bg-success/10 border-success/30" : s.status === "missed" ? "bg-destructive/10 border-destructive/30" : "bg-muted/30"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold">#{s.session_number}</span>
                        <span className="text-[10px] text-muted-foreground">{s.performed_at ? formatDate(s.performed_at, lang) : "—"}</span>
                      </div>
                      {s.scheduled_date && (
                        <div className="text-[10px] text-muted-foreground mb-1">
                          {lang === "ar" ? "موعد:" : "Appt:"} {formatDate(s.scheduled_date, lang)}
                        </div>
                      )}
                      <div className="flex gap-1">
                        <Button size="sm" variant={s.status === "completed" ? "default" : "outline"} className="h-6 px-2 flex-1" onClick={() => setSessionStatus(s, s.status === "completed" ? "pending" : "completed")}>
                          <Check className="size-3" />
                        </Button>
                        <Button size="sm" variant={s.status === "missed" ? "destructive" : "outline"} className="h-6 px-2 flex-1" onClick={() => setSessionStatus(s, s.status === "missed" ? "pending" : "missed")}>
                          <X className="size-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => openSchedule(s)} title={lang === "ar" ? "جدولة" : "Schedule"}>
                          <CalendarIcon className="size-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Dialog open={!!schedSession} onOpenChange={(o) => { if (!o) { setSchedSession(null); setSchedAt(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{lang === "ar" ? "جدولة الجلسة" : "Schedule Session"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>{lang === "ar" ? "التاريخ والوقت" : "Date & Time"}</Label>
            <Input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setSchedSession(null); setSchedAt(""); }}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={saveSchedule} className="gradient-primary text-primary-foreground">{lang === "ar" ? "حفظ" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}