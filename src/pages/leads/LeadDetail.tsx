import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, MessageCircle, Phone, Save, UserRound, XCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Stage = { id: string; slug: string; name_en: string; name_ar: string; position: number; color: string; is_closed: boolean };
type Reason = { id: string; name_en: string; name_ar: string };
type Lead = { id: string; branch_id: string; full_name: string; phone: string; alternative_phone: string | null; complaint: string | null; pain_area: string | null; medical_notes: string | null; source: string; platform: string | null; campaign_name: string | null; campaign_id: string | null; ad_set: string | null; ad_name: string | null; stage_id: string | null; assigned_to: string | null; priority: "low" | "medium" | "high" | "urgent"; lead_score: number; next_followup_at: string | null; last_contact_method: string | null; last_contact_at: string | null; number_of_calls: number; number_of_whatsapp_messages: number; patient_id: string | null; appointment_id: string | null; lost_reason_id: string | null; lost_notes: string | null; created_at: string; updated_at: string };
type Activity = { id: string; activity_type: string; channel: string | null; body: string | null; occurred_at: string; created_by: string | null };
type Followup = { id: string; due_at: string; channel: string; status: string; source_rule: string | null; notes: string | null };

function localized(stage: Stage | Reason, lang: "ar" | "en") { return lang === "ar" ? stage.name_ar || stage.name_en : stage.name_en || stage.name_ar; }
function formatDate(value: string | null, lang: "ar" | "en") { return value ? new Date(value).toLocaleString(lang === "ar" ? "ar-EG" : "en-EG", { dateStyle: "medium", timeStyle: "short" }) : "—"; }
function priorityLabel(value: Lead["priority"], lang: "ar" | "en") { return lang === "ar" ? ({ urgent: "عاجلة", high: "عالية", medium: "متوسطة", low: "منخفضة" }[value]) : ({ urgent: "Urgent", high: "High", medium: "Medium", low: "Low" }[value]); }

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const { user } = useAuth();
  const { authz } = useAuthorization();
  const isArabic = lang === "ar";
  const [lead, setLead] = useState<Lead | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [activityType, setActivityType] = useState("note");
  const [followupAt, setFollowupAt] = useState("");
  const [followupChannel, setFollowupChannel] = useState("call");
  const [lostReasonId, setLostReasonId] = useState("");
  const [lostNotes, setLostNotes] = useState("");

  const canEdit = authz.can("leads.edit");
  const currentStage = useMemo(() => stages.find((stage) => stage.id === lead?.stage_id) ?? null, [stages, lead?.stage_id]);
  const lostStage = useMemo(() => stages.find((stage) => stage.slug === "lost-lead") ?? null, [stages]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const leadRes = await supabase.from("leads").select("*").eq("id", id).is("deleted_at", null).single();
    if (leadRes.error || !leadRes.data) {
      toast.error(leadRes.error?.message || (isArabic ? "العميل المحتمل غير موجود" : "Lead not found"));
      navigate("/leads");
      return;
    }
    const branchId = leadRes.data.branch_id as string;
    const [stageRes, reasonRes, activityRes, followupRes] = await Promise.all([
      supabase.from("lead_pipeline_stages").select("id,slug,name_en,name_ar,position,color,is_closed").or(`branch_id.eq.${branchId},branch_id.is.null`).eq("is_active", true).order("position").limit(30),
      supabase.from("lead_lost_reasons").select("id,name_en,name_ar").or(`branch_id.eq.${branchId},branch_id.is.null`).eq("is_active", true).order("position").limit(30),
      supabase.from("lead_activities").select("id,activity_type,channel,body,occurred_at,created_by").eq("lead_id", id).order("occurred_at", { ascending: false }).limit(200),
      supabase.from("lead_followups").select("id,due_at,channel,status,source_rule,notes").eq("lead_id", id).order("due_at", { ascending: false }).limit(50),
    ]);
    setLead(leadRes.data as Lead);
    setStages((stageRes.data ?? []) as Stage[]);
    setReasons((reasonRes.data ?? []) as Reason[]);
    setActivities((activityRes.data ?? []) as Activity[]);
    setFollowups((followupRes.data ?? []) as Followup[]);
    setLostReasonId((leadRes.data as Lead).lost_reason_id ?? "");
    setLostNotes((leadRes.data as Lead).lost_notes ?? "");
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [id]);

  const patchLead = async (patch: Record<string, unknown>) => {
    if (!lead || !canEdit) return false;
    setSaving(true);
    const { data, error } = await supabase.from("leads").update(patch).eq("id", lead.id).select("*").single();
    setSaving(false);
    if (error) { toast.error(error.message); return false; }
    setLead(data as Lead);
    return true;
  };

  const addActivity = async (type = activityType, body = note) => {
    if (!lead || !body.trim() || !canEdit) return;
    const { error } = await supabase.from("lead_activities").insert({ lead_id: lead.id, branch_id: lead.branch_id, activity_type: type, channel: type === "whatsapp_sent" ? "whatsapp" : type === "call_attempt" ? "phone" : "crm", body: body.trim(), created_by: user?.id ?? null });
    if (error) { toast.error(error.message); return; }
    const contactPatch = type === "call_attempt" ? { number_of_calls: lead.number_of_calls + 1, last_contact_method: "call", last_contact_at: new Date().toISOString() } : type === "whatsapp_sent" ? { number_of_whatsapp_messages: lead.number_of_whatsapp_messages + 1, last_contact_method: "whatsapp", last_contact_at: new Date().toISOString() } : { last_activity_at: new Date().toISOString() };
    await patchLead({ ...contactPatch, last_activity_at: new Date().toISOString() });
    setNote("");
    toast.success(isArabic ? "تم تسجيل النشاط" : "Activity logged");
    await load();
  };

  const changeStage = async (stageId: string) => {
    if (!lead || !canEdit) return;
    const stage = stages.find((item) => item.id === stageId);
    if (!stage) return;
    if (stage.slug === "lost-lead") {
      if (!lostReasonId) { toast.error(isArabic ? "سبب الخسارة إجباري" : "Lost reason is required"); return; }
      await patchLead({ stage_id: stage.id, lost_reason_id: lostReasonId, lost_notes: lostNotes.trim() || null, last_activity_at: new Date().toISOString() });
      await supabase.from("lead_activities").insert({ lead_id: lead.id, branch_id: lead.branch_id, activity_type: "marked_lost", channel: "crm", body: lostNotes.trim() || "Lost lead", created_by: user?.id ?? null, metadata: { reason_id: lostReasonId } });
    } else {
      await patchLead({ stage_id: stage.id, last_activity_at: new Date().toISOString() });
      await supabase.from("lead_activities").insert({ lead_id: lead.id, branch_id: lead.branch_id, activity_type: "stage_changed", channel: "crm", body: stage.name_en, created_by: user?.id ?? null, metadata: { stage_id: stage.id } });
    }
    await load();
  };

  const scheduleFollowup = async () => {
    if (!lead || !followupAt || !canEdit) return;
    const due = new Date(followupAt).toISOString();
    const { error } = await supabase.from("lead_followups").insert({ lead_id: lead.id, branch_id: lead.branch_id, assigned_to: lead.assigned_to ?? user?.id ?? null, due_at: due, channel: followupChannel, status: "pending", source_rule: "manual", created_by: user?.id ?? null });
    if (error) { toast.error(error.message); return; }
    await patchLead({ next_followup_at: due, last_activity_at: new Date().toISOString() });
    await supabase.from("lead_activities").insert({ lead_id: lead.id, branch_id: lead.branch_id, activity_type: "followup_scheduled", channel: followupChannel, body: due, created_by: user?.id ?? null });
    setFollowupAt("");
    toast.success(isArabic ? "تم جدولة المتابعة" : "Follow-up scheduled");
    await load();
  };

  if (loading || !lead) return <Card className="p-10 text-center text-sm text-muted-foreground">{isArabic ? "جارٍ تحميل التفاصيل…" : "Loading details…"}</Card>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => navigate("/leads")} aria-label={isArabic ? "رجوع" : "Back"}><ArrowLeft className="size-4 rtl:rotate-180" /></Button><div><div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="outline">{currentStage ? localized(currentStage, lang) : (isArabic ? "بدون مرحلة" : "No stage")}</Badge><Badge className="border-0">{priorityLabel(lead.priority, lang)}</Badge><span className="text-xs text-muted-foreground">{isArabic ? `درجة ${lead.lead_score}` : `Score ${lead.lead_score}`}</span></div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{lead.full_name}</h1><p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Phone className="size-4" />{lead.phone}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><a href={`tel:${lead.phone}`}><Phone className="me-2 size-4" />{isArabic ? "اتصال" : "Call"}</a></Button><Button variant="outline" asChild><a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle className="me-2 size-4" />WhatsApp</a></Button>{lead.appointment_id ? <Button variant="outline" onClick={() => navigate(`/appointments/${lead.appointment_id}`)}><CalendarClock className="me-2 size-4" />{isArabic ? "فتح الموعد" : "Open appointment"}</Button> : null}</div></div>

    <div className="grid gap-4 md:grid-cols-4"><Card className="p-4"><p className="text-xs text-muted-foreground">{isArabic ? "المصدر" : "Source"}</p><p className="mt-1 font-semibold">{lead.source}{lead.campaign_name ? ` · ${lead.campaign_name}` : ""}</p></Card><Card className="p-4"><p className="text-xs text-muted-foreground">{isArabic ? "آخر تواصل" : "Last contact"}</p><p className="mt-1 font-semibold">{formatDate(lead.last_contact_at, lang)}</p></Card><Card className="p-4"><p className="text-xs text-muted-foreground">{isArabic ? "المتابعة القادمة" : "Next follow-up"}</p><p className={cn("mt-1 font-semibold", lead.next_followup_at && new Date(lead.next_followup_at).getTime() < Date.now() && "text-destructive")}>{formatDate(lead.next_followup_at, lang)}</p></Card><Card className="p-4"><p className="text-xs text-muted-foreground">{isArabic ? "التواصل" : "Contact count"}</p><p className="mt-1 font-semibold">{lead.number_of_calls} {isArabic ? "مكالمات" : "calls"} · {lead.number_of_whatsapp_messages} WhatsApp</p></Card></div>

    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">{isArabic ? "تحديث المرحلة" : "Update stage"}</h2><p className="text-xs text-muted-foreground">{isArabic ? "لا يمكن إغلاق العميل المحتمل دون سبب واضح." : "A lead cannot be closed without a clear reason."}</p></div><Select value={lead.stage_id ?? ""} onValueChange={(value) => void changeStage(value)} disabled={!canEdit}><SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger><SelectContent>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{localized(stage, lang)}</SelectItem>)}</SelectContent></Select></div>{currentStage?.slug === "lost-lead" || lead.stage_id === lostStage?.id ? <div className="grid gap-4 border-t pt-4 sm:grid-cols-2"><div className="space-y-2"><Label>{isArabic ? "سبب الخسارة" : "Lost reason"}</Label><Select value={lostReasonId} onValueChange={setLostReasonId} disabled={!canEdit}><SelectTrigger><SelectValue placeholder={isArabic ? "اختر السبب" : "Choose reason"} /></SelectTrigger><SelectContent>{reasons.map((reason) => <SelectItem key={reason.id} value={reason.id}>{localized(reason, lang)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>{isArabic ? "ملاحظات" : "Notes"}</Label><Input value={lostNotes} onChange={(event) => setLostNotes(event.target.value)} disabled={!canEdit} /></div><Button className="sm:col-span-2" disabled={!canEdit || !lostReasonId || saving} onClick={() => void changeStage(lostStage?.id ?? lead.stage_id ?? "")}><Save className="me-2 size-4" />{isArabic ? "حفظ سبب الخسارة" : "Save lost reason"}</Button></div> : null}</Card>

        <Card className="p-5"><div className="mb-4"><h2 className="font-bold">{isArabic ? "تسجيل نشاط" : "Log activity"}</h2><p className="text-xs text-muted-foreground">{isArabic ? "كل تواصل يظهر في الـTimeline ولا يختفي." : "Every interaction stays in the timeline."}</p></div><div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]"><Select value={activityType} onValueChange={setActivityType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="note">{isArabic ? "ملاحظة" : "Note"}</SelectItem><SelectItem value="call_attempt">{isArabic ? "محاولة اتصال" : "Call attempt"}</SelectItem><SelectItem value="whatsapp_sent">WhatsApp</SelectItem><SelectItem value="no_answer">{isArabic ? "لا يوجد رد" : "No answer"}</SelectItem><SelectItem value="appointment_booked">{isArabic ? "تم حجز موعد" : "Appointment booked"}</SelectItem></SelectContent></Select><Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder={isArabic ? "اكتب ما حدث…" : "Describe what happened…"} /><Button onClick={() => void addActivity()} disabled={!canEdit || !note.trim()}><Save className="me-2 size-4" />{isArabic ? "تسجيل" : "Log"}</Button></div></Card>

        <Card className="p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">{isArabic ? "Timeline" : "Activity timeline"}</h2><p className="text-xs text-muted-foreground">{activities.length} {isArabic ? "نشاط مسجل" : "logged activities"}</p></div><Clock3 className="size-5 text-primary" /></div>{activities.length ? <div className="relative space-y-5 before:absolute before:bottom-1 before:start-[7px] before:top-1 before:w-px before:bg-border">{activities.map((activity) => <div key={activity.id} className="relative flex gap-4"><span className="z-10 mt-1 size-4 shrink-0 rounded-full border-4 border-background bg-primary" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{activityLabel(activity.activity_type, lang)}</p><span className="text-xs text-muted-foreground">{formatDate(activity.occurred_at, lang)}</span></div>{activity.body ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{activity.body}</p> : null}</div></div>)}</div> : <p className="text-sm text-muted-foreground">{isArabic ? "لا توجد أنشطة بعد." : "No activities yet."}</p>}</Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5"><h2 className="font-bold">{isArabic ? "جدولة متابعة" : "Schedule follow-up"}</h2><div className="mt-4 space-y-3"><div className="space-y-2"><Label>{isArabic ? "التاريخ والوقت" : "Date and time"}</Label><Input type="datetime-local" value={followupAt} onChange={(event) => setFollowupAt(event.target.value)} /></div><div className="space-y-2"><Label>{isArabic ? "القناة" : "Channel"}</Label><Select value={followupChannel} onValueChange={setFollowupChannel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="call">{isArabic ? "مكالمة" : "Call"}</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent></Select></div><Button className="w-full" onClick={() => void scheduleFollowup()} disabled={!canEdit || !followupAt}><CalendarClock className="me-2 size-4" />{isArabic ? "جدولة المتابعة" : "Schedule"}</Button></div></Card>
        <Card className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">{isArabic ? "المتابعات" : "Follow-ups"}</h2><Badge variant="secondary">{followups.filter((item) => item.status === "pending").length}</Badge></div><div className="space-y-3">{followups.length ? followups.map((item) => <div key={item.id} className={cn("rounded-lg border p-3", item.status === "pending" && new Date(item.due_at).getTime() < Date.now() && "border-destructive/40 bg-destructive/5")}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{formatDate(item.due_at, lang)}</span><Badge variant={item.status === "completed" ? "secondary" : "outline"}>{item.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.channel}{item.source_rule ? ` · ${item.source_rule}` : ""}</p></div>) : <p className="text-sm text-muted-foreground">{isArabic ? "لا توجد متابعة مجدولة." : "No follow-ups scheduled."}</p>}</div></Card>
        <Card className="p-5"><h2 className="font-bold">{isArabic ? "البيانات الطبية والتسويقية" : "Medical & marketing details"}</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">{isArabic ? "الشكوى" : "Complaint"}</dt><dd className="mt-1">{lead.complaint || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">{isArabic ? "منصة المصدر" : "Platform"}</dt><dd className="mt-1">{lead.platform || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">{isArabic ? "الحملة" : "Campaign"}</dt><dd className="mt-1">{lead.campaign_name || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">{isArabic ? "تاريخ الإنشاء" : "Created"}</dt><dd className="mt-1">{formatDate(lead.created_at, lang)}</dd></div></dl></Card>
      </div>
    </div>
  </div>;
}

function activityLabel(value: string, lang: "ar" | "en") {
  if (lang === "ar") return ({ lead_created: "تم إنشاء العميل المحتمل", stage_changed: "تم تغيير المرحلة", call_attempt: "محاولة اتصال", whatsapp_sent: "تم إرسال WhatsApp", no_answer: "لا يوجد رد", appointment_booked: "تم حجز موعد", followup_scheduled: "تمت جدولة متابعة", marked_lost: "تم تسجيل العميل كخاسر", note: "ملاحظة" }[value]) || value;
  return ({ lead_created: "Lead created", stage_changed: "Stage changed", call_attempt: "Call attempt", whatsapp_sent: "WhatsApp sent", no_answer: "No answer", appointment_booked: "Appointment booked", followup_scheduled: "Follow-up scheduled", marked_lost: "Marked as lost", note: "Note" }[value]) || value;
}
