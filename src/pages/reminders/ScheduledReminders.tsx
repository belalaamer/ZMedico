import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Send, RefreshCw, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notConfirmedCopy, rowsWritten } from "@/lib/writeOutcome";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { patientDisplayDirection, patientDisplayName } from "@/lib/patientName";
import { reminderSendOutcome } from "@/lib/reminderSendOutcome";

type Reminder = {
  id: string; appointment_id: string | null; patient_id: string | null;
  branch_id: string | null;
  reminder_type: "sms" | "email" | "whatsapp" | "push";
  scheduled_time: string;
  message_ar: string; message_en: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  sent_at: string | null; error_message: string | null;
};

type Patient = { id: string; first_name_en: string | null; last_name_en: string | null; first_name_ar: string | null; last_name_ar: string | null; name_language: "ar" | "en" | null; phone: string | null };

const statusColor: Record<Reminder["status"], string> = {
  pending: "bg-amber-500/10 text-amber-600 border-0",
  sent: "bg-emerald-500/10 text-emerald-600 border-0",
  failed: "bg-destructive/10 text-destructive border-0",
  cancelled: "bg-muted text-muted-foreground border-0",
};

export default function ScheduledReminders() {
  const { t, lang } = useI18n();
  const { currentBranchId, branchSelectionReady } = useBranch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Reminder[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const loadRequestRef = useRef(0);
  // One send in flight at a time: a second run would message the same patients twice.
  const sending = useRef(false);
  const [sendingState, setSendingState] = useState(false);
  const [form, setForm] = useState({
    patient_id: "",
    reminder_type: "sms" as Reminder["reminder_type"],
    scheduled_time: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    message: "",
  });

  const load = async () => {
    const requestId = ++loadRequestRef.current;
    const branchId = currentBranchId;
    if (!branchSelectionReady || !branchId) { setItems([]); setPatients([]); return; }
    const q = supabase.from("reminders").select("*").eq("branch_id", branchId).order("scheduled_time", { ascending: false }).limit(300);
    const { data } = await q;
    if (requestId !== loadRequestRef.current) return;
    setItems((data ?? []) as Reminder[]);
    const { data: p } = await supabase.from("patients").select("id, first_name_en, last_name_en, first_name_ar, last_name_ar, name_language, phone")
      .eq("branch_id", branchId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
    if (requestId === loadRequestRef.current) setPatients((p ?? []) as Patient[]);
  };
  useEffect(() => { void load(); }, [branchSelectionReady, currentBranchId]);
  useDataSync(["patients", "reminders"], () => { void load(); });

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
    const p = id ? patients.find((x) => x.id === id) : null;
    return patientDisplayName(p, lang);
  };

  const create = async () => {
    if (!branchSelectionReady || !currentBranchId) { toast({ title: t("selectBranch"), variant: "destructive" }); return; }
    if (!form.patient_id || !form.message.trim()) {
      toast({ title: "Required", variant: "destructive" }); return;
    }
    const { error } = await supabase.from("reminders").insert({
      patient_id: form.patient_id,
      branch_id: currentBranchId,
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
    if (!branchSelectionReady || !currentBranchId) return;
    const { data, error } = await supabase.from("reminders").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id).eq("branch_id", currentBranchId).select("id");
    if (error) { toast({ title: error.message, variant: "destructive" }); load(); return; }
    if (rowsWritten(data) === 0) { toast({ title: notConfirmedCopy(lang, "save"), variant: "destructive" }); load(); return; }
    load();
  };
  const sendNow = async (id: string) => {
    if (sending.current) return;
    sending.current = true; setSendingState(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-reminder", { body: { reminder_id: id } });
      const outcome = await reminderSendOutcome({ data: data as any, error, lang, single: true });
      toast({ title: outcome.title, description: outcome.description, variant: outcome.tone === "error" ? "destructive" : "default" });
    } finally {
      sending.current = false; setSendingState(false);
      load();
    }
  };
  const sendAllPending = async () => {
    if (!branchSelectionReady) return;
    if (sending.current) return;
    sending.current = true; setSendingState(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-reminder", {
        body: { branch_id: currentBranchId ?? undefined, due_only: false },
      });
      const outcome = await reminderSendOutcome({ data: data as any, error, lang });
      toast({ title: outcome.title, description: outcome.description, variant: outcome.tone === "error" ? "destructive" : "default" });
    } finally {
      sending.current = false; setSendingState(false);
      load();
    }
  };
  const reschedule = async (id: string) => {
    const next = prompt("New time (YYYY-MM-DD HH:MM)");
    if (!next) return;
    const d = new Date(next);
    if (isNaN(d.getTime())) { toast({ title: "Invalid date", variant: "destructive" }); return; }
    const { data, error } = await supabase.from("reminders").update({ scheduled_time: d.toISOString(), status: "pending" }).eq("id", id).select("id");
    if (error) { toast({ title: error.message, variant: "destructive" }); load(); return; }
    if (rowsWritten(data) === 0) { toast({ title: notConfirmedCopy(lang, "save"), variant: "destructive" }); load(); return; }
    load();
  };
  const remove = async (id: string) => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.from("reminders").delete().eq("id", id).select("id");
      if (error) { toast({ title: error.message, variant: "destructive" }); load(); return; }
      if (rowsWritten(data) === 0) { toast({ title: notConfirmedCopy(lang, "delete"), variant: "destructive" }); load(); return; }
      load();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
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
          <Button variant="outline" className="me-2" onClick={sendAllPending} disabled={sendingState}>
            {sendingState ? <RefreshCw className="size-4 me-1 animate-spin" /> : <Send className="size-4 me-1" />}{t("sendAllPending")}
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
                          <span dir={patientDisplayDirection(p, lang)}>{patientDisplayName(p, lang)}</span>
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
                  <TableCell dir={patientDisplayDirection(patients.find((p) => p.id === r.patient_id), lang)}>{patientName(r.patient_id)}</TableCell>
                  <TableCell><Badge variant="outline">{t(r.reminder_type as any)}</Badge></TableCell>
                  <TableCell className="text-sm">{new Date(r.scheduled_time).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</TableCell>
                  <TableCell className="max-w-sm truncate text-sm text-muted-foreground">{lang === "ar" ? r.message_ar : r.message_en}</TableCell>
                  <TableCell><Badge className={statusColor[r.status]}>{t(r.status as any)}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.status === "pending" && (
                        <Button size="icon" variant="ghost" title={t("sendNow")} onClick={() => sendNow(r.id)} disabled={sendingState}>
                          <Send className="size-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" title="Reschedule" onClick={() => reschedule(r.id)}>
                        <RefreshCw className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(r)}>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "حذف التذكير المجدول؟" : "Delete this scheduled reminder?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (lang === "ar"
                ? `سيُحذف تذكير ${t(deleteTarget.reminder_type as any)} المجدول في ${new Date(deleteTarget.scheduled_time).toLocaleString("ar-EG")} لـ «${patientName(deleteTarget.patient_id)}» نهائياً من قائمة التذكيرات. المريض وموعده لا يتأثران${deleteTarget.status === "pending" ? "، ولن يُرسل هذا التذكير أبداً" : ""}، والسطر المحذوف لا يمكن استرجاعه.`
                : `The ${t(deleteTarget.reminder_type as any)} reminder scheduled for ${new Date(deleteTarget.scheduled_time).toLocaleString("en-US")} for ${patientName(deleteTarget.patient_id)} will be deleted from this list permanently. The patient and their appointment are untouched${deleteTarget.status === "pending" ? ", and this reminder will never be sent" : ""}, and the deleted row cannot be recovered.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove(deleteTarget.id)}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (lang === "ar" ? "جارٍ الحذف..." : "Deleting...") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}