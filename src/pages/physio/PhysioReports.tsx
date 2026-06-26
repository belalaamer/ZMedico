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
import { Download } from "lucide-react";

function downloadCsv(filename: string, rows: any[][]) {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

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
  const [activeNow, setActiveNow] = useState<number>(0);

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
    // "Active cases" KPI is independent of start_date range — it's a snapshot of cases
    // currently active in this branch (optionally filtered by therapist).
    let aQuery = supabase.from("physio_cases" as any)
      .select("id", { count: "exact", head: true })
      .eq("branch_id", currentBranchId).is("deleted_at", null).eq("status", "active");
    if (therapistId !== "_all") aQuery = aQuery.eq("therapist_id", therapistId);
    const { count: ac } = await aQuery;
    setActiveNow(ac ?? 0);
    setLoading(false);
  };

  useEffect(() => { run(); /* eslint-disable-next-line */ }, [currentBranchId]);

  const exportCsv = () => {
    const filterTag = `${from}_${to}_${therapistId}_${status}_${attendance}`;
    const pn = (p: any) => `${p?.first_name_en ?? ""} ${p?.last_name_en ?? ""}`.trim();
    // Build case_id -> patient lookup so per-session/per-reassessment rows are human-readable.
    const caseLookup: Record<string, { patient: string; diagnosis: string }> = {};
    cases.forEach(c => { caseLookup[c.id] = { patient: pn(c.patients), diagnosis: c.diagnosis ?? "" }; });
    const therapistName = therapistId === "_all"
      ? "All"
      : (therapists.find((t: any) => t.id === therapistId)
          ? `${therapists.find((t: any) => t.id === therapistId)!.first_name_en ?? ""} ${therapists.find((t: any) => t.id === therapistId)!.last_name_en ?? ""}`.trim() || therapistId
          : therapistId);
    downloadCsv(`physio_cases_${filterTag}.csv`, [
      ["case_id", "patient", "diagnosis", "status", "therapist_id", "start_date", "expected_sessions"],
      ...cases.map(c => [c.id, pn(c.patients), c.diagnosis ?? "", c.status, c.therapist_id ?? "", c.start_date ?? "", c.expected_sessions ?? ""]),
    ]);
    downloadCsv(`physio_sessions_${filterTag}.csv`, [
      ["session_id", "case_id", "patient", "diagnosis", "session_date", "attendance", "therapist_id"],
      ...sessions.map(s => [s.id, s.case_id, caseLookup[s.case_id]?.patient ?? "", caseLookup[s.case_id]?.diagnosis ?? "", s.session_date ?? "", s.attendance ?? "", s.therapist_id ?? ""]),
    ]);
    downloadCsv(`physio_reassessments_${filterTag}.csv`, [
      ["reassessment_id", "case_id", "patient", "diagnosis", "assessment_date", "trend", "therapist_id"],
      ...reassess.map(r => [r.id, r.case_id, caseLookup[r.case_id]?.patient ?? "", caseLookup[r.case_id]?.diagnosis ?? "", r.assessment_date ?? "", r.trend ?? "", r.therapist_id ?? ""]),
    ]);
    downloadCsv(`physio_summary_${filterTag}.csv`, [
      ["metric", "value"],
      ["from", from], ["to", to],
      ["therapist_filter", therapistName], ["status_filter", status], ["attendance_filter", attendance],
      ["cases_total", cases.length],
      ["sessions_done", summary.done], ["sessions_missed", summary.missed],
      ["active_cases_now", activeNow], ["reassessments_total", summary.reassessTotal],
      ["improving", summary.improving], ["worsening", summary.worsening],
    ]);
  };

  const summary = useMemo(() => {
    const done = sessions.filter(s => s.attendance === "done").length;
    const missed = sessions.filter(s => s.attendance === "missed").length;
    const improving = reassess.filter(r => r.trend === "improving").length;
    const worsening = reassess.filter(r => r.trend === "worsening").length;
    return { done, missed, improving, worsening, reassessTotal: reassess.length };
  }, [sessions, reassess]);

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
        <div className="flex items-end gap-2">
          <Button onClick={run} className="flex-1">{lang === "ar" ? "تشغيل" : "Run"}</Button>
          <Button onClick={exportCsv} variant="outline"
            disabled={loading || (cases.length === 0 && sessions.length === 0 && reassess.length === 0)}
            title={lang === "ar" ? "تصدير CSV" : "Export CSV"}>
            <Download className="size-4" />
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label={lang === "ar" ? "جلسات تمت" : "Sessions done"} value={summary.done} />
        <Kpi label={lang === "ar" ? "غيابات" : "Missed"} value={summary.missed} />
        <Kpi label={lang === "ar" ? "حالات نشطة (الآن)" : "Active cases (now)"} value={activeNow} />
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