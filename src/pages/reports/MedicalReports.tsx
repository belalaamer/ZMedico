import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatMoney } from "@/lib/format";
import { ReportFilterBar, ReportPageHeader } from "./_shared";
import { defaultDateRange, exportReportPDF, exportReportExcel, CHART_COLORS } from "@/lib/reportExport";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";

export default function MedicalReports() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const dr = defaultDateRange(30);
  const [start, setStart] = useState(dr.start);
  const [end, setEnd] = useState(dr.end);

  return (
    <div className="space-y-4">
      <ReportPageHeader title={t("medicalReports")} />
      <Tabs defaultValue="dx">
        <TabsList>
          <TabsTrigger value="dx">{t("diagnosesReport")}</TabsTrigger>
          <TabsTrigger value="proc">{t("proceduresReport")}</TabsTrigger>
        </TabsList>
        <TabsContent value="dx"><DxTab start={start} end={end} setStart={setStart} setEnd={setEnd} lang={lang} t={t} branchId={currentBranchId} /></TabsContent>
        <TabsContent value="proc"><ProcTab start={start} end={end} setStart={setStart} setEnd={setEnd} lang={lang} t={t} branchId={currentBranchId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function DxTab({ start, end, setStart, setEnd, lang, t, branchId }: any) {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      // record_diagnoses has no branch_id of its own — branch scope is
      // derived through the parent medical record, matching the RESTRICTIVE
      // RLS policy. Without this, a multi-branch user's report aggregated
      // every accessible branch into figures that read as branch-specific.
      let q = supabase.from("record_diagnoses")
        .select("diagnoses(name_en, name_ar, code), medical_records!inner(visit_date,branch_id)")
        .gte("medical_records.visit_date", start).lte("medical_records.visit_date", end);
      if (branchId) q = q.eq("medical_records.branch_id", branchId);
      const { data } = await q;
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        const k = lang === "ar" ? r.diagnoses?.name_ar : r.diagnoses?.name_en;
        if (k) map.set(k, (map.get(k) ?? 0) + 1);
      });
      const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
      setData(Array.from(map.entries()).map(([name, count]) => ({ name, count, pct: total ? ((count / total) * 100).toFixed(1) : "0" })).sort((a, b) => b.count - a.count));
    })();
  }, [start, end, lang, branchId]);

  const cols = [{ header: t("diagnosisLabel"), key: "name" }, { header: t("count"), key: "count" }, { header: "%", key: "pct" }];

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar module="reports_medical" start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("diagnosesReport"), columns: cols, rows: data, lang })}
        onExcel={() => exportReportExcel({ title: t("diagnosesReport"), columns: cols, rows: data })} />
      <Card><CardContent className="pt-6">
        <div className="text-sm font-medium mb-2">{t("topDiagnoses")}</div>
        <div style={{ width: "100%", height: 280 }}><ResponsiveContainer><BarChart data={data.slice(0, 10)} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis dataKey="name" type="category" width={140} /><Tooltip />
          <Bar dataKey="count" fill={CHART_COLORS[0]} />
        </BarChart></ResponsiveContainer></div>
      </CardContent></Card>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("diagnosisLabel")}</TableHead><TableHead>{t("count")}</TableHead><TableHead>%</TableHead>
        </TableRow></TableHeader>
        <TableBody>{data.map((d, i) => (
          <TableRow key={i}><TableCell>{d.name}</TableCell><TableCell>{d.count}</TableCell><TableCell>{d.pct}%</TableCell></TableRow>
        ))}{!data.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function ProcTab({ start, end, setStart, setEnd, lang, t, branchId }: any) {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      // Same indirection as DxTab: scope through the parent medical record.
      let q = supabase.from("record_procedures")
        .select("quantity, procedures(name_en, name_ar, default_price), medical_records!inner(visit_date,branch_id)")
        .gte("medical_records.visit_date", start).lte("medical_records.visit_date", end);
      if (branchId) q = q.eq("medical_records.branch_id", branchId);
      const { data } = await q;
      const map = new Map<string, { count: number; revenue: number }>();
      (data ?? []).forEach((r: any) => {
        const k = lang === "ar" ? r.procedures?.name_ar : r.procedures?.name_en; if (!k) return;
        const cur = map.get(k) ?? { count: 0, revenue: 0 };
        cur.count += Number(r.quantity || 0);
        cur.revenue += Number(r.quantity || 0) * Number(r.procedures?.default_price || 0);
        map.set(k, cur);
      });
      setData(Array.from(map.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count));
    })();
  }, [start, end, lang, branchId]);

  const cols = [{ header: t("procedureLabel"), key: "name" }, { header: t("count"), key: "count" }, { header: t("revenue"), key: "revenue" }];
  const expRows = data.map((d) => ({ name: d.name, count: d.count, revenue: d.revenue.toFixed(2) }));

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar module="reports_medical" start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("proceduresReport"), columns: cols, rows: expRows, lang })}
        onExcel={() => exportReportExcel({ title: t("proceduresReport"), columns: cols, rows: expRows })} />
      <Card><CardContent className="pt-6">
        <div style={{ width: "100%", height: 280 }}><ResponsiveContainer><PieChart>
          <Pie data={data.slice(0, 8)} dataKey="count" nameKey="name" outerRadius={100} label>
            {data.slice(0, 8).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie><Legend /><Tooltip />
        </PieChart></ResponsiveContainer></div>
      </CardContent></Card>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("procedureLabel")}</TableHead><TableHead>{t("count")}</TableHead><TableHead className="text-end">{t("revenue")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{data.map((d, i) => (
          <TableRow key={i}><TableCell>{d.name}</TableCell><TableCell>{d.count}</TableCell><TableCell className="text-end">{formatMoney(d.revenue, lang)}</TableCell></TableRow>
        ))}{!data.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}
