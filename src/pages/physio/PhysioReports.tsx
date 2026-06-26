import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ListSkeleton";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export default function PhysioReports() {
  const { currentBranchId } = useBranch();
  const { lang } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [therapistId, setTherapistId] = useState<string>("_all");
  const [status, setStatus] = useState<string>("_all");
  const [attendance, setAttendance] = useState<string>("_all");
  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [reassess, setReassess] = useState<any[]>([]);
  const [therapists, setTherapists] = useState<any[]>([]);

  useEffect(() => {
    if (!currentBranchId) return;
    supabase.from("staff_profiles").select("id,first_name_en,last_name_en")
      .eq("branch_id", currentBranchId).limit(500).then(({ data }) => setTherapists((data as any) ?? []));
  }, [currentBranchId]);

  const run = async () => {
    if (!currentBranchId) return;
    setLoading(true);
    let cQuery = supabase.from("physio_cases" as any)
      .select("id,status,therapist_id,start_date,diagnosis,expected_sessions,patients(first_name_en,last_name_en,first_name_ar,last_name_ar)")
      .eq("branch_id", currentBranchId).is("deleted_at", null)
      .gte("start_date", from).lte("start_date", to);
    if (status !== "_all") cQuery = cQuery.eq("status", status);
    if (therapistId !== "_all") cQuery = cQuery.eq("therapist_id", therapistId);
    let sQuery = supabase.from("physio_sessions" as any)
      .select("id,case_id,session_date,attendance,therapist_id,physio_cases!inner(branch_id,deleted_at,status)")
      .eq("physio_cases.branch_id", currentBranchId)
      .is("deleted_at", null).gte("session_date", from).lte("session_date", to);
    if (attendance !== "_all") sQuery = sQuery.eq("attendance", attendance);
    if (therapistId !== "_all") sQuery = sQuery.eq("therapist_id", therapistId);
    let rQuery = supabase.from("physio_reassessments" as any)
      .select("id,case_id,assessment_date,trend,therapist_id,physio_cases!inner(branch_id,deleted_at)")
      .eq("physio_cases.branch_id", currentBranchId)
      .is("deleted_at", null).gte("assessment_date", from).lte("assessment_date", to);
    if (therapistId !== "_all") rQuery = rQuery.eq("therapist_id", therapistId);
    const [{ data: cs }, { data: ss }, { data: rs }] = await Promise.all([cQuery, sQuery, rQuery]);
    setCases((cs as any) ?? []); setSessions((ss as any) ?? []); setReassess((rs as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { run(); /* eslint-disable-next-line */ }, [currentBranchId]);

  const summary = useMemo(() => {
    const done = sessions.filter(s => s.attendance === "done").length;
    const missed = sessions.filter(s => s.attendance === "missed").length;
    const improving = reassess.filter(r => r.trend === "improving").length;
    const worsening = reassess.filter(r => r.trend === "worsening").length;
    const active = cases.filter(c => c.status === "active").length;
    return { done, missed, improving, worsening, active, reassessTotal: reassess.length };
  }, [sessions, reassess, cases]);

  const patientName = (p: any) => lang === "ar"
    ? `${p?.first_name_ar ?? p?.first_name_en ?? ""} ${p?.last_name_ar ?? p?.last_name_en ?? ""}`.trim()
    : `${p?.first_name_en ?? ""} ${p?.last_name_en ?? ""}`.trim();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{lang === "ar" ? "تقارير العلاج الطبيعي" : "Physiotherapy reports"}</h1>
      </div>

      <Card className="p-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <div><Label>{lang === "ar" ? "من" : "From"}</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label>{lang === "ar" ? "إلى" : "To"}</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div>
          <Label>{lang === "ar" ? "المعالج" : "Therapist"}</Label>
          <Select value={therapistId} onValueChange={setTherapistId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">{lang === "ar" ? "الكل" : "All"}</SelectItem>
              {therapists.map((t: any) => <SelectItem key={t.id} value={t.id}>{`${t.first_name_en ?? ""} ${t.last_name_en ?? ""}`.trim() || t.id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{lang === "ar" ? "حالة الكيس" : "Case status"}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">{lang === "ar" ? "الكل" : "All"}</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{lang === "ar" ? "الحضور" : "Attendance"}</Label>
          <Select value={attendance} onValueChange={setAttendance}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">{lang === "ar" ? "الكل" : "All"}</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end"><Button onClick={run} className="w-full">{lang === "ar" ? "تشغيل" : "Run"}</Button></div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label={lang === "ar" ? "جلسات تمت" : "Sessions done"} value={summary.done} />
        <Kpi label={lang === "ar" ? "غيابات" : "Missed"} value={summary.missed} />
        <Kpi label={lang === "ar" ? "حالات نشطة" : "Active cases"} value={summary.active} />
        <Kpi label={lang === "ar" ? "إعادة تقييم" : "Reassessments"} value={summary.reassessTotal} />
        <Kpi label={lang === "ar" ? "تحسن" : "Improving"} value={summary.improving} />
        <Kpi label={lang === "ar" ? "تدهور" : "Worsening"} value={summary.worsening} />
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 text-sm font-semibold">{lang === "ar" ? "الحالات في النطاق" : "Cases in range"}</div>
        {loading ? <ListSkeleton rows={5} /> : cases.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">—</div>
        ) : (
          <div className="divide-y divide-border">
            {cases.map(c => (
              <div key={c.id} className="p-3 flex items-center gap-3 text-sm">
                <div className="flex-1 truncate">{patientName(c.patients)} · {c.diagnosis || "—"}</div>
                <div className="text-xs text-muted-foreground">{formatDate(c.start_date, lang)}</div>
                <Badge variant="outline">{c.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}