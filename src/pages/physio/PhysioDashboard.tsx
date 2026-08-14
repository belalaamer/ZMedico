import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Calendar, AlertCircle, TrendingUp, Users, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ListSkeleton";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export default function PhysioDashboard() {
  const { currentBranchId } = useBranch();
  const { lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [reassess, setReassess] = useState<any[]>([]);
  const [therapistMap, setTherapistMap] = useState<Record<string, string>>({});

  const load = async () => {
    if (!currentBranchId) { setLoading(false); return; }
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const [{ data: cs }, { data: ss }, { data: rs }] = await Promise.all([
      supabase.from("physio_cases" as any)
        .select("id,status,therapist_id,patient_id,expected_sessions,followup_due_date,followup_enabled,start_date,diagnosis,patients(first_name_en,last_name_en,first_name_ar,last_name_ar)")
        .eq("branch_id", currentBranchId).is("deleted_at", null),
      supabase.from("physio_sessions" as any)
        .select("id,case_id,session_date,attendance,physio_cases!inner(branch_id,deleted_at)")
        .eq("physio_cases.branch_id", currentBranchId)
        .is("deleted_at", null).gte("session_date", since),
      supabase.from("physio_reassessments" as any)
        .select("id,case_id,assessment_date,trend,physio_cases!inner(branch_id,deleted_at)")
        .eq("physio_cases.branch_id", currentBranchId)
        .is("deleted_at", null).gte("assessment_date", since),
    ]);
    setCases((cs as any) ?? []);
    setSessions((ss as any) ?? []);
    setReassess((rs as any) ?? []);
    const therapistIds: string[] = Array.from(new Set(((cs as any) ?? []).map((c: any) => c.therapist_id).filter(Boolean) as string[]));
    if (therapistIds.length) {
      // Bug fix: staff_profiles has no first_name_en/last_name_en columns at
      // all -- this query was silently failing (PostgREST 400,
      // "column staff_profiles.first_name_en does not exist"), so `tps` was
      // always null/[] and every therapist in this dashboard showed as an
      // 8-char UUID slice instead of their name. The staff member's display
      // name lives on `profiles.full_name`, reached the same way
      // PhysioCases.tsx already does it (the one place in this app that
      // gets it right).
      const { data: tps } = await supabase.from("staff_profiles")
        .select("id,profile:profiles!staff_profiles_id_fkey(full_name,email)").in("id", therapistIds);
      const map: Record<string, string> = {};
      (tps ?? []).forEach((t: any) => { map[t.id] = t.profile?.full_name || t.profile?.email || t.id.slice(0, 8); });
      setTherapistMap(map);
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId]);

  if (loading) return <div className="p-6"><ListSkeleton rows={6} /></div>;

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10); // rolling 7 days incl. today
  const active = cases.filter(c => c.status === "active");
  const completed = cases.filter(c => c.status === "completed");
  const sessionsToday = sessions.filter(s => s.session_date === today && s.attendance === "done");
  const sessionsWeek = sessions.filter(s => s.session_date >= weekAgo && s.attendance === "done");
  const done = sessions.filter(s => s.attendance === "done").length;
  const missed = sessions.filter(s => s.attendance === "missed").length;
  const attendanceRate = (done + missed) > 0 ? Math.round((done * 100) / (done + missed)) : 0;
  const avgPerActive30d = active.length ? (sessions.filter(s => active.some(a => a.id === s.case_id) && s.attendance === "done").length / active.length).toFixed(1) : "0";
  const overdueFollowups = active.filter(c => c.followup_enabled && c.followup_due_date && c.followup_due_date < today);

  const byTherapist: Record<string, number> = {};
  active.forEach(c => { const k = c.therapist_id || "_none"; byTherapist[k] = (byTherapist[k] ?? 0) + 1; });
  const byStatus: Record<string, number> = {};
  cases.forEach(c => { byStatus[c.status] = (byStatus[c.status] ?? 0) + 1; });

  // Therapist workload (last 30d): active cases, sessions done, overdue follow-ups.
  const caseTherapist: Record<string, string> = {};
  cases.forEach(c => { caseTherapist[c.id] = c.therapist_id || "_none"; });
  const workload: Record<string, { active: number; done: number; overdue: number }> = {};
  const bump = (k: string) => (workload[k] ||= { active: 0, done: 0, overdue: 0 });
  active.forEach(c => { bump(c.therapist_id || "_none").active += 1; });
  sessions.filter(s => s.attendance === "done").forEach(s => {
    const k = caseTherapist[s.case_id] || "_none";
    bump(k).done += 1;
  });
  overdueFollowups.forEach(c => { bump(c.therapist_id || "_none").overdue += 1; });
  const workloadRows = Object.entries(workload).sort((a, b) => b[1].active - a[1].active);

  const patientName = (p: any) => lang === "ar"
    ? `${p?.first_name_ar ?? p?.first_name_en ?? ""} ${p?.last_name_ar ?? p?.last_name_en ?? ""}`.trim()
    : `${p?.first_name_en ?? ""} ${p?.last_name_en ?? ""}`.trim();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{lang === "ar" ? "لوحة العلاج الطبيعي" : "Physiotherapy dashboard"}</h1>
          <p className="text-sm text-muted-foreground mt-1">{lang === "ar" ? "آخر 30 يوم" : "Last 30 days"}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/physio">{lang === "ar" ? "كل الحالات" : "All cases"}</Link></Button>
          <Button asChild variant="outline"><Link to="/physio/reports">{lang === "ar" ? "التقارير" : "Reports"}</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Activity className="size-4" />} label={lang === "ar" ? "حالات نشطة" : "Active cases"} value={active.length} />
        <Kpi icon={<Users className="size-4" />} label={lang === "ar" ? "مكتملة" : "Completed"} value={completed.length} />
        <Kpi icon={<Calendar className="size-4" />} label={lang === "ar" ? "جلسات اليوم (تمت)" : "Sessions done today"} value={sessionsToday.length} />
        <Kpi icon={<Calendar className="size-4" />} label={lang === "ar" ? "جلسات الأسبوع (تمت، 7ي)" : "Sessions done (7d)"} value={sessionsWeek.length} />
        <Kpi icon={<TrendingUp className="size-4" />} label={lang === "ar" ? "نسبة الحضور" : "Attendance rate"} value={`${attendanceRate}%`} />
        <Kpi icon={<Activity className="size-4" />} label={lang === "ar" ? "متوسط جلسات/حالة (30ي)" : "Avg done / active case (30d)"} value={avgPerActive30d} />
        <Kpi icon={<AlertCircle className="size-4" />} label={lang === "ar" ? "متابعات متأخرة" : "Overdue follow-ups"} value={overdueFollowups.length} accent={overdueFollowups.length > 0} />
        <Kpi icon={<TrendingUp className="size-4" />} label={lang === "ar" ? "إعادة تقييم (30ي)" : "Reassessments (30d)"} value={reassess.length} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{lang === "ar" ? "حسب المعالج" : "Active cases by therapist"}</h3>
          {Object.keys(byTherapist).length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <div className="space-y-2">
              {Object.entries(byTherapist).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 truncate">{k === "_none" ? (lang === "ar" ? "غير محدد" : "Unassigned") : (therapistMap[k] || k.slice(0, 8))}</div>
                  <div className="h-2.5 flex-1 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(v * 100) / active.length}%` }} /></div>
                  <div className="w-8 text-right text-muted-foreground">{v}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{lang === "ar" ? "حسب الحالة" : "Cases by status"}</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byStatus).map(([k, v]) => (
              <Badge key={k} variant="outline" className="text-sm">{k}: {v}</Badge>
            ))}
            {Object.keys(byStatus).length === 0 && <span className="text-sm text-muted-foreground">—</span>}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{lang === "ar" ? "حمل العمل لكل معالج (30ي)" : "Therapist workload (30d)"}</h3>
        {workloadRows.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-start py-3">{lang === "ar" ? "المعالج" : "Therapist"}</th>
                  <th className="text-end py-3">{lang === "ar" ? "نشطة" : "Active"}</th>
                  <th className="text-end py-3">{lang === "ar" ? "جلسات تمت" : "Sessions done"}</th>
                  <th className="text-end py-3">{lang === "ar" ? "متابعات متأخرة" : "Overdue follow-ups"}</th>
                </tr>
              </thead>
              <tbody>
                {workloadRows.map(([k, w]) => (
                  <tr key={k} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-medium">{k === "_none" ? (lang === "ar" ? "غير محدد" : "Unassigned") : (therapistMap[k] || k.slice(0, 8))}</td>
                    <td className="text-end py-3">{w.active}</td>
                    <td className="text-end py-3">{w.done}</td>
                    <td className="text-end py-3">
                      {w.overdue > 0
                        ? <Badge variant="destructive">{w.overdue}</Badge>
                        : <span className="text-muted-foreground">{w.overdue}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {overdueFollowups.length > 0 && (
        <Card className="overflow-hidden border-destructive/40">
          <div className="flex items-center gap-2 px-4 py-3 bg-destructive/10 border-b border-destructive/30">
            <AlertCircle className="size-4 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive">{lang === "ar" ? "متابعات متأخرة" : "Overdue follow-ups"}</h3>
            <Badge variant="destructive" className="ms-auto">{overdueFollowups.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {overdueFollowups.slice(0, 10).map(c => (
              <Link key={c.id} to={`/physio/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group">
                <div className="flex-1 text-sm truncate">{patientName(c.patients)} · {c.diagnosis || "—"}</div>
                <Badge variant="outline" className="status-cancelled">{lang === "ar" ? "حتى" : "due"} {formatDate(c.followup_due_date, lang)}</Badge>
                <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | string; accent?: boolean }) {
  return (
    <Card className={`p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${accent ? "border-destructive/40" : ""}`}>
      <div className="flex items-center gap-2">
        <div className={`p-2 rounded-lg ${accent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{icon}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
      <div className={`text-2xl font-bold mt-2 ${accent ? "text-destructive" : ""}`}>{value}</div>
    </Card>
  );
}
