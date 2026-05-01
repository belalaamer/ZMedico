import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTime } from "@/lib/format";
import { ReportPageHeader } from "./_shared";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function ScheduledReports() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", template_id: "", frequency: "weekly", recipients: "", format: "pdf" });

  const load = async () => {
    const { data } = await supabase.from("report_schedules")
      .select("*, report_templates(name_en, name_ar)").order("created_at", { ascending: false });
    setList(data ?? []);
  };

  useEffect(() => {
    load();
    supabase.from("report_templates").select("id, name_en, name_ar").eq("is_active", true).order("name_en").then(({ data }) => setTemplates(data ?? []));
  }, []);

  const computeNextRun = (freq: string) => {
    const d = new Date();
    if (freq === "daily") d.setDate(d.getDate() + 1);
    else if (freq === "weekly") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    return d.toISOString();
  };

  const create = async () => {
    if (!form.name || !form.template_id) { toast.error("Name & template required"); return; }
    const { error } = await supabase.from("report_schedules").insert({
      name: form.name, template_id: form.template_id,
      frequency: form.frequency as any, format: form.format as any,
      recipients: form.recipients.split(",").map((s) => s.trim()).filter(Boolean),
      next_run_at: computeNextRun(form.frequency), created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Scheduled");
    setOpen(false); setForm({ name: "", template_id: "", frequency: "weekly", recipients: "", format: "pdf" });
    load();
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("report_schedules").update({ is_active: active }).eq("id", id);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("report_schedules").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ReportPageHeader title={t("scheduledReports")} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4 me-1" />{t("createSchedule")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("createSchedule")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>{t("reportTemplate")}</Label>
                <Select value={form.template_id} onValueChange={(v) => setForm({ ...form, template_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>{lang === "ar" ? tpl.name_ar : tpl.name_en}</SelectItem>
                  ))}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("frequency")}</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t("daily")}</SelectItem>
                    <SelectItem value="weekly">{t("weekly")}</SelectItem>
                    <SelectItem value="monthly">{t("monthly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("fileFormat")}</Label>
                <Select value={form.format} onValueChange={(v) => setForm({ ...form, format: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="excel">Excel</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("recipients")}</Label><Input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="a@x.com, b@y.com" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button><Button onClick={create}>{t("save")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>Name</TableHead><TableHead>{t("reportTemplate")}</TableHead>
          <TableHead>{t("frequency")}</TableHead><TableHead>{t("fileFormat")}</TableHead>
          <TableHead>{t("nextRun")}</TableHead><TableHead>{t("active")}</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>{list.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>{lang === "ar" ? r.report_templates?.name_ar : r.report_templates?.name_en}</TableCell>
            <TableCell>{t(r.frequency as any)}</TableCell>
            <TableCell className="uppercase text-xs">{r.format}</TableCell>
            <TableCell>{formatDateTime(r.next_run_at, lang)}</TableCell>
            <TableCell><Switch checked={r.is_active} onCheckedChange={(v) => toggle(r.id, v)} /></TableCell>
            <TableCell><Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="size-4" /></Button></TableCell>
          </TableRow>
        ))}{!list.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}