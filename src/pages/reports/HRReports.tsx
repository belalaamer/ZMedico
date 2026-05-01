import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatMoney } from "@/lib/format";
import { ReportFilterBar, ReportPageHeader, StatCard } from "./_shared";
import { defaultDateRange, exportReportPDF, exportReportExcel, CHART_COLORS } from "@/lib/reportExport";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export default function HRReports() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const dr = defaultDateRange(30);
  const [start, setStart] = useState(dr.start);
  const [end, setEnd] = useState(dr.end);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  return (
    <div className="space-y-4">
      <ReportPageHeader title={t("hrReports")} />
      <Tabs defaultValue="att">
        <TabsList>
          <TabsTrigger value="att">{t("attendanceReport")}</TabsTrigger>
          <TabsTrigger value="pay">{t("payrollReport")}</TabsTrigger>
        </TabsList>
        <TabsContent value="att"><AttTab start={start} end={end} setStart={setStart} setEnd={setEnd} branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
        <TabsContent value="pay"><PayTab year={year} setYear={setYear} month={month} setMonth={setMonth} branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
      </Tabs>
    </div>
  );
}

function AttTab({ start, end, setStart, setEnd, branchId, lang, t }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("attendance").select("staff_id, status, working_hours, date, profiles!attendance_staff_id_fkey(full_name)").gte("date", start).lte("date", end);
    if (branchId) q = q.eq("branch_id", branchId);
    q.then(({ data }) => setRows(data ?? []));
  }, [start, end, branchId]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; present: number; absent: number; late: number; hours: number }>();
    rows.forEach((r) => {
      const cur = map.get(r.staff_id) ?? { name: r.profiles?.full_name ?? "—", present: 0, absent: 0, late: 0, hours: 0 };
      if (r.status === "present") cur.present += 1;
      else if (r.status === "absent") cur.absent += 1;
      else if (r.status === "late") cur.late += 1;
      cur.hours += Number(r.working_hours || 0);
      map.set(r.staff_id, cur);
    });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [rows]);

  const trend = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.date, (map.get(r.date) ?? 0) + (r.status === "present" || r.status === "late" ? 1 : 0)));
    return Array.from(map.entries()).sort().map(([date, count]) => ({ date, count }));
  }, [rows]);

  const cols = [{ header: t("staff"), key: "name" }, { header: t("present"), key: "present" }, { header: t("absent"), key: "absent" }, { header: t("late"), key: "late" }, { header: t("hours"), key: "hours" }];
  const expRows = grouped.map((g) => ({ name: g.name, present: g.present, absent: g.absent, late: g.late, hours: g.hours.toFixed(1) }));

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("attendanceReport"), columns: cols, rows: expRows, lang })}
        onExcel={() => exportReportExcel({ title: t("attendanceReport"), columns: cols, rows: expRows })} />
      <Card><CardContent className="pt-6">
        <div style={{ width: "100%", height: 220 }}><ResponsiveContainer><LineChart data={trend}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip />
          <Line type="monotone" dataKey="count" stroke={CHART_COLORS[0]} strokeWidth={2} />
        </LineChart></ResponsiveContainer></div>
      </CardContent></Card>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("staff")}</TableHead><TableHead>{t("present")}</TableHead>
          <TableHead>{t("absent")}</TableHead><TableHead>{t("late")}</TableHead><TableHead>{t("hours")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{grouped.map((g) => (
          <TableRow key={g.id}><TableCell>{g.name}</TableCell><TableCell>{g.present}</TableCell>
          <TableCell>{g.absent}</TableCell><TableCell>{g.late}</TableCell><TableCell>{g.hours.toFixed(1)}</TableCell></TableRow>
        ))}{!grouped.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function PayTab({ year, setYear, month, setMonth, branchId, lang, t }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("payroll").select("staff_id, base_salary, overtime_amount, bonuses, deductions, net_salary, profiles!payroll_staff_id_fkey(full_name)").eq("period_year", year).eq("period_month", month);
    if (branchId) q = q.eq("branch_id", branchId);
    q.then(({ data }) => setRows(data ?? []));
  }, [year, month, branchId]);

  const total = rows.reduce((s, r: any) => s + Number(r.net_salary || 0), 0);
  const cols = [{ header: t("staff"), key: "name" }, { header: t("base"), key: "base" }, { header: t("overtime"), key: "ot" }, { header: t("deductions"), key: "ded" }, { header: t("net"), key: "net" }];
  const expRows = rows.map((r: any) => ({
    name: r.profiles?.full_name ?? "—",
    base: Number(r.base_salary || 0).toFixed(2),
    ot: (Number(r.overtime_amount || 0) + Number(r.bonuses || 0)).toFixed(2),
    ded: Number(r.deductions || 0).toFixed(2),
    net: Number(r.net_salary || 0).toFixed(2),
  }));

  return (
    <div className="space-y-4 mt-4">
      <Card><CardContent className="pt-6 flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">{t("year")}</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" /></div>
        <div><Label className="text-xs">{t("month")}</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-24" /></div>
        <div className="ms-auto flex gap-2">
          <button className="text-sm underline" onClick={() => exportReportPDF({ title: t("payrollReport"), subtitle: `${year}-${month}`, columns: cols, rows: expRows, summary: [{ label: t("totalPayroll"), value: formatMoney(total, lang) }], lang })}>PDF</button>
          <button className="text-sm underline" onClick={() => exportReportExcel({ title: t("payrollReport"), columns: cols, rows: expRows, summary: [{ label: t("totalPayroll"), value: formatMoney(total, lang) }] })}>Excel</button>
        </div>
      </CardContent></Card>
      <StatCard label={t("totalPayroll")} value={formatMoney(total, lang)} />
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("staff")}</TableHead><TableHead className="text-end">{t("base")}</TableHead>
          <TableHead className="text-end">{t("overtime")}</TableHead>
          <TableHead className="text-end">{t("deductions")}</TableHead>
          <TableHead className="text-end">{t("net")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map((r: any, i) => (
          <TableRow key={i}>
            <TableCell>{r.profiles?.full_name ?? "—"}</TableCell>
            <TableCell className="text-end">{formatMoney(r.base_salary, lang)}</TableCell>
            <TableCell className="text-end">{formatMoney(Number(r.overtime_amount || 0) + Number(r.bonuses || 0), lang)}</TableCell>
            <TableCell className="text-end">{formatMoney(r.deductions, lang)}</TableCell>
            <TableCell className="text-end font-semibold">{formatMoney(r.net_salary, lang)}</TableCell>
          </TableRow>
        ))}{!rows.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}