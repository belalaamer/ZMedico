import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, CheckCircle2, Clock3, Filter, MessageCircle, Phone, Plus, Search, Target, TrendingUp, UserRound, UsersRound, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

 type LeadPriority = "low" | "medium" | "high" | "urgent";

type Stage = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  position: number;
  color: string;
  is_closed: boolean;
};

type Lead = {
  id: string;
  branch_id: string;
  full_name: string;
  phone: string;
  alternative_phone: string | null;
  complaint: string | null;
  source: string;
  platform: string | null;
  campaign_name: string | null;
  stage_id: string | null;
  assigned_to: string | null;
  priority: LeadPriority;
  lead_score: number;
  last_activity_at: string | null;
  next_followup_at: string | null;
  number_of_calls: number;
  number_of_whatsapp_messages: number;
  patient_id: string | null;
  appointment_id: string | null;
  created_at: string;
  stage?: Stage | null;
};

type Staff = { id: string; full_name: string | null; full_name_en: string | null; full_name_ar: string | null };

type NewLead = {
  full_name: string;
  phone: string;
  complaint: string;
  source: string;
  priority: LeadPriority;
  next_followup_at: string;
};

const INITIAL_FORM: NewLead = { full_name: "", phone: "", complaint: "", source: "manual", priority: "medium", next_followup_at: "" };

function stageName(stage: Stage, lang: "ar" | "en") {
  return lang === "ar" ? stage.name_ar || stage.name_en : stage.name_en || stage.name_ar;
}

function formatWhen(value: string | null, lang: "ar" | "en") {
  if (!value) return lang === "ar" ? "لا يوجد" : "None";
  return new Date(value).toLocaleString(lang === "ar" ? "ar-EG" : "en-EG", { dateStyle: "short", timeStyle: "short" });
}

function normalizePhone(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.startsWith("0") ? `2${digits}` : digits;
}

const priorityClass: Record<LeadPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgent: "bg-destructive/15 text-destructive",
};

export default function Leads() {
  const { lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const { authz } = useAuthorization();
  const navigate = useNavigate();
  const isArabic = lang === "ar";
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState<NewLead>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const canCreate = authz.can("leads.create");
  const canEdit = authz.can("leads.edit");

  const load = async () => {
    if (!currentBranchId) {
      setStages([]);
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [stageRes, leadRes, staffRes] = await Promise.all([
      supabase.from("lead_pipeline_stages").select("id,slug,name_en,name_ar,position,color,is_closed").or(`branch_id.eq.${currentBranchId},branch_id.is.null`).eq("is_active", true).order("position").limit(30),
      supabase.from("leads").select("id,branch_id,full_name,phone,alternative_phone,complaint,source,platform,campaign_name,stage_id,assigned_to,priority,lead_score,last_activity_at,next_followup_at,number_of_calls,number_of_whatsapp_messages,patient_id,appointment_id,created_at").eq("branch_id", currentBranchId).is("deleted_at", null).order("created_at", { ascending: false }).limit(300),
      supabase.from("profiles").select("id,full_name,full_name_en,full_name_ar").limit(100),
    ]);
    if (stageRes.error) toast.error(stageRes.error.message);
    if (leadRes.error) toast.error(leadRes.error.message);
    const nextStages = (stageRes.data ?? []) as Stage[];
    const nextLeads = (leadRes.data ?? []) as Lead[];
    const byStage = new Map(nextStages.map((stage) => [stage.id, stage]));
    setStages(nextStages);
    setLeads(nextLeads.map((lead) => ({ ...lead, stage: lead.stage_id ? byStage.get(lead.stage_id) ?? null : null })));
    setStaff((staffRes.data ?? []) as Staff[]);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [currentBranchId]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch = !query || [lead.full_name, lead.phone, lead.complaint, lead.source, lead.campaign_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
      const matchesStage = stageFilter === "all" || lead.stage_id === stageFilter;
      const matchesPriority = priorityFilter === "all" || lead.priority === priorityFilter;
      return matchesSearch && matchesStage && matchesPriority;
    });
  }, [leads, search, stageFilter, priorityFilter]);

  const stats = useMemo(() => {
    const today = new Date();
    const dayKey = today.toDateString();
    return {
      newToday: leads.filter((lead) => new Date(lead.created_at).toDateString() === dayKey).length,
      followupsToday: leads.filter((lead) => lead.next_followup_at && new Date(lead.next_followup_at).toDateString() === dayKey).length,
      overdue: leads.filter((lead) => lead.next_followup_at && new Date(lead.next_followup_at).getTime() < Date.now()).length,
      unassigned: leads.filter((lead) => !lead.assigned_to).length,
      booked: leads.filter((lead) => Boolean(lead.appointment_id)).length,
    };
  }, [leads]);

  const grouped = useMemo(() => stages.map((stage) => ({ stage, leads: filteredLeads.filter((lead) => lead.stage_id === stage.id) })), [stages, filteredLeads]);
  const uncategorized = filteredLeads.filter((lead) => !lead.stage_id || !stages.some((stage) => stage.id === lead.stage_id));

  const updateForm = (key: keyof NewLead, value: string) => setForm((current) => ({ ...current, [key]: value } as NewLead));

  const createLead = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentBranchId || !form.full_name.trim() || !form.phone.trim()) {
      toast.error(isArabic ? "اكتب الاسم ورقم الهاتف" : "Enter the name and phone number");
      return;
    }
    const defaultStage = stages.find((stage) => stage.slug === "new-lead") ?? stages[0];
    setSaving(true);
    const { data, error } = await supabase.from("leads").insert({
      branch_id: currentBranchId,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      phone_normalized: normalizePhone(form.phone),
      complaint: form.complaint.trim() || null,
      source: form.source || "manual",
      stage_id: defaultStage?.id ?? null,
      priority: form.priority,
      next_followup_at: form.next_followup_at ? new Date(form.next_followup_at).toISOString() : null,
      assigned_to: user?.id ?? null,
      created_by: user?.id ?? null,
      last_activity_at: new Date().toISOString(),
    }).select("id").single();
    if (!error && data) {
      await supabase.from("lead_activities").insert({ lead_id: data.id, branch_id: currentBranchId, activity_type: "lead_created", channel: "manual", body: form.complaint.trim() || null, created_by: user?.id ?? null });
      toast.success(isArabic ? "تم إنشاء العميل المحتمل" : "Lead created");
      setForm(INITIAL_FORM);
      setNewOpen(false);
      await load();
    } else if (error) {
      toast.error(error.message);
    }
    setSaving(false);
  };

  const moveLead = async (lead: Lead, stageId: string) => {
    if (!canEdit || lead.stage_id === stageId) return;
    const nextStage = stages.find((stage) => stage.id === stageId);
    if (!nextStage) return;
    const patch: Record<string, unknown> = { stage_id: stageId, last_activity_at: new Date().toISOString() };
    if (nextStage.slug === "lost-lead") {
      toast.message(isArabic ? "اختر سبب الخسارة من صفحة العميل المحتمل" : "Choose a lost reason on the lead details page");
      navigate(`/leads/${lead.id}`);
      return;
    }
    const { error } = await supabase.from("leads").update(patch).eq("id", lead.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("lead_activities").insert({ lead_id: lead.id, branch_id: lead.branch_id, activity_type: "stage_changed", channel: "crm", body: `${lead.stage?.name_en ?? "Lead"} → ${nextStage.name_en}`, created_by: user?.id ?? null, metadata: { from_stage_id: lead.stage_id, to_stage_id: stageId } });
    toast.success(isArabic ? "تم تحديث المرحلة" : "Stage updated");
    await load();
  };

  const markFollowupDone = async (lead: Lead) => {
    if (!canEdit) return;
    const { error } = await supabase.from("lead_followups").update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id ?? null }).eq("lead_id", lead.id).eq("status", "pending");
    if (error) toast.error(error.message);
    else { toast.success(isArabic ? "تم إنهاء المتابعة" : "Follow-up completed"); await load(); }
  };

  const staffName = (id: string | null) => {
    if (!id) return isArabic ? "غير مسند" : "Unassigned";
    const item = staff.find((person) => person.id === id);
    return item ? (isArabic ? item.full_name_ar || item.full_name || item.full_name_en : item.full_name_en || item.full_name || item.full_name_ar) : id.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-primary"><Target className="size-4" />{isArabic ? "إدارة العملاء المحتملين" : "Lead CRM"}</div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{isArabic ? "لوحة الاستقبال" : "Reception dashboard"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{isArabic ? "كل عميل محتمل في مكان واحد، من أول تواصل حتى حجز الموعد." : "Every lead in one place, from first contact to booked appointment."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/leads/analytics")} className="gap-2"><TrendingUp className="size-4" />{isArabic ? "التحليلات وKPI" : "Analytics & KPI"}</Button>
          {canCreate ? <Button onClick={() => setNewOpen(true)} className="gap-2"><Plus className="size-4" />{isArabic ? "عميل محتمل جديد" : "New lead"}</Button> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          [UsersRound, isArabic ? "جديد اليوم" : "New today", stats.newToday, "text-primary"],
          [Clock3, isArabic ? "متابعات اليوم" : "Today's follow-ups", stats.followupsToday, "text-blue-600"],
          [XCircle, isArabic ? "متأخرة" : "Overdue", stats.overdue, "text-destructive"],
          [UserRound, isArabic ? "غير مسند" : "Unassigned", stats.unassigned, "text-amber-600"],
          [CalendarPlus, isArabic ? "حجوزات" : "Booked", stats.booked, "text-emerald-600"],
        ].map(([Icon, label, value, color]) => {
          const StatIcon = Icon as typeof Target;
          return <Card key={String(label)} className="border-border/70 p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><StatIcon className={cn("size-4", String(color))} /></div><p className="mt-2 text-2xl font-bold">{value}</p></Card>;
        })}
      </div>

      <Card className="border-border/70 p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1"><Search className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input className="ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isArabic ? "ابحث بالاسم أو الهاتف أو المصدر…" : "Search by name, phone, or source…"} /></div>
          <div className="flex items-center gap-2"><Filter className="size-4 text-muted-foreground" /><Select value={stageFilter} onValueChange={setStageFilter}><SelectTrigger className="w-[180px]"><SelectValue placeholder={isArabic ? "كل المراحل" : "All stages"} /></SelectTrigger><SelectContent><SelectItem value="all">{isArabic ? "كل المراحل" : "All stages"}</SelectItem>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stageName(stage, lang)}</SelectItem>)}</SelectContent></Select><Select value={priorityFilter} onValueChange={setPriorityFilter}><SelectTrigger className="w-[140px]"><SelectValue placeholder={isArabic ? "كل الأولويات" : "All priorities"} /></SelectTrigger><SelectContent><SelectItem value="all">{isArabic ? "كل الأولويات" : "All priorities"}</SelectItem>{(["urgent", "high", "medium", "low"] as LeadPriority[]).map((priority) => <SelectItem key={priority} value={priority}>{priorityLabel(priority, lang)}</SelectItem>)}</SelectContent></Select></div>
        </div>
      </Card>

      {loading ? <Card className="p-10 text-center text-sm text-muted-foreground">{isArabic ? "جارٍ تحميل العملاء المحتملين…" : "Loading leads…"}</Card> : null}
      {!loading && !currentBranchId ? <Card className="p-10 text-center text-sm text-muted-foreground">{isArabic ? "اختر فرعًا لعرض الـCRM" : "Choose a branch to view CRM"}</Card> : null}
      {!loading && currentBranchId ? <div className="grid gap-4 xl:grid-cols-4">
        {grouped.map(({ stage, leads: stageLeads }) => <Card key={stage.id} className="min-h-[300px] border-border/70 bg-muted/20 p-3 shadow-sm"><div className="mb-3 flex items-center justify-between gap-2 border-b pb-3"><div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: stage.color }} /><h2 className="text-sm font-bold">{stageName(stage, lang)}</h2></div><Badge variant="secondary">{stageLeads.length}</Badge></div><div className="space-y-3">{stageLeads.map((lead) => <LeadCard key={lead.id} lead={lead} lang={lang} staffName={staffName} onOpen={() => navigate(`/leads/${lead.id}`)} onMove={moveLead} stages={stages} onDone={markFollowupDone} />)}</div></Card>)}
        {uncategorized.length ? <Card className="min-h-[300px] border-dashed p-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">{isArabic ? "غير مصنف" : "Uncategorized"}</h2><Badge variant="secondary">{uncategorized.length}</Badge></div><div className="space-y-3">{uncategorized.map((lead) => <LeadCard key={lead.id} lead={lead} lang={lang} staffName={staffName} onOpen={() => navigate(`/leads/${lead.id}`)} onMove={moveLead} stages={stages} onDone={markFollowupDone} />)}</div></Card> : null}
      </div> : null}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader><DialogTitle>{isArabic ? "إضافة عميل محتمل" : "Add lead"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={createLead}>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="lead-name">{isArabic ? "الاسم" : "Name"}</Label><Input id="lead-name" value={form.full_name} onChange={(event) => updateForm("full_name", event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="lead-phone">{isArabic ? "الهاتف" : "Phone"}</Label><Input id="lead-phone" value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} required /></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="lead-source">{isArabic ? "المصدر" : "Source"}</Label><Select value={form.source} onValueChange={(value) => updateForm("source", value)}><SelectTrigger id="lead-source"><SelectValue /></SelectTrigger><SelectContent>{["manual", "facebook", "instagram", "whatsapp", "phone", "referral", "public_booking"].map((source) => <SelectItem key={source} value={source}>{sourceLabel(source, lang)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="lead-priority">{isArabic ? "الأولوية" : "Priority"}</Label><Select value={form.priority} onValueChange={(value) => updateForm("priority", value as LeadPriority)}><SelectTrigger id="lead-priority"><SelectValue /></SelectTrigger><SelectContent>{(["urgent", "high", "medium", "low"] as LeadPriority[]).map((priority) => <SelectItem key={priority} value={priority}>{priorityLabel(priority, lang)}</SelectItem>)}</SelectContent></Select></div></div>
            <div className="space-y-2"><Label htmlFor="lead-followup">{isArabic ? "موعد المتابعة (اختياري)" : "Next follow-up (optional)"}</Label><Input id="lead-followup" type="datetime-local" value={form.next_followup_at} onChange={(event) => updateForm("next_followup_at", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="lead-complaint">{isArabic ? "الشكوى أو الملاحظات" : "Complaint or notes"}</Label><Textarea id="lead-complaint" value={form.complaint} onChange={(event) => updateForm("complaint", event.target.value)} rows={3} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setNewOpen(false)}>{isArabic ? "إلغاء" : "Cancel"}</Button><Button type="submit" disabled={saving}>{saving ? (isArabic ? "جارٍ الحفظ…" : "Saving…") : (isArabic ? "حفظ العميل المحتمل" : "Save lead")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function priorityLabel(value: LeadPriority, lang: "ar" | "en") {
  if (lang === "ar") return { urgent: "عاجلة", high: "عالية", medium: "متوسطة", low: "منخفضة" }[value];
  return { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" }[value];
}

function sourceLabel(value: string, lang: "ar" | "en") {
  if (lang === "ar") return { manual: "إدخال يدوي", facebook: "Facebook", instagram: "Instagram", whatsapp: "WhatsApp", phone: "مكالمة", referral: "إحالة", public_booking: "الحجز العام" }[value] || value;
  return { manual: "Manual", facebook: "Facebook", instagram: "Instagram", whatsapp: "WhatsApp", phone: "Phone", referral: "Referral", public_booking: "Public booking" }[value] || value;
}

function LeadCard({ lead, lang, staffName, onOpen, onMove, stages, onDone }: { lead: Lead; lang: "ar" | "en"; staffName: (id: string | null) => string; onOpen: () => void; onMove: (lead: Lead, stageId: string) => Promise<void>; stages: Stage[]; onDone: (lead: Lead) => Promise<void> }) {
  const isArabic = lang === "ar";
  const overdue = lead.next_followup_at ? new Date(lead.next_followup_at).getTime() < Date.now() : false;
  return <article className="group rounded-xl border bg-background p-3 shadow-sm transition-shadow hover:shadow-md"><button type="button" className="w-full text-start" onClick={onOpen}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold">{lead.full_name}</h3><p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><Phone className="size-3" />{lead.phone}</p></div><Badge className={cn("shrink-0 border-0 text-[10px]", priorityClass[lead.priority])}>{priorityLabel(lead.priority, lang)}</Badge></div><p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{lead.complaint || (isArabic ? "لا توجد ملاحظات بعد" : "No notes yet")}</p><div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground"><span className="rounded bg-muted px-2 py-1">{sourceLabel(lead.source, lang)}</span><span className="rounded bg-muted px-2 py-1">{isArabic ? `درجة ${lead.lead_score}` : `Score ${lead.lead_score}`}</span></div></button><div className="mt-3 flex items-center justify-between border-t pt-2 text-[10px] text-muted-foreground"><span className={cn("flex items-center gap-1", overdue && "font-semibold text-destructive")}><Clock3 className="size-3" />{formatWhen(lead.next_followup_at, lang)}</span><span>{staffName(lead.assigned_to)}</span></div><div className="mt-2 flex items-center gap-1"><a className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" href={`tel:${lead.phone}`} aria-label={isArabic ? "اتصال" : "Call"} onClick={(event) => event.stopPropagation()}><Phone className="size-3.5" /></a><a className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" onClick={(event) => event.stopPropagation()}><MessageCircle className="size-3.5" /></a>{lead.next_followup_at ? <Button type="button" variant="ghost" size="sm" className="ms-auto h-8 px-2 text-[11px]" onClick={() => void onDone(lead)}><CheckCircle2 className="me-1 size-3.5" />{isArabic ? "تمت" : "Done"}</Button> : null}<select value={lead.stage_id ?? ""} onChange={(event) => void onMove(lead, event.target.value)} className="h-8 max-w-[110px] rounded-md border bg-background px-2 text-[10px]" aria-label={isArabic ? "تغيير المرحلة" : "Change stage"}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stageName(stage, lang)}</option>)}</select></div></article>;
}
