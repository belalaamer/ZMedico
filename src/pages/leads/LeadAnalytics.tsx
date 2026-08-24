import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CalendarCheck, Clock3, Download, Info, PhoneCall, RefreshCw, Target, TrendingUp, UserCheck, UserX, Users, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RangeKey = "7" | "30" | "90";
type Summary = {
  leads: number;
  contacted: number;
  booked: number;
  started: number;
  lost: number;
  unassigned: number;
  followups_due: number;
  followups_overdue: number;
  booking_conversion_rate: number | null;
  treatment_conversion_rate: number | null;
  lost_rate: number | null;
  first_contact_rate: number | null;
  avg_response_minutes: number | null;
};
type SourceRow = { source: string; leads: number; contacted: number; booked: number; started: number; lost: number };
type CampaignRow = { campaign: string; source: string; leads: number; booked: number; started: number; lost: number };
type TrendRow = { day: string; leads: number; booked: number; started: number; lost: number };
type AssigneeRow = { assignee_id: string; assigned_leads: number; contacted: number; booked: number; started: number; lost: number; avg_response_minutes: number | null };
type AnalyticsResponse = { summary: Summary; sources: SourceRow[]; campaigns: CampaignRow[]; trend: TrendRow[]; assignees: AssigneeRow[] };
type Staff = { id: string; full_name: string | null; full_name_en: string | null; full_name_ar: string | null };

const EMPTY_SUMMARY: Summary = { leads: 0, contacted: 0, booked: 0, started: 0, lost: 0, unassigned: 0, followups_due: 0, followups_overdue: 0, booking_conversion_rate: null, treatment_conversion_rate: null, lost_rate: null, first_contact_rate: null, avg_response_minutes: null };

function dateRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function percent(value: number | null, lang: "ar" | "en") {
  if (value === null || Number.isNaN(value)) return lang === "ar" ? "لا توجد بيانات" : "N/A";
  return `${value.toFixed(1)}%`;
}

function minutes(value: number | null, lang: "ar" | "en") {
  if (value === null || Number.isNaN(value)) return lang === "ar" ? "لا توجد بيانات" : "N/A";
  if (value < 60) return `${Math.round(value)} ${lang === "ar" ? "د" : "min"}`;
  return `${(value / 60).toFixed(1)} ${lang === "ar" ? "س" : "h"}`;
}

function labelSource(value: string, lang: "ar" | "en") {
  const labels: Record<string, [string, string]> = {
    manual: ["إدخال يدوي", "Manual"],
    facebook: ["Facebook", "Facebook"],
    instagram: ["Instagram", "Instagram"],
    whatsapp: ["WhatsApp", "WhatsApp"],
    phone: ["مكالمة", "Phone"],
    referral: ["إحالة", "Referral"],
    public_booking: ["الحجز العام", "Public booking"],
    not_set: ["غير محدد", "Not set"],
  };
  return labels[value]?.[lang === "ar" ? 0 : 1] ?? value;
}

export default function LeadAnalytics() {
  const { lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { authz } = useAuthorization();
  const navigate = useNavigate();
  const isArabic = lang === "ar";
  const [range, setRange] = useState<RangeKey>("30");
  const [data, setData] = useState<AnalyticsResponse>({ summary: EMPTY_SUMMARY, sources: [], campaigns: [], trend: [], assignees: [] });
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(false);

  const load = useCallback(async () => {
    if (!currentBranchId) {
      setData({ summary: EMPTY_SUMMARY, sources: [], campaigns: [], trend: [], assignees: [] });
      setAnalyticsError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setAnalyticsError(false);
    const period = dateRange(Number(range));
    const [analyticsResponse, staffResponse] = await Promise.all([
      supabase.rpc("get_lead_analytics", { p_branch_id: currentBranchId, p_start_at: period.start.toISOString(), p_end_at: period.end.toISOString() }) as unknown as Promise<{ data: AnalyticsResponse | null; error: { message: string } | null }>,
      supabase.from("profiles").select("id,full_name,full_name_en,full_name_ar").limit(100),
    ]);
    if (analyticsResponse.error) {
      setAnalyticsError(true);
      setData({ summary: EMPTY_SUMMARY, sources: [], campaigns: [], trend: [], assignees: [] });
      toast.error(isArabic ? "تعذر تحميل تحليلات العملاء المحتملين. اضغط تحديث للمحاولة مرة أخرى." : "Lead analytics could not be loaded. Press Refresh to try again.");
      if (import.meta.env.DEV) console.error("[LeadAnalytics] RPC failed", analyticsResponse.error.message);
    } else {
      setData(analyticsResponse.data ?? { summary: EMPTY_SUMMARY, sources: [], campaigns: [], trend: [], assignees: [] });
    }
    setStaff((staffResponse.data ?? []) as Staff[]);
    setLoading(false);
  }, [currentBranchId, isArabic, range]);

  useEffect(() => { void load(); }, [load]);

  const summary = data.summary;
  const maxSourceLeads = Math.max(...data.sources.map((row) => row.leads), 1);
  const maxTrendLeads = Math.max(...data.trend.map((row) => row.leads), 1);
  const maxCampaignRows = 8;
  const topCampaigns = data.campaigns.slice(0, maxCampaignRows);

  const staffName = useMemo(() => new Map(staff.map((person) => [person.id, isArabic ? person.full_name_ar || person.full_name || person.full_name_en : person.full_name_en || person.full_name || person.full_name_ar])), [isArabic, staff]);

  const cards = [
    { label: isArabic ? "العملاء المحتملون" : "Leads", value: summary.leads, icon: Users, color: "text-primary" },
    { label: isArabic ? "تم التواصل" : "Contacted", value: summary.contacted, suffix: percent(summary.first_contact_rate, lang), icon: PhoneCall, color: "text-blue-600" },
    { label: isArabic ? "تم حجز موعد" : "Booked", value: summary.booked, suffix: percent(summary.booking_conversion_rate, lang), icon: CalendarCheck, color: "text-emerald-600" },
    { label: isArabic ? "بدأ العلاج" : "Started", value: summary.started, suffix: percent(summary.treatment_conversion_rate, lang), icon: TrendingUp, color: "text-green-700" },
    { label: isArabic ? "عملاء خاسرون" : "Lost", value: summary.lost, suffix: percent(summary.lost_rate, lang), icon: XCircle, color: "text-destructive" },
    { label: isArabic ? "متابعات مستحقة" : "Follow-ups due", value: summary.followups_due, icon: Clock3, color: "text-amber-600" },
    { label: isArabic ? "غير مسند" : "Unassigned", value: summary.unassigned, icon: UserX, color: "text-orange-600" },
    { label: isArabic ? "متوسط سرعة الرد" : "Avg. response", value: minutes(summary.avg_response_minutes, lang), icon: Target, color: "text-violet-600" },
  ];

  const exportCsv = () => {
    if (!authz.can("leads.export")) return;
    const rows = [
      ["source", "leads", "contacted", "booked", "started", "lost"],
      ...data.sources.map((row) => [row.source, row.leads, row.contacted, row.booked, row.started, row.lost]),
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `zmedico-lead-analytics-${range}d.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-primary"><BarChart3 className="size-4" />{isArabic ? "تحليلات الـCRM" : "CRM analytics"}</div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{isArabic ? "Marketing Analytics وKPI" : "Marketing Analytics & KPI"}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{isArabic ? "قياس رحلة العميل المحتمل من المصدر إلى حجز الموعد وبدء العلاج، مع فصل مؤشرات التسويق عن تشغيل الاستقبال." : "Measure the lead journey from acquisition to booking and treatment, while keeping marketing and reception metrics distinct."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("me-2 size-4", loading && "animate-spin")} />{isArabic ? "تحديث" : "Refresh"}</Button>
          {authz.can("leads.export") ? <Button variant="outline" size="sm" onClick={exportCsv}><Download className="me-2 size-4" />{isArabic ? "تصدير المصادر" : "Export sources"}</Button> : null}
          <Button variant="ghost" size="sm" onClick={() => navigate("/leads")}><Users className="me-2 size-4" />{isArabic ? "الـPipeline" : "Pipeline"}</Button>
        </div>
      </div>

      <Card className="border-border/70 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold">{isArabic ? "الفترة التحليلية" : "Analysis period"}</p><p className="text-xs text-muted-foreground">{isArabic ? "كل الحسابات تستخدم وقت UTC وتعرض أرقامًا حقيقية من قاعدة البيانات." : "All calculations use UTC timestamps and real database records."}</p></div>
          <Select value={range} onValueChange={(value) => setRange(value as RangeKey)}><SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">{isArabic ? "آخر 7 أيام" : "Last 7 days"}</SelectItem><SelectItem value="30">{isArabic ? "آخر 30 يومًا" : "Last 30 days"}</SelectItem><SelectItem value="90">{isArabic ? "آخر 90 يومًا" : "Last 90 days"}</SelectItem></SelectContent></Select>
        </div>
      </Card>

      {loading ? <Card className="p-10 text-center text-sm text-muted-foreground">{isArabic ? "جارٍ حساب المؤشرات…" : "Calculating metrics…"}</Card> : null}
      {!loading && !currentBranchId ? <Card className="p-10 text-center text-sm text-muted-foreground">{isArabic ? "اختر فرعًا لعرض التحليلات" : "Choose a branch to view analytics"}</Card> : null}
      {!loading && currentBranchId && analyticsError ? <Card role="alert" className="border-amber-300 bg-amber-50 p-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><div className="space-y-3"><div><h2 className="font-semibold">{isArabic ? "التحليلات غير متاحة حاليًا" : "Analytics are temporarily unavailable"}</h2><p className="mt-1 text-sm leading-6">{isArabic ? "لم نعرض أرقامًا صفرية حتى لا تُفهم على أنها نتيجة حقيقية. تحقق من اتصال قاعدة البيانات ثم أعد المحاولة." : "We did not show zero values because they could be mistaken for real results. Check the database connection and try again."}</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="me-2 size-4" />{isArabic ? "إعادة المحاولة" : "Retry"}</Button></div></div></Card> : null}
      {!loading && currentBranchId && !analyticsError ? <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">{cards.map(({ label, value, suffix, icon: Icon, color }) => <Card key={label} className="border-border/70 p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><span className="text-xs leading-4 text-muted-foreground">{label}</span><Icon className={cn("size-4 shrink-0", color)} /></div><p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>{suffix ? <p className="mt-1 text-[11px] font-medium text-muted-foreground">{suffix}</p> : null}</Card>)}</div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/70 p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-semibold">{isArabic ? "مسار التحويل" : "Conversion funnel"}</h2><p className="mt-1 text-xs text-muted-foreground">{isArabic ? "النسب محسوبة من إجمالي العملاء المحتملين في الفترة." : "Rates are calculated from all leads in the selected period."}</p></div><Target className="size-5 text-primary" /></div>
            <div className="space-y-4">{[
              [isArabic ? "كل العملاء المحتملين" : "All leads", summary.leads, "bg-primary"],
              [isArabic ? "تم التواصل" : "Contacted", summary.contacted, "bg-blue-500"],
              [isArabic ? "تم حجز موعد" : "Booked", summary.booked, "bg-emerald-500"],
              [isArabic ? "بدأ العلاج" : "Started treatment", summary.started, "bg-green-700"],
            ].map(([label, value, color]) => { const numeric = Number(value); const ratio = summary.leads ? (numeric / summary.leads) * 100 : 0; return <div key={String(label)}><div className="mb-1.5 flex items-center justify-between text-sm"><span>{label}</span><span className="font-semibold">{numeric} <span className="text-xs text-muted-foreground">({summary.leads ? ratio.toFixed(1) : "0.0"}%)</span></span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, ratio)}%` }} /></div></div>; })}</div>
          </Card>
          <Card className="border-border/70 p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-semibold">{isArabic ? "أداء المصادر" : "Source performance"}</h2><p className="mt-1 text-xs text-muted-foreground">{isArabic ? "المصدر لا يساوي الحملة؛ لذلك يظهر كل منهما منفصلًا." : "Source and campaign attribution remain separate dimensions."}</p></div><BarChart3 className="size-5 text-primary" /></div>
            {data.sources.length ? <div className="space-y-3">{data.sources.slice(0, 6).map((row) => <div key={row.source}><div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="truncate font-medium">{labelSource(row.source, lang)}</span><span className="shrink-0 text-muted-foreground">{row.leads} · {percent(summary.leads ? (row.booked / row.leads) * 100 : null, lang)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(row.leads / maxSourceLeads) * 100}%` }} /></div></div>)}</div> : <EmptyState isArabic={isArabic} />}
          </Card>
        </div>

        <Card className="border-border/70 p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-semibold">{isArabic ? "الاتجاه اليومي" : "Daily trend"}</h2><p className="mt-1 text-xs text-muted-foreground">{isArabic ? "عدد العملاء المحتملين والحجوزات وبدء العلاج حسب يوم الإنشاء." : "Leads, bookings, and starts by lead creation day."}</p></div><TrendingUp className="size-5 text-primary" /></div>
          {data.trend.length ? <div className="flex h-52 items-end gap-1 overflow-x-auto pb-7">{data.trend.map((row) => <div key={row.day} className="group relative flex h-full min-w-7 flex-1 flex-col justify-end gap-1"><div className="flex h-full items-end justify-center gap-0.5"><div className="w-1/3 rounded-t bg-primary/70" style={{ height: `${Math.max(row.leads ? 4 : 0, (row.leads / maxTrendLeads) * 100)}%` }} title={`${row.leads} leads`} /><div className="w-1/3 rounded-t bg-emerald-500" style={{ height: `${Math.max(row.booked ? 4 : 0, (row.booked / maxTrendLeads) * 100)}%` }} title={`${row.booked} booked`} /><div className="w-1/3 rounded-t bg-green-700" style={{ height: `${Math.max(row.started ? 4 : 0, (row.started / maxTrendLeads) * 100)}%` }} title={`${row.started} started`} /></div><span className="absolute -bottom-6 start-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-muted-foreground">{row.day.slice(5)}</span></div>)}</div> : <EmptyState isArabic={isArabic} />}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground"><span><i className="me-1 inline-block size-2 rounded-full bg-primary/70" />{isArabic ? "Leads" : "Leads"}</span><span><i className="me-1 inline-block size-2 rounded-full bg-emerald-500" />{isArabic ? "حجز" : "Booked"}</span><span><i className="me-1 inline-block size-2 rounded-full bg-green-700" />{isArabic ? "بدأ العلاج" : "Started"}</span></div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-border/70 p-5 shadow-sm"><div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-semibold">{isArabic ? "أفضل الحملات" : "Top campaigns"}</h2><p className="mt-1 text-xs text-muted-foreground">{isArabic ? "لا توجد تكلفة إعلان حتى الآن؛ لذلك لا نعرض CPL أو ROAS بشكل تخميني." : "Ad spend is not available yet, so CPL and ROAS are intentionally not guessed."}</p></div><Badge variant="secondary">{topCampaigns.length}</Badge></div>{topCampaigns.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-start text-xs text-muted-foreground"><tr><th className="pb-2 text-start font-medium">{isArabic ? "الحملة" : "Campaign"}</th><th className="pb-2 text-end font-medium">Leads</th><th className="pb-2 text-end font-medium">{isArabic ? "حجز" : "Booked"}</th><th className="pb-2 text-end font-medium">{isArabic ? "بدء" : "Started"}</th></tr></thead><tbody>{topCampaigns.map((row) => <tr key={`${row.source}-${row.campaign}`} className="border-t"><td className="max-w-44 truncate py-2.5 text-start"><span className="block truncate font-medium">{row.campaign === "not_set" ? (isArabic ? "غير محددة" : "Not set") : row.campaign}</span><span className="text-[11px] text-muted-foreground">{labelSource(row.source, lang)}</span></td><td className="py-2.5 text-end font-semibold">{row.leads}</td><td className="py-2.5 text-end">{row.booked}</td><td className="py-2.5 text-end">{row.started}</td></tr>)}</tbody></table></div> : <EmptyState isArabic={isArabic} />}</Card>
          <Card className="border-border/70 p-5 shadow-sm"><div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-semibold">{isArabic ? "بطاقة أداء الاستقبال" : "Reception scorecard"}</h2><p className="mt-1 text-xs text-muted-foreground">{isArabic ? "المقارنة حسب الموظف تتجنب خلط أداء الفرع بأداء الفرد." : "Performance is split by assignee to avoid mixing branch and individual outcomes."}</p></div><UserCheck className="size-5 text-primary" /></div>{data.assignees.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-2 text-start font-medium">{isArabic ? "الموظف" : "Assignee"}</th><th className="pb-2 text-end font-medium">{isArabic ? "مسند" : "Assigned"}</th><th className="pb-2 text-end font-medium">{isArabic ? "تواصل" : "Contacted"}</th><th className="pb-2 text-end font-medium">{isArabic ? "حجز" : "Booked"}</th><th className="pb-2 text-end font-medium">{isArabic ? "رد" : "Response"}</th></tr></thead><tbody>{data.assignees.map((row) => <tr key={row.assignee_id} className="border-t"><td className="max-w-36 truncate py-2.5 text-start font-medium">{staffName.get(row.assignee_id) || row.assignee_id.slice(0, 8)}</td><td className="py-2.5 text-end">{row.assigned_leads}</td><td className="py-2.5 text-end">{row.contacted}</td><td className="py-2.5 text-end font-semibold">{row.booked}</td><td className="py-2.5 text-end text-muted-foreground">{minutes(row.avg_response_minutes, lang)}</td></tr>)}</tbody></table></div> : <EmptyState isArabic={isArabic} />}</Card>
        </div>

        <Card className="flex items-start gap-3 border-blue-200 bg-blue-50/60 p-4 text-blue-950 shadow-none dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100"><Info className="mt-0.5 size-4 shrink-0" /><p className="text-xs leading-5">{isArabic ? "هذه اللوحة لا تحسب تكلفة الحملة أو ROAS بدون جدول إنفاق موثوق. عند ربط Meta Ads أو إدخال الإنفاق يدويًا سنضيف CPL وCAC وROAS بنفس قواعد التدقيق، دون تغيير مؤشرات التحويل الحالية." : "This dashboard does not calculate campaign cost or ROAS without a trusted spend table. Once Meta Ads or manual spend is connected, CPL, CAC, and ROAS can be added without changing the current conversion definitions."}</p></Card>
      </> : null}
    </div>
  );
}

function EmptyState({ isArabic }: { isArabic: boolean }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{isArabic ? "لا توجد بيانات كافية في الفترة المحددة" : "Not enough data for the selected period"}</div>;
}
