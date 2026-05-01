import { useEffect, useMemo, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

function diffDays(a: string, b: string) {
  const d1 = new Date(a), d2 = new Date(b);
  return Math.max(1, Math.round((+d2 - +d1) / 86400000) + 1);
}

export default function Leaves() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ staff_id: "", leave_type_id: "", start_date: "", end_date: "", reason_en: "" });

  const load = async () => {
    const { data } = await supabase.from("leave_requests").select("*, leave_type:leave_types(name_en,name_ar)").order("created_at", { ascending: false });
    setItems(data ?? []);
    const { data: lt } = await supabase.from("leave_types").select("*");
    setTypes(lt ?? []);
    const { data: s } = await supabase.from("staff_profiles").select("id,employee_id");
    setStaff(s ?? []);
    const { data: p } = await supabase.from("profiles").select("id,full_name,email");
    setProfiles(p ?? []);
  };
  useEffect(() => { load(); }, []);

  const totalDays = useMemo(() => form.start_date && form.end_date ? diffDays(form.start_date, form.end_date) : 0, [form.start_date, form.end_date]);

  const submit = async () => {
    if (!form.staff_id || !form.leave_type_id || !form.start_date || !form.end_date) { toast.error("Fill all fields"); return; }
    const { error } = await supabase.from("leave_requests").insert({ staff_id: form.staff_id, leave_type_id: form.leave_type_id, start_date: form.start_date, end_date: form.end_date, total_days: totalDays, reason_en: form.reason_en || null });
    if (error) return toast.error(error.message);
    toast.success(t("save")); setOpen(false); setForm({ staff_id: "", leave_type_id: "", start_date: "", end_date: "", reason_en: "" }); load();
  };

  const decide = async (id: string, status: "approved" | "rejected", reason?: string) => {
    const { error } = await supabase.from("leave_requests").update({ status, approved_by: user?.id, approved_at: new Date().toISOString(), rejection_reason: reason ?? null }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const profName = (sid: string) => profiles.find((p) => p.id === sid)?.full_name ?? profiles.find((p) => p.id === sid)?.email ?? sid;
  const filtered = filterStatus === "all" ? items : items.filter((i) => i.status === filterStatus);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("leaveRequests")}</h1>
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll") || "All"}</SelectItem>
              <SelectItem value="pending">{t("statusPending")}</SelectItem>
              <SelectItem value="approved">{t("statusApproved")}</SelectItem>
              <SelectItem value="rejected">{t("statusRejected")}</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />{t("requestLeave")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("requestLeave")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2"><Label>{t("staff")}</Label>
                  <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                    <SelectTrigger><SelectValue placeholder={t("selectStaff")} /></SelectTrigger>
                    <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{profName(s.id)} · {s.employee_id}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t("leaveType")}</Label>
                  <Select value={form.leave_type_id} onValueChange={(v) => setForm({ ...form, leave_type_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{types.map((lt) => <SelectItem key={lt.id} value={lt.id}>{lang === "ar" ? lt.name_ar : lt.name_en}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>{t("startDate")}</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("endDate")}</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
                </div>
                <div className="text-sm text-muted-foreground">{t("totalDays")}: <span className="font-bold text-foreground">{totalDays}</span></div>
                <div className="space-y-2"><Label>{t("reason")}</Label><Textarea value={form.reason_en} onChange={(e) => setForm({ ...form, reason_en: e.target.value })} rows={3} /></div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                <Button className="gradient-primary text-primary-foreground" onClick={submit}>{t("save")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card className="shadow-card overflow-hidden">
        {filtered.length === 0 ? <div className="p-10 text-center text-muted-foreground">—</div> : (
          <div className="divide-y divide-border">
            {filtered.map((l) => (
              <div key={l.id} className="flex items-center gap-3 p-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{profName(l.staff_id)}</div>
                  <div className="text-xs text-muted-foreground">{lang === "ar" ? l.leave_type?.name_ar : l.leave_type?.name_en} · {formatDate(l.start_date, lang)} → {formatDate(l.end_date, lang)}</div>
                  {l.reason_en && <div className="text-xs text-muted-foreground mt-1">{l.reason_en}</div>}
                </div>
                <Badge variant="outline">{l.total_days} {t("totalDays")}</Badge>
                <Badge variant="outline" className={l.status === "approved" ? "status-completed" : l.status === "rejected" ? "status-departed" : ""}>{t(`status${l.status.charAt(0).toUpperCase()}${l.status.slice(1)}` as any)}</Badge>
                {l.status === "pending" && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => decide(l.id, "approved")}><Check className="size-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => { const r = prompt(t("rejectionReason")) || ""; decide(l.id, "rejected", r); }}><X className="size-4" /></Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}