import { useEffect, useMemo, useState } from "react";
import { Plus, Send, RefreshCw, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDataSync } from "@/lib/dataSync";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Reminder = {
  id: string; appointment_id: string | null; patient_id: string | null;
  branch_id: string | null;
  reminder_type: "sms" | "email" | "whatsapp" | "push";
  scheduled_time: string;
  message_ar: string; message_en: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  sent_at: string | null; error_message: string | null;
};

type Patient = { id: string; first_name_en: string | null; first_name_ar: string | null; phone: string | null };

const statusColor: Record<Reminder["status"], string> = {
  pending: "bg-amber-500/10 text-amber-600 border-0",
  sent: "bg-emerald-500/10 text-emerald-600 border-0",
  failed: "bg-destructive/10 text-destructive border-0",
  cancelled: "bg-muted text-muted-foreground border-0",
};

export default function ScheduledReminders() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Reminder[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    patient_id: "",
    reminder_type: "sms" as Reminder["reminder_type"],
    scheduled_time: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    message: "",
  });

  const load = async () => {
    let q = supabase.from("reminders").select("*").order("scheduled_time", { ascending: false }).limit(300);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data } = await q;
    setItems((data ?? []) as Reminder[]);
    const { data: p } = await supabase.from("patients").select("id, first_name_en, first_name_ar, phone")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
    setPatients((p ?? []) as Patient[]);
  };
  useEffect(() => { load(); }, [currentBranchId]);
  useDataSync(["patients", "reminders"], () => load());

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (typeFilter === "all" || r.reminder_type === typeFilter) &&
      (!q || r.message_en.toLowerCase().includes(q) || r.message_ar.includes(q))
    );
  }, [items, search, statusFilter, typeFilter]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = items.filter((r) => {
    const d = new Date(r.scheduled_time); d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }).length;
  const upcomingCount = items.filter((r) => new Date(r.scheduled_time) > new Date() && r.status === "pending").length;
  const pendingCount = items.filter((r) => r.status === "pending").length;

  const patientName = (id: string | null) => {
    if (!id) return "—";
    const p = patients.find((x) => x.id === id);
    if (!p) return "—";
    return lang === "ar" ? (p.first_name_ar || p.first_name_en || "—") : (p.first_name_en || p.first_name_ar || "—");
  };

  const create = async () => {
    if (!form.patient_id || !form.message.trim()) {
      toast({ title: "Required", variant: "destructive" }); return;
    }
    const { error } = await supabase.from("reminders").insert({
      patient_id: form.patient_id,
      branch_id: currentBranchId ?? null,
      reminder_type: form.reminder_type,
      scheduled_time: new Date(form.scheduled_time).toISOString(),
      message_en: form.message, message_ar: form.message,
      status: "pending",
      created_by: user?.id ?? null,
    });
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    setOpen(false); load();
    toast({ title: t("saved") });
  };

  const markSent = async (id: string) => {
    await supabase.from("reminders").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
    load();
  };
  const sendNow = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("send-reminder", { body: { reminder_id: id } });
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    const r = (data?.results ?? [])[0];
    if (r && !r.ok) toast({ title: r.error ?? "Failed", variant: "destructive" });
    else toast({ title: t("sent") });
    load();
  };
  const sendAllPending = async () => {
    const { data, error } = await supabase.functions.invoke("send-reminder", {
      body: { branch_id: currentBranchId ?? undefined, due_only: false },
    });
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    toast({ title: `Sent: ${data?.sent ?? 0}, Failed: ${data?.failed ?? 0}` });
    load();
  };
  const reschedule = async (id: string) => {
    const next = prompt("New time (YYYY-MM-DD HH:MM)");
    if (!next) return;
    const d = new Date(next);
    if (isNaN(d.getTime())) { toast({ title: "Invalid date", variant: "destructive" }); return; }
    await supabase.from("reminders").update({ scheduled_time: d.toISOString(), status: "pending" }).eq("id", id);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("reminders").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("today")}</div><div className="text-2xl font-bold">{todayCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("upcoming")}</div><div className="text-2xl font-bold">{upcomingCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("pending")}</div><div className="text-2xl font-bold">{pendingCount}</div></CardContent></Card>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} className="ps-9 w-64" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="pending">{t("pending")}</SelectItem>
            <SelectItem value="sent">{t("sent")}</SelectItem>
            <SelectItem value="failed">{t("failed")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("type")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="sms">{t("sms")}</SelectItem>
            <SelectItem value="email">{t("email")}</SelectItem>
            <SelectItem value="whatsapp">{t("whatsapp")}</SelectItem>
            <SelectItem value="push">{t("push")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ms-auto">
          <Button variant="outline" className="me-2" onClick={sendAllPending}>
            <Send className="size-4 me-1" />{t("sendAllPending")}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="size-4 me-1" />{t("sendReminder")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("sendReminder")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t("patients")}</Label>
                  <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {(lang === "ar" ? (p.first_name_ar || p.first_name_en) : (p.first_name_en || p.first_name_ar)) ?? p.id.slice(0, 8)}
                          {p.phone ? ` — ${p.phone}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("reminderType")}</Label>
                    <Select value={form.reminder_type} onValueChange={(v) => setForm({ ...form, reminder_type: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sms">{t("sms")}</SelectItem>
                        <SelectItem value="email">{t("email")}</SelectItem>
                        <SelectItem value="whatsapp">{t("whatsapp")}</SelectItem>
                        <SelectItem value="push">{t("push")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("scheduledTime")}</Label>
                    <Input type="datetime-local" value={form.scheduled_time} onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>{t("message")}</Label>
                  <Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                <Button onClick={create}>{t("save")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("patients")}</TableHead>
                <TableHead>{t("reminderType")}</TableHead>
                <TableHead>{t("scheduledTime")}</TableHead>
                <TableHead>{t("message")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="w-32">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{patientName(r.patient_id)}</TableCell>
                  <TableCell><Badge variant="outline">{t(r.reminder_type as any)}</Badge></TableCell>
                  <TableCell className="text-sm">{new Date(r.scheduled_time).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</TableCell>
                  <TableCell className="max-w-sm truncate text-sm text-muted-foreground">{lang === "ar" ? r.message_ar : r.message_en}</TableCell>
                  <TableCell><Badge className={statusColor[r.status]}>{t(r.status as any)}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.status === "pending" && (
                        <Button size="icon" variant="ghost" title={t("sendNow")} onClick={() => sendNow(r.id)}>
                          <Send className="size-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" title="Reschedule" onClick={() => reschedule(r.id)}>
                        <RefreshCw className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">{t("noData")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}