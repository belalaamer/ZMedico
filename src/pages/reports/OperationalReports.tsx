import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatMoney, formatDateTime } from "@/lib/format";
import { ReportFilterBar, ReportPageHeader, StatCard } from "./_shared";
import { defaultDateRange, exportReportPDF, exportReportExcel, CHART_COLORS } from "@/lib/reportExport";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";

export default function OperationalReports() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const dr = defaultDateRange(30);
  const [start, setStart] = useState(dr.start);
  const [end, setEnd] = useState(dr.end);

  return (
    <div className="space-y-4">
      <ReportPageHeader title={t("operationalReports")} />
      <Tabs defaultValue="appts">
        <TabsList>
          <TabsTrigger value="appts">{t("appointmentsReport")}</TabsTrigger>
          <TabsTrigger value="doctor">{t("doctorPerformance")}</TabsTrigger>
          <TabsTrigger value="branch">{t("branchPerformance")}</TabsTrigger>
        </TabsList>
        <TabsContent value="appts"><ApptsTab start={start} end={end} setStart={setStart} setEnd={setEnd} branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
        <TabsContent value="doctor"><DoctorTab start={start} end={end} setStart={setStart} setEnd={setEnd} branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
        <TabsContent value="branch"><BranchTab start={start} end={end} setStart={setStart} setEnd={setEnd} lang={lang} t={t} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ApptsTab({ start, end, setStart, setEnd, branchId, lang, t }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("appointments")
      .select("id, scheduled_at, status, doctor_id, patients(first_name_en, last_name_en, first_name_ar, last_name_ar), profiles!appointments_doctor_id_fkey(full_name)")
      .gte("scheduled_at", start).lte("scheduled_at", end + "T23:59:59");
    if (branchId) q = q.eq("branch_id", branchId);
    q.then(({ data }) => setRows(data ?? []));
  }, [start, end, branchId]);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>(); rows.forEach((r) => m.set(r.status, (m.get(r.status) ?? 0) + 1));
    return Array.from(m.entries()).map(([status, count]) => ({ status, count }));
  }, [rows]);
  const byHour = useMemo(() => {
    const m = new Map<number, number>();
    rows.forEach((r) => { const h = new Date(r.scheduled_at).getHours(); m.set(h, (m.get(h) ?? 0) + 1); });
    return Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: m.get(h) ?? 0 }));
  }, [rows]);

  const cols = [{ header: t("date"), key: "d" }, { header: t("patient"), key: "p" }, { header: t("status"), key: "s" }];
  const expRows = rows.map((r) => ({
    d: r.scheduled_at, p: lang === "ar" ? `${r.patients?.first_name_ar ?? ""} ${r.patients?.last_name_ar ?? ""}` : `${r.patients?.first_name_en ?? ""} ${r.patients?.last_name_en ?? ""}`,
    s: r.status,
  }));

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("appointmentsReport"), columns: cols, rows: expRows, lang })}
        onExcel={() => exportReportExcel({ title: t("appointmentsReport"), columns: cols, rows: expRows })} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card><CardContent className="pt-6"><div className="text-sm font-medium mb-2">{t("byStatus")}</div>
          <div style={{ width: "100%", height: 240 }}><ResponsiveContainer><PieChart>
            <Pie data={byStatus} dataKey="count" nameKey="status" outerRadius={80} label>
              {byStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie><Legend /><Tooltip />
          </PieChart></ResponsiveContainer></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm font-medium mb-2">{t("byHour")}</div>
          <div style={{ width: "100%", height: 240 }}><ResponsiveContainer><BarChart data={byHour}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hour" /><YAxis /><Tooltip />
            <Bar dataKey="count" fill={CHART_COLORS[0]} />
          </BarChart></ResponsiveContainer></div></CardContent></Card>
      </div>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("date")}</TableHead><TableHead>{t("patient")}</TableHead><TableHead>{t("status")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{formatDateTime(r.scheduled_at, lang)}</TableCell>
            <TableCell>{lang === "ar" ? `${r.patients?.first_name_ar ?? ""} ${r.patients?.last_name_ar ?? ""}` : `${r.patients?.first_name_en ?? ""} ${r.patients?.last_name_en ?? ""}`}</TableCell>
            <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{r.status}</span></TableCell>
          </TableRow>
        ))}{!rows.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function DoctorTab({ start, end, setStart, setEnd, branchId, lang, t }: any) {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      let mq = supabase.from("medical_records").select("doctor_id, profiles!medical_records_doctor_id_fkey(full_name)").gte("visit_date", start).lte("visit_date", end);
      if (branchId) mq = mq.eq("branch_id", branchId);
      const { data: recs } = await mq;
      const counts = new Map<string, { name: string; count: number; revenue: number }>();
      (recs ?? []).forEach((r: any) => {
        if (!r.doctor_id) return;
        const cur = counts.get(r.doctor_id) ?? { name: r.profiles?.full_name ?? "—", count: 0, revenue: 0 };
        cur.count += 1; counts.set(r.doctor_id, cur);
      });
      // revenue from invoices linked by created_by ≈ doctor (approx)
      let iq = supabase.from("invoices").select("created_by, total").gte("invoice_date", start).lte("invoice_date", end);
      if (branchId) iq = iq.eq("branch_id", branchId);
      const { data: invs } = await iq;
      (invs ?? []).forEach((i: any) => {
        if (!i.created_by) return;
        const cur = counts.get(i.created_by); if (cur) cur.revenue += Number(i.total || 0);
      });
      setData(Array.from(counts.entries()).map(([id, v]) => ({ id, ...v })));
    })();
  }, [start, end, branchId]);

  const cols = [{ header: t("doctor"), key: "name" }, { header: t("consultations"), key: "count" }, { header: t("revenue"), key: "revenue" }, { header: t("avgPerPatient"), key: "avg" }];
  const expRows = data.map((d) => ({ name: d.name, count: d.count, revenue: d.revenue.toFixed(2), avg: d.count ? (d.revenue / d.count).toFixed(2) : "0" }));

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("doctorPerformance"), columns: cols, rows: expRows, lang })}
        onExcel={() => exportReportExcel({ title: t("doctorPerformance"), columns: cols, rows: expRows })} />
      <Card><CardContent className="pt-6">
        <div style={{ width: "100%", height: 240 }}><ResponsiveContainer><BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip />
          <Bar dataKey="count" fill={CHART_COLORS[0]} name={t("consultations")} />
          <Bar dataKey="revenue" fill={CHART_COLORS[2]} name={t("revenue")} />
        </BarChart></ResponsiveContainer></div>
      </CardContent></Card>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("doctor")}</TableHead><TableHead>{t("consultations")}</TableHead>
          <TableHead className="text-end">{t("revenue")}</TableHead><TableHead className="text-end">{t("avgPerPatient")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{data.map((d) => (
          <TableRow key={d.id}>
            <TableCell>{d.name}</TableCell><TableCell>{d.count}</TableCell>
            <TableCell className="text-end">{formatMoney(d.revenue, lang)}</TableCell>
            <TableCell className="text-end">{formatMoney(d.count ? d.revenue / d.count : 0, lang)}</TableCell>
          </TableRow>
        ))}{!data.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function BranchTab({ start, end, setStart, setEnd, lang, t }: any) {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data: branches } = await supabase.from("branches").select("id, name_en, name_ar");
      const out: any[] = [];
      for (const b of branches ?? []) {
        const [{ count: patients }, { data: revs }, { data: exps }] = await Promise.all([
          supabase.from("patients").select("id", { count: "exact", head: true }).eq("branch_id", b.id),
          supabase.from("payments").select("amount").eq("branch_id", b.id).gte("payment_date", start).lte("payment_date", end),
          supabase.from("expenses").select("amount").eq("branch_id", b.id).gte("expense_date", start).lte("expense_date", end),
        ]);
        const revenue = (revs ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
        const expense = (exps ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
        out.push({ id: b.id, name: lang === "ar" ? b.name_ar : b.name_en, patients: patients ?? 0, revenue, expense, profit: revenue - expense });
      }
      setData(out);
    })();
  }, [start, end, lang]);

  const cols = [{ header: t("branch"), key: "name" }, { header: t("patients"), key: "patients" }, { header: t("revenue"), key: "revenue" }, { header: t("totalExpenses"), key: "expense" }, { header: t("profitAmount"), key: "profit" }];
  const expRows = data.map((d) => ({ name: d.name, patients: d.patients, revenue: d.revenue.toFixed(2), expense: d.expense.toFixed(2), profit: d.profit.toFixed(2) }));

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("branchPerformance"), columns: cols, rows: expRows, lang })}
        onExcel={() => exportReportExcel({ title: t("branchPerformance"), columns: cols, rows: expRows })} />
      <Card><CardContent className="pt-6">
        <div style={{ width: "100%", height: 260 }}><ResponsiveContainer><BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
          <Bar dataKey="revenue" fill={CHART_COLORS[2]} name={t("revenue")} />
          <Bar dataKey="expense" fill={CHART_COLORS[4]} name={t("totalExpenses")} />
          <Bar dataKey="profit" fill={CHART_COLORS[0]} name={t("profitAmount")} />
        </BarChart></ResponsiveContainer></div>
      </CardContent></Card>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("branch")}</TableHead><TableHead>{t("patients")}</TableHead>
          <TableHead className="text-end">{t("revenue")}</TableHead>
          <TableHead className="text-end">{t("totalExpenses")}</TableHead>
          <TableHead className="text-end">{t("profitAmount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{data.map((d) => (
          <TableRow key={d.id}>
            <TableCell>{d.name}</TableCell><TableCell>{d.patients}</TableCell>
            <TableCell className="text-end">{formatMoney(d.revenue, lang)}</TableCell>
            <TableCell className="text-end">{formatMoney(d.expense, lang)}</TableCell>
            <TableCell className={`text-end ${d.profit >= 0 ? "text-green-600" : "text-destructive"}`}>{formatMoney(d.profit, lang)}</TableCell>
          </TableRow>
        ))}{!data.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}