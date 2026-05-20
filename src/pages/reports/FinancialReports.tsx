import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatMoney, formatDate } from "@/lib/format";
import { ReportFilterBar, ReportPageHeader, StatCard } from "./_shared";
import { defaultDateRange, exportReportPDF, exportReportExcel, ageBucket, CHART_COLORS } from "@/lib/reportExport";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";

export default function FinancialReports() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const dr = defaultDateRange(30);
  const [start, setStart] = useState(dr.start);
  const [end, setEnd] = useState(dr.end);

  return (
    <div className="space-y-4">
      <ReportPageHeader title={t("financialReports")} />
      <Tabs defaultValue="revenue">
        <TabsList className="flex-wrap">
          <TabsTrigger value="revenue">{t("revenueReport")}</TabsTrigger>
          <TabsTrigger value="collection">{t("collectionReport")}</TabsTrigger>
          <TabsTrigger value="outstanding">{t("outstandingReport")}</TabsTrigger>
          <TabsTrigger value="expense">{t("expenseReport")}</TabsTrigger>
          <TabsTrigger value="pl">{t("profitLoss")}</TabsTrigger>
        </TabsList>
        <TabsContent value="revenue"><RevenueTab start={start} end={end} setStart={setStart} setEnd={setEnd} branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
        <TabsContent value="collection"><CollectionTab start={start} end={end} setStart={setStart} setEnd={setEnd} branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
        <TabsContent value="outstanding"><OutstandingTab branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
        <TabsContent value="expense"><ExpenseTab start={start} end={end} setStart={setStart} setEnd={setEnd} branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
        <TabsContent value="pl"><PLTab start={start} end={end} setStart={setStart} setEnd={setEnd} branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
      </Tabs>
    </div>
  );
}

function RevenueTab({ start, end, setStart, setEnd, branchId, lang, t }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("invoices")
      .select("id, invoice_number, invoice_date, total, paid_amount, status, patients(first_name_en, last_name_en, first_name_ar, last_name_ar)")
      .is("deleted_at", null)
      .gte("invoice_date", start).lte("invoice_date", end).order("invoice_date", { ascending: false });
    if (branchId) q = q.eq("branch_id", branchId);
    q.then(({ data }) => setRows(data ?? []));
  }, [start, end, branchId]);

  const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const paid = rows.reduce((s, r) => s + Number(r.paid_amount || 0), 0);

  const trend = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.invoice_date, (map.get(r.invoice_date) ?? 0) + Number(r.total || 0)));
    return Array.from(map.entries()).sort().map(([date, value]) => ({ date, value }));
  }, [rows]);

  const cols = [
    { header: t("date"), key: "date" }, { header: t("invoice"), key: "inv" },
    { header: t("patient"), key: "patient" }, { header: t("status"), key: "status" },
    { header: t("amount"), key: "amount" },
  ];
  const exportRows = rows.map((r) => ({
    date: r.invoice_date, inv: r.invoice_number,
    patient: lang === "ar" ? `${r.patients?.first_name_ar ?? ""} ${r.patients?.last_name_ar ?? ""}` : `${r.patients?.first_name_en ?? ""} ${r.patients?.last_name_en ?? ""}`,
    status: r.status, amount: Number(r.total || 0).toFixed(2),
  }));
  const summary = [
    { label: t("totalRevenue"), value: formatMoney(total, lang) },
    { label: t("paid"), value: formatMoney(paid, lang) },
    { label: t("pending"), value: formatMoney(total - paid, lang) },
  ];

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("revenueReport"), subtitle: `${start} → ${end}`, columns: cols, rows: exportRows, summary, lang })}
        onExcel={() => exportReportExcel({ title: t("revenueReport"), columns: cols, rows: exportRows, summary })} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label={t("totalRevenue")} value={formatMoney(total, lang)} />
        <StatCard label={t("paid")} value={formatMoney(paid, lang)} />
        <StatCard label={t("pending")} value={formatMoney(total - paid, lang)} />
      </div>
      <Card><CardContent className="pt-6">
        <div className="text-sm font-medium mb-2">{t("revenueTrend")}</div>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer><LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" /><YAxis /><Tooltip />
            <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} />
          </LineChart></ResponsiveContainer>
        </div>
      </CardContent></Card>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("date")}</TableHead><TableHead>{t("invoice")}</TableHead>
          <TableHead>{t("patient")}</TableHead><TableHead>{t("status")}</TableHead>
          <TableHead className="text-end">{t("amount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{formatDate(r.invoice_date, lang)}</TableCell>
              <TableCell className="font-mono text-xs">{r.invoice_number}</TableCell>
              <TableCell>{lang === "ar" ? `${r.patients?.first_name_ar ?? ""} ${r.patients?.last_name_ar ?? ""}` : `${r.patients?.first_name_en ?? ""} ${r.patients?.last_name_en ?? ""}`}</TableCell>
              <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{r.status}</span></TableCell>
              <TableCell className="text-end">{formatMoney(r.total, lang)}</TableCell>
            </TableRow>
          ))}
          {!rows.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}
        </TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function CollectionTab({ start, end, setStart, setEnd, branchId, lang, t }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("payments").select("amount, payment_method").is("deleted_at", null).gte("payment_date", start).lte("payment_date", end);
    if (branchId) q = q.eq("branch_id", branchId);
    q.then(({ data }) => setRows(data ?? []));
  }, [start, end, branchId]);

  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    rows.forEach((r) => {
      const m = r.payment_method || "cash";
      const cur = map.get(m) ?? { count: 0, amount: 0 };
      map.set(m, { count: cur.count + 1, amount: cur.amount + Number(r.amount || 0) });
    });
    return Array.from(map.entries()).map(([method, v]) => ({ method, ...v }));
  }, [rows]);
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const cols = [{ header: t("method"), key: "method" }, { header: t("count"), key: "count" }, { header: t("amount"), key: "amount" }];
  const expRows = grouped.map((g) => ({ method: g.method, count: g.count, amount: g.amount.toFixed(2) }));

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("collectionReport"), subtitle: `${start} → ${end}`, columns: cols, rows: expRows, summary: [{ label: t("totalCollected"), value: formatMoney(total, lang) }], lang })}
        onExcel={() => exportReportExcel({ title: t("collectionReport"), columns: cols, rows: expRows, summary: [{ label: t("totalCollected"), value: formatMoney(total, lang) }] })} />
      <StatCard label={t("totalCollected")} value={formatMoney(total, lang)} />
      <Card><CardContent className="pt-6">
        <div className="text-sm font-medium mb-2">{t("byMethod")}</div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer><PieChart>
            <Pie data={grouped} dataKey="amount" nameKey="method" outerRadius={90} label>
              {grouped.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie><Legend /><Tooltip />
          </PieChart></ResponsiveContainer>
        </div>
      </CardContent></Card>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("method")}</TableHead><TableHead>{t("count")}</TableHead><TableHead className="text-end">{t("amount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{grouped.map((g) => (
          <TableRow key={g.method}><TableCell className="capitalize">{g.method}</TableCell><TableCell>{g.count}</TableCell><TableCell className="text-end">{formatMoney(g.amount, lang)}</TableCell></TableRow>
        ))}{!grouped.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function OutstandingTab({ branchId, lang, t }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("invoices")
      .select("id, invoice_number, invoice_date, total, paid_amount, status, patients(first_name_en, last_name_en, first_name_ar, last_name_ar)")
      .is("deleted_at", null)
      .in("status", ["pending", "partial"]);
    if (branchId) q = q.eq("branch_id", branchId);
    q.then(({ data }) => setRows(data ?? []));
  }, [branchId]);

  const today = new Date();
  const enriched = rows.map((r) => {
    const days = Math.floor((today.getTime() - new Date(r.invoice_date).getTime()) / 86400000);
    return { ...r, age: days, bucket: ageBucket(days), outstanding: Number(r.total || 0) - Number(r.paid_amount || 0) };
  });
  const buckets = ["0-30", "31-60", "61-90", "90+"].map((b) => ({
    bucket: b, amount: enriched.filter((e) => e.bucket === b).reduce((s, e) => s + e.outstanding, 0),
  }));
  const total = enriched.reduce((s, e) => s + e.outstanding, 0);

  const cols = [
    { header: t("invoice"), key: "inv" }, { header: t("patient"), key: "patient" },
    { header: t("ageDays"), key: "age" }, { header: t("ageBucket"), key: "bucket" },
    { header: t("amount"), key: "amount" },
  ];
  const expRows = enriched.map((e) => ({
    inv: e.invoice_number,
    patient: lang === "ar" ? `${e.patients?.first_name_ar ?? ""} ${e.patients?.last_name_ar ?? ""}` : `${e.patients?.first_name_en ?? ""} ${e.patients?.last_name_en ?? ""}`,
    age: e.age, bucket: e.bucket, amount: e.outstanding.toFixed(2),
  }));

  return (
    <div className="space-y-4 mt-4">
      <Card><CardContent className="pt-6 flex justify-end gap-2">
        <button className="text-sm underline" onClick={() => exportReportPDF({ title: t("outstandingReport"), columns: cols, rows: expRows, summary: [{ label: t("totalOutstanding"), value: formatMoney(total, lang) }], lang })}>PDF</button>
        <button className="text-sm underline" onClick={() => exportReportExcel({ title: t("outstandingReport"), columns: cols, rows: expRows })}>Excel</button>
      </CardContent></Card>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {buckets.map((b) => <StatCard key={b.bucket} label={b.bucket} value={formatMoney(b.amount, lang)} />)}
      </div>
      <StatCard label={t("totalOutstanding")} value={formatMoney(total, lang)} />
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("invoice")}</TableHead><TableHead>{t("patient")}</TableHead>
          <TableHead>{t("ageDays")}</TableHead><TableHead>{t("ageBucket")}</TableHead>
          <TableHead className="text-end">{t("amount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{enriched.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="font-mono text-xs">{e.invoice_number}</TableCell>
            <TableCell>{lang === "ar" ? `${e.patients?.first_name_ar ?? ""} ${e.patients?.last_name_ar ?? ""}` : `${e.patients?.first_name_en ?? ""} ${e.patients?.last_name_en ?? ""}`}</TableCell>
            <TableCell>{e.age}</TableCell><TableCell>{e.bucket}</TableCell>
            <TableCell className="text-end">{formatMoney(e.outstanding, lang)}</TableCell>
          </TableRow>
        ))}{!enriched.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function ExpenseTab({ start, end, setStart, setEnd, branchId, lang, t }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("expenses").select("id, expense_date, amount, description_en, description_ar, expense_categories(name_en, name_ar)").is("deleted_at", null).gte("expense_date", start).lte("expense_date", end);
    if (branchId) q = q.eq("branch_id", branchId);
    q.then(({ data }) => setRows(data ?? []));
  }, [start, end, branchId]);

  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r: any) => {
      const c = lang === "ar" ? (r.expense_categories?.name_ar ?? "—") : (r.expense_categories?.name_en ?? "—");
      map.set(c, (map.get(c) ?? 0) + Number(r.amount || 0));
    });
    return Array.from(map.entries()).map(([category, amount]) => ({ category, amount }));
  }, [rows, lang]);
  const total = rows.reduce((s, r: any) => s + Number(r.amount || 0), 0);

  const cols = [{ header: t("date"), key: "date" }, { header: t("category"), key: "cat" }, { header: t("amount"), key: "amount" }];
  const expRows = rows.map((r: any) => ({
    date: r.expense_date, cat: lang === "ar" ? (r.expense_categories?.name_ar ?? "—") : (r.expense_categories?.name_en ?? "—"),
    amount: Number(r.amount || 0).toFixed(2),
  }));

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("expenseReport"), subtitle: `${start} → ${end}`, columns: cols, rows: expRows, summary: [{ label: t("totalExpenses"), value: formatMoney(total, lang) }], lang })}
        onExcel={() => exportReportExcel({ title: t("expenseReport"), columns: cols, rows: expRows })} />
      <StatCard label={t("totalExpenses")} value={formatMoney(total, lang)} />
      <Card><CardContent className="pt-6">
        <div className="text-sm font-medium mb-2">{t("byCategory")}</div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer><BarChart data={byCat}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="category" /><YAxis /><Tooltip />
            <Bar dataKey="amount" fill={CHART_COLORS[1]} />
          </BarChart></ResponsiveContainer>
        </div>
      </CardContent></Card>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("date")}</TableHead><TableHead>{t("category")}</TableHead><TableHead className="text-end">{t("amount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map((r: any) => (
          <TableRow key={r.id}>
            <TableCell>{formatDate(r.expense_date, lang)}</TableCell>
            <TableCell>{lang === "ar" ? (r.expense_categories?.name_ar ?? "—") : (r.expense_categories?.name_en ?? "—")}</TableCell>
            <TableCell className="text-end">{formatMoney(r.amount, lang)}</TableCell>
          </TableRow>
        ))}{!rows.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function PLTab({ start, end, setStart, setEnd, branchId, lang, t }: any) {
  const [revenue, setRevenue] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [cogs, setCogs] = useState(0);

  useEffect(() => {
    (async () => {
      let pq = supabase.from("payments").select("amount").is("deleted_at", null).gte("payment_date", start).lte("payment_date", end);
      if (branchId) pq = pq.eq("branch_id", branchId);
      const { data: pays } = await pq;
      setRevenue((pays ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0));

      let eq = supabase.from("expenses").select("amount").is("deleted_at", null).gte("expense_date", start).lte("expense_date", end);
      if (branchId) eq = eq.eq("branch_id", branchId);
      const { data: exps } = await eq;
      setExpenses((exps ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0));

      let iq = supabase.from("inventory_transactions").select("quantity, unit_cost").eq("transaction_type", "sale").gte("created_at", start).lte("created_at", end + "T23:59:59");
      if (branchId) iq = iq.eq("branch_id", branchId);
      const { data: invtx } = await iq;
      setCogs((invtx ?? []).reduce((s, r: any) => s + Math.abs(Number(r.quantity || 0)) * Number(r.unit_cost || 0), 0));
    })();
  }, [start, end, branchId]);

  const gross = revenue - cogs;
  const net = gross - expenses;

  const cols = [{ header: t("category"), key: "k" }, { header: t("amount"), key: "v" }];
  const expRows = [
    { k: t("totalRevenue"), v: revenue.toFixed(2) },
    { k: t("cogs"), v: cogs.toFixed(2) },
    { k: t("grossProfit"), v: gross.toFixed(2) },
    { k: t("totalExpenses"), v: expenses.toFixed(2) },
    { k: t("netProfit"), v: net.toFixed(2) },
  ];

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("profitLoss"), subtitle: `${start} → ${end}`, columns: cols, rows: expRows, lang })}
        onExcel={() => exportReportExcel({ title: t("profitLoss"), columns: cols, rows: expRows })} />
      <Card><CardContent className="pt-6">
        <Table>
          <TableBody>
            <TableRow><TableCell className="font-medium">{t("totalRevenue")}</TableCell><TableCell className="text-end">{formatMoney(revenue, lang)}</TableCell></TableRow>
            <TableRow><TableCell className="text-muted-foreground">{t("cogs")}</TableCell><TableCell className="text-end">({formatMoney(cogs, lang)})</TableCell></TableRow>
            <TableRow className="border-t-2"><TableCell className="font-semibold">{t("grossProfit")}</TableCell><TableCell className="text-end font-semibold">{formatMoney(gross, lang)}</TableCell></TableRow>
            <TableRow><TableCell className="text-muted-foreground">{t("totalExpenses")}</TableCell><TableCell className="text-end">({formatMoney(expenses, lang)})</TableCell></TableRow>
            <TableRow className="border-t-2"><TableCell className="font-bold text-base">{t("netProfit")}</TableCell><TableCell className={`text-end font-bold text-base ${net >= 0 ? "text-green-600" : "text-destructive"}`}>{formatMoney(net, lang)}</TableCell></TableRow>
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}