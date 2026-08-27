import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatMoney } from "@/lib/format";
import { ReportPageHeader, ReportFilterBar, StatCard } from "./_shared";
import { exportReportPDF, exportReportExcel } from "@/lib/reportExport";
import { doctorDisplayName, type DoctorNameFields } from "@/lib/doctorName";

type Row = {
  doctor_id: string;
  name: string;
  assigned: number;
  unique_visits: number;
  total_visits: number;
  returning: number;
  drop_off: number;
  retention: number;
  completed_plans: number;
  active_plans: number;
  revenue: number;
  commissions: number;
};

export default function DoctorPerformance() {
  const { t, lang } = useI18n();
  const { currentBranchId, branchSelectionReady } = useBranch();
  const [start, setStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1).toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!branchSelectionReady || !currentBranchId) { setRows([]); return; }
      const { data: doctors } = await supabase.rpc("list_doctors_for_branch", { _branch_id: currentBranchId });
      const doctorRows = (doctors ?? []) as Array<{ id: string; full_name?: string | null; full_name_en?: string | null; full_name_ar?: string | null }>;
      const docIds = doctorRows.map((doctor) => doctor.id).filter(Boolean);
      if (!docIds.length) { if (active) setRows([]); return; }
      const nameMap = new Map<string, DoctorNameFields>(doctorRows.map((doctor) => [doctor.id, doctor]));

      // Assigned patient counts
      let aq = supabase.from("patients").select("id, assigned_doctor_id").is("deleted_at", null).not("assigned_doctor_id", "is", null);
      aq = aq.eq("branch_id", currentBranchId);
      const { data: assignedRows } = await aq;
      const assignedMap = new Map<string, number>();
      (assignedRows ?? []).forEach((p: any) => {
        if (!p.assigned_doctor_id) return;
        assignedMap.set(p.assigned_doctor_id, (assignedMap.get(p.assigned_doctor_id) ?? 0) + 1);
      });

      // Medical records (visits) in date range
      let vq = supabase.from("medical_records").select("doctor_id, patient_id, visit_date")
        .gte("visit_date", start).lte("visit_date", end).is("deleted_at", null).not("doctor_id", "is", null);
      vq = vq.eq("branch_id", currentBranchId);
      const { data: visits } = await vq;

      // Appointments in date range (with fallback to patient's assigned doctor when appt.doctor_id is null)
      let aq2 = supabase.from("appointments")
        .select("doctor_id, patient_id, scheduled_at, status")
        .gte("scheduled_at", start)
        .lte("scheduled_at", end + "T23:59:59")
        .is("deleted_at", null)
        .in("status", ["completed", "in_progress"] as any);
      aq2 = aq2.eq("branch_id", currentBranchId);
      const { data: appts } = await aq2;

      // Build patient → assigned doctor map for fallback
      const assignedDocByPatient = new Map<string, string>();
      (assignedRows ?? []).forEach((p: any) => {
        if (p.id && p.assigned_doctor_id) assignedDocByPatient.set(p.id, p.assigned_doctor_id);
      });

      // Per-doctor patient visit counts (medical_records + appointments)
      const visitsByDoc = new Map<string, Map<string, number>>();
      const bump = (docId: string, patientId: string) => {
        if (!docId || !patientId) return;
        let m = visitsByDoc.get(docId);
        if (!m) { m = new Map(); visitsByDoc.set(docId, m); }
        m.set(patientId, (m.get(patientId) ?? 0) + 1);
      };
      (visits ?? []).forEach((v: any) => {
        bump(v.doctor_id, v.patient_id);
      });
      (appts ?? []).forEach((a: any) => {
        const doc = a.doctor_id ?? assignedDocByPatient.get(a.patient_id);
        bump(doc, a.patient_id);
      });

      // Treatment plans
      let tq = (supabase as any).from("treatment_plans").select("doctor_id, status, price")
        .gte("created_at", start).lte("created_at", end + "T23:59:59").is("deleted_at", null).not("doctor_id", "is", null);
      tq = tq.eq("branch_id", currentBranchId);
      const { data: plans } = await tq;
      const planMap = new Map<string, { completed: number; active: number }>();
      (plans ?? []).forEach((p: any) => {
        const e = planMap.get(p.doctor_id) ?? { completed: 0, active: 0 };
        if (p.status === "completed") e.completed++;
        else if (p.status === "active") e.active++;
        planMap.set(p.doctor_id, e);
      });

      // Commissions (revenue & earned)
      let cq = (supabase as any).from("doctor_commissions")
        .select("doctor_id, base_amount, commission_amount")
        .gte("created_at", start).lte("created_at", end + "T23:59:59");
      cq = cq.eq("branch_id", currentBranchId);
      const { data: comms } = await cq;
      const commMap = new Map<string, { revenue: number; commissions: number }>();
      (comms ?? []).forEach((c: any) => {
        const e = commMap.get(c.doctor_id) ?? { revenue: 0, commissions: 0 };
        e.revenue += Number(c.base_amount || 0);
        e.commissions += Number(c.commission_amount || 0);
        commMap.set(c.doctor_id, e);
      });

      const out: Row[] = docIds.map((id: string) => {
        const m = visitsByDoc.get(id) ?? new Map();
        const uniquePatients = m.size;
        let totalVisits = 0;
        let returning = 0;
        m.forEach((cnt) => { totalVisits += cnt; if (cnt >= 2) returning++; });
        const dropOff = uniquePatients - returning;
        const retention = uniquePatients ? Math.round((returning / uniquePatients) * 100) : 0;
        const pm = planMap.get(id) ?? { completed: 0, active: 0 };
        const cm = commMap.get(id) ?? { revenue: 0, commissions: 0 };
        return {
          doctor_id: id,
          name: nameMap.has(id) ? doctorDisplayName(nameMap.get(id)!, lang) : id.slice(0, 8),
          assigned: assignedMap.get(id) ?? 0,
          unique_visits: uniquePatients,
          total_visits: totalVisits,
          returning,
          drop_off: dropOff,
          retention,
          completed_plans: pm.completed,
          active_plans: pm.active,
          revenue: cm.revenue,
          commissions: cm.commissions,
        };
      });
      out.sort((a, b) =>
        (b.assigned + b.unique_visits) - (a.assigned + a.unique_visits) ||
        b.retention - a.retention
      );
      if (active) setRows(out);
    })();
    return () => { active = false; };
  }, [start, end, branchSelectionReady, currentBranchId]);

  const totals = useMemo(() => {
    const t = { assigned: 0, patients: 0, returning: 0, revenue: 0 };
    rows.forEach((r) => { t.assigned += r.assigned; t.patients += r.unique_visits; t.returning += r.returning; t.revenue += r.revenue; });
    return { ...t, retention: t.patients ? Math.round((t.returning / t.patients) * 100) : 0 };
  }, [rows]);

  const columns = [
    { header: lang === "ar" ? "الطبيب" : "Doctor", key: "name" },
    { header: lang === "ar" ? "محوّلين له" : "Assigned", key: "assigned" },
    { header: lang === "ar" ? "مرضى زاروه" : "Unique Patients", key: "unique_visits" },
    { header: lang === "ar" ? "إجمالي الزيارات" : "Total Visits", key: "total_visits" },
    { header: lang === "ar" ? "كملوا (≥2)" : "Returning (≥2)", key: "returning" },
    { header: lang === "ar" ? "بطلوا" : "Drop-off", key: "drop_off" },
    { header: lang === "ar" ? "نسبة الاستمرار %" : "Retention %", key: "retention" },
    { header: lang === "ar" ? "خطط مكتملة" : "Completed Plans", key: "completed_plans" },
    { header: lang === "ar" ? "خطط نشطة" : "Active Plans", key: "active_plans" },
    { header: lang === "ar" ? "الإيرادات" : "Revenue", key: "revenue" },
    { header: lang === "ar" ? "العمولات" : "Commissions", key: "commissions" },
  ];

  const title = lang === "ar" ? "تقرير أداء الأطباء" : "Doctor Performance Report";

  const exportPdf = () => exportReportPDF({
    title, subtitle: `${start} → ${end}`, columns,
    rows: rows.map((r) => ({ ...r, revenue: formatMoney(r.revenue, lang), commissions: formatMoney(r.commissions, lang) })),
    summary: [
      { label: lang === "ar" ? "إجمالي المحولين" : "Total Assigned", value: String(totals.assigned) },
      { label: lang === "ar" ? "إجمالي المرضى" : "Total Patients", value: String(totals.patients) },
      { label: lang === "ar" ? "كملوا" : "Returning", value: String(totals.returning) },
      { label: lang === "ar" ? "متوسط الاستمرار" : "Avg Retention", value: totals.retention + "%" },
      { label: lang === "ar" ? "الإيرادات" : "Revenue", value: formatMoney(totals.revenue, lang) },
    ], lang,
  });

  const exportExcel = () => exportReportExcel({
    title, columns,
    rows: rows.map((r) => ({ ...r, revenue: r.revenue, commissions: r.commissions })),
    summary: [
      { label: lang === "ar" ? "إجمالي المحولين" : "Total Assigned", value: String(totals.assigned) },
      { label: lang === "ar" ? "إجمالي المرضى" : "Total Patients", value: String(totals.patients) },
      { label: lang === "ar" ? "كملوا" : "Returning", value: String(totals.returning) },
      { label: lang === "ar" ? "متوسط الاستمرار" : "Avg Retention", value: totals.retention + "%" },
      { label: lang === "ar" ? "الإيرادات" : "Revenue", value: String(totals.revenue.toFixed(2)) },
    ],
  });

  return (
    <div className="space-y-6">
      <ReportPageHeader title={title} />
      <ReportFilterBar module="reports_medical" start={start} end={end} setStart={setStart} setEnd={setEnd} onPdf={exportPdf} onExcel={exportExcel} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label={lang === "ar" ? "إجمالي المحولين" : "Total Assigned"} value={totals.assigned} />
        <StatCard label={lang === "ar" ? "إجمالي المرضى" : "Total Patients"} value={totals.patients} />
        <StatCard label={lang === "ar" ? "كملوا" : "Returning"} value={totals.returning} />
        <StatCard label={lang === "ar" ? "متوسط الاستمرار" : "Avg Retention"} value={totals.retention + "%"} />
        <StatCard label={lang === "ar" ? "الإيرادات" : "Revenue"} value={formatMoney(totals.revenue, lang)} />
      </div>
      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c.key}>{c.header}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">—</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.doctor_id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.assigned}</TableCell>
                  <TableCell>{r.unique_visits}</TableCell>
                  <TableCell>{r.total_visits}</TableCell>
                  <TableCell>{r.returning}</TableCell>
                  <TableCell>{r.drop_off}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.retention >= 70 ? "status-completed" : r.retention >= 40 ? "status-progress" : "status-cancelled"}>{r.retention}%</Badge>
                  </TableCell>
                  <TableCell>{r.completed_plans}</TableCell>
                  <TableCell>{r.active_plans}</TableCell>
                  <TableCell className="tabular-nums">{formatMoney(r.revenue, lang)}</TableCell>
                  <TableCell className="tabular-nums">{formatMoney(r.commissions, lang)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}