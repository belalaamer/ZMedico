import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatMoney, formatDate } from "@/lib/format";
import { patientDisplayName } from "@/lib/patientName";
import { ReportFilterBar, ReportPageHeader } from "./_shared";
import { defaultDateRange, exportReportPDF, exportReportExcel, ageBucket, CHART_COLORS } from "@/lib/reportExport";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { DollarSign, CheckCircle2, Clock, TrendingUp, Users, AlertTriangle, Receipt, Wallet, TrendingDown, PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "destructive" | "sky" | "muted";

const toneStyles: Record<Tone, { wrap: string; icon: string; value: string }> = {
  primary:     { wrap: "bg-primary/5 border-primary/20",           icon: "bg-primary/10 text-primary",                       value: "text-foreground" },
  success:     { wrap: "bg-emerald-500/5 border-emerald-500/20",   icon: "bg-emerald-500/10 text-emerald-600",               value: "text-emerald-600" },
  warning:     { wrap: "bg-amber-500/5 border-amber-500/20",       icon: "bg-amber-500/10 text-amber-600",                   value: "text-amber-600" },
  destructive: { wrap: "bg-destructive/5 border-destructive/20",   icon: "bg-destructive/10 text-destructive",               value: "text-destructive" },
  sky:         { wrap: "bg-sky-500/5 border-sky-500/20",           icon: "bg-sky-500/10 text-sky-600",                       value: "text-sky-600" },
  muted:       { wrap: "bg-muted/40 border-border",                icon: "bg-muted text-muted-foreground",                   value: "text-foreground" },
};

function KpiCard({
  label, value, tone = "primary", icon: Icon, hero = false, sublabel,
}: { label: string; value: string; tone?: Tone; icon?: any; hero?: boolean; sublabel?: string }) {
  const s = toneStyles[tone];
  return (
    <Card className={cn("border shadow-sm transition-all hover:shadow-md", s.wrap)}>
      <CardContent className={cn("flex items-center gap-4", hero ? "p-6" : "p-5")}>
        {Icon && (
          <div className={cn("shrink-0 rounded-xl flex items-center justify-center", s.icon, hero ? "w-14 h-14" : "w-11 h-11")}>
            <Icon className={hero ? "w-7 h-7" : "w-5 h-5"} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className={cn("tabular-nums font-black leading-tight mt-1", s.value, hero ? "text-4xl md:text-5xl" : "text-2xl")}>
            {value}
          </div>
          {sublabel && <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

const stickyHead = "sticky top-0 bg-muted/80 backdrop-blur z-10 border-b";

export default function FinancialReports() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const dr = defaultDateRange(30);
  const [start, setStart] = useState(dr.start);
  const [end, setEnd] = useState(dr.end);

  return (
    <div className="space-y-5">
      <ReportPageHeader title={t("financialReports")} />
      <Tabs defaultValue="revenue">
        <TabsList className="flex-wrap bg-muted/50 p-1 rounded-xl h-auto gap-1">
          <TabsTrigger value="revenue" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground font-medium">{t("revenueReport")}</TabsTrigger>
          <TabsTrigger value="collection" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground font-medium">{t("collectionReport")}</TabsTrigger>
          <TabsTrigger value="outstanding" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground font-medium">{t("outstandingReport")}</TabsTrigger>
          <TabsTrigger value="expense" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground font-medium">{t("expenseReport")}</TabsTrigger>
          <TabsTrigger value="pl" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground font-medium">{t("profitLoss")}</TabsTrigger>
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
      .select("id, invoice_number, invoice_date, total, paid_amount, status, patients(first_name_en, last_name_en, first_name_ar, last_name_ar, name_language)")
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
    patient: r.patients ? patientDisplayName(r.patients, lang) : "—",
    status: r.status, amount: Number(r.total || 0).toFixed(2),
  }));
  const summary = [
    { label: t("totalRevenue"), value: formatMoney(total, lang) },
    { label: t("paid"), value: formatMoney(paid, lang) },
    { label: t("pending"), value: formatMoney(total - paid, lang) },
  ];

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar module="reports_finance" start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("revenueReport"), subtitle: `${start} → ${end}`, columns: cols, rows: exportRows, summary, lang })}
        onExcel={() => exportReportExcel({ title: t("revenueReport"), columns: cols, rows: exportRows, summary })} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label={t("totalRevenue")} value={formatMoney(total, lang)} tone="primary" icon={DollarSign} />
        <KpiCard label={t("paid")} value={formatMoney(paid, lang)} tone="success" icon={CheckCircle2} />
        <KpiCard label={t("pending")} value={formatMoney(total - paid, lang)} tone="warning" icon={Clock} />
      </div>
      <Card className="shadow-sm"><CardContent className="pt-6">
        <div className="text-sm font-medium mb-2">{t("revenueTrend")}</div>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer><LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" /><YAxis /><Tooltip />
            <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} />
          </LineChart></ResponsiveContainer>
        </div>
      </CardContent></Card>
      <Card className="shadow-sm"><CardContent className="pt-6 overflow-x-auto max-h-[560px]">
        <Table><TableHeader><TableRow className={stickyHead}>
          <TableHead>{t("date")}</TableHead><TableHead>{t("invoice")}</TableHead>
          <TableHead>{t("patient")}</TableHead><TableHead>{t("status")}</TableHead>
          <TableHead className="text-end">{t("amount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="hover:bg-muted/40 transition-colors">
              <TableCell>{formatDate(r.invoice_date, lang)}</TableCell>
              <TableCell className="font-mono text-xs">{r.invoice_number}</TableCell>
              <TableCell>{r.patients ? patientDisplayName(r.patients, lang) : "—"}</TableCell>
              <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{r.status}</span></TableCell>
              <TableCell className="text-end tabular-nums font-semibold">{formatMoney(r.total, lang)}</TableCell>
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
    let q = supabase.from("payments")
      .select("amount, payment_method, patient_id, patients(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code)")
      .is("deleted_at", null).gte("payment_date", start).lte("payment_date", end);
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

  const byCustomer = useMemo(() => {
    const map = new Map<string, { name: string; code: any; methods: Map<string, number>; total: number }>();
    rows.forEach((r: any) => {
      const pid = r.patient_id || "—";
      const p = r.patients;
      const name = p ? patientDisplayName(p, lang) : "—";
      const cur = map.get(pid) ?? { name, code: p?.patient_code ?? "", methods: new Map<string, number>(), total: 0 };
      const m = r.payment_method || "cash";
      cur.methods.set(m, (cur.methods.get(m) ?? 0) + Number(r.amount || 0));
      cur.total += Number(r.amount || 0);
      map.set(pid, cur);
    });
    return Array.from(map.values())
      .map((c) => ({ ...c, methodsList: Array.from(c.methods.entries()).map(([m, a]) => ({ m, a })) }))
      .sort((a, b) => b.total - a.total);
  }, [rows, lang]);

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const cols = [{ header: t("method"), key: "method" }, { header: t("count"), key: "count" }, { header: t("amount"), key: "amount" }];
  const expRows = grouped.map((g) => ({ method: g.method, count: g.count, amount: g.amount.toFixed(2) }));

  const customerCols = [
    { header: t("patient"), key: "patient" },
    { header: t("method"), key: "methods" },
    { header: t("amount"), key: "total" },
  ];
  const customerRows = byCustomer.map((c) => ({
    patient: `${c.name}${c.code ? ` #${c.code}` : ""}`,
    methods: c.methodsList.map((x) => `${t(x.m as any) ?? x.m}: ${x.a.toFixed(2)}`).join(" · "),
    total: c.total.toFixed(2),
  }));

  return (
    <div className="space-y-4 mt-4">
      <ReportFilterBar module="reports_finance" start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("collectionReport"), subtitle: `${start} → ${end}`, columns: customerCols, rows: customerRows, summary: [{ label: t("totalCollected"), value: formatMoney(total, lang) }], lang })}
        onExcel={() => exportReportExcel({ title: t("collectionReport"), columns: customerCols, rows: customerRows, summary: [{ label: t("totalCollected"), value: formatMoney(total, lang) }] })} />
      <KpiCard label={t("totalCollected")} value={formatMoney(total, lang)} tone="success" icon={Wallet} hero />
      <Card className="shadow-sm"><CardContent className="pt-6">
        <div className="text-sm font-medium mb-2">{t("byMethod")}</div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer><PieChart>
            <Pie data={grouped} dataKey="amount" nameKey="method" outerRadius={90} label>
              {grouped.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie><Legend /><Tooltip />
          </PieChart></ResponsiveContainer>
        </div>
      </CardContent></Card>
      <Card className="shadow-sm"><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow className={stickyHead}>
          <TableHead>{t("method")}</TableHead><TableHead>{t("count")}</TableHead><TableHead className="text-end">{t("amount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{grouped.map((g) => (
          <TableRow key={g.method} className="hover:bg-muted/40 transition-colors"><TableCell className="capitalize font-medium">{(t(g.method as any) ?? g.method)}</TableCell><TableCell className="tabular-nums">{g.count}</TableCell><TableCell className="text-end tabular-nums font-semibold">{formatMoney(g.amount, lang)}</TableCell></TableRow>
        ))}{!grouped.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
      <Card className="shadow-sm"><CardContent className="pt-6 overflow-x-auto max-h-[560px]">
        <div className="text-sm font-medium mb-3">{lang === "ar" ? "حسب العميل" : "By Customer"}</div>
        <Table><TableHeader><TableRow className={stickyHead}>
          <TableHead>{t("patient")}</TableHead>
          <TableHead>{t("method")}</TableHead>
          <TableHead className="text-end">{t("amount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{byCustomer.map((c, i) => (
          <TableRow key={i} className="hover:bg-muted/40 transition-colors">
            <TableCell className="font-medium">{c.name}{c.code ? <span className="text-xs text-muted-foreground ms-1">#{c.code}</span> : null}</TableCell>
            <TableCell className="text-xs">{c.methodsList.map((x, j) => (
              <span key={j} className="inline-block me-2">{(t(x.m as any) ?? x.m)}: <span className="font-medium tabular-nums">{formatMoney(x.a, lang)}</span></span>
            ))}</TableCell>
            <TableCell className="text-end font-bold tabular-nums text-primary">{formatMoney(c.total, lang)}</TableCell>
          </TableRow>
        ))}{!byCustomer.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function OutstandingTab({ branchId, lang, t }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("invoices")
      .select("id, invoice_number, invoice_date, total, paid_amount, status, patients(first_name_en, last_name_en, first_name_ar, last_name_ar, name_language)")
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
    patient: e.patients ? patientDisplayName(e.patients, lang) : "—",
    age: e.age, bucket: e.bucket, amount: e.outstanding.toFixed(2),
  }));

  return (
    <div className="space-y-4 mt-4">
      <Card className="shadow-sm"><CardContent className="pt-6 flex justify-end gap-2">
        <button className="text-sm underline" onClick={() => exportReportPDF({ title: t("outstandingReport"), columns: cols, rows: expRows, summary: [{ label: t("totalOutstanding"), value: formatMoney(total, lang) }], lang })}>PDF</button>
        <button className="text-sm underline" onClick={() => exportReportExcel({ title: t("outstandingReport"), columns: cols, rows: expRows })}>Excel</button>
      </CardContent></Card>
      <KpiCard label={t("totalOutstanding")} value={formatMoney(total, lang)} tone="destructive" icon={AlertTriangle} hero
        sublabel={lang === "ar" ? "الإجمالي المستحق حالياً" : "Total currently owed"} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {buckets.map((b, i) => {
          const tones: Tone[] = ["success", "sky", "warning", "destructive"];
          return <KpiCard key={b.bucket} label={b.bucket} value={formatMoney(b.amount, lang)} tone={tones[i]} />;
        })}
      </div>
      <Card className="shadow-sm"><CardContent className="pt-6 overflow-x-auto max-h-[560px]">
        <Table><TableHeader><TableRow className={stickyHead}>
          <TableHead>{t("invoice")}</TableHead><TableHead>{t("patient")}</TableHead>
          <TableHead>{t("ageDays")}</TableHead><TableHead>{t("ageBucket")}</TableHead>
          <TableHead className="text-end">{t("amount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{enriched.map((e) => (
          <TableRow key={e.id} className="hover:bg-muted/40 transition-colors">
            <TableCell className="font-mono text-xs">{e.invoice_number}</TableCell>
            <TableCell className="font-medium">{e.patients ? patientDisplayName(e.patients, lang) : "—"}</TableCell>
            <TableCell className="tabular-nums">{e.age}</TableCell>
            <TableCell><span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
              e.bucket === "0-30" && "bg-emerald-500/10 text-emerald-600",
              e.bucket === "31-60" && "bg-sky-500/10 text-sky-600",
              e.bucket === "61-90" && "bg-amber-500/10 text-amber-600",
              e.bucket === "90+" && "bg-destructive/10 text-destructive",
            )}>{e.bucket}</span></TableCell>
            <TableCell className="text-end tabular-nums font-bold text-destructive">{formatMoney(e.outstanding, lang)}</TableCell>
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
      <ReportFilterBar module="reports_finance" start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("expenseReport"), subtitle: `${start} → ${end}`, columns: cols, rows: expRows, summary: [{ label: t("totalExpenses"), value: formatMoney(total, lang) }], lang })}
        onExcel={() => exportReportExcel({ title: t("expenseReport"), columns: cols, rows: expRows })} />
      <KpiCard label={t("totalExpenses")} value={formatMoney(total, lang)} tone="warning" icon={Receipt} hero />
      <Card className="shadow-sm"><CardContent className="pt-6">
        <div className="text-sm font-medium mb-2 text-center">{t("byCategory")}</div>
        <div style={{ width: "100%", height: 280 }} className="mx-auto">
          <ResponsiveContainer><BarChart data={byCat}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="category" /><YAxis /><Tooltip />
            <Bar dataKey="amount" fill={CHART_COLORS[1]} />
          </BarChart></ResponsiveContainer>
        </div>
      </CardContent></Card>
      <Card className="shadow-sm"><CardContent className="pt-6 overflow-x-auto max-h-[560px]">
        <Table><TableHeader><TableRow className={stickyHead}>
          <TableHead>{t("date")}</TableHead><TableHead>{t("category")}</TableHead><TableHead className="text-end">{t("amount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map((r: any) => (
          <TableRow key={r.id} className="hover:bg-muted/40 transition-colors">
            <TableCell>{formatDate(r.expense_date, lang)}</TableCell>
            <TableCell className="font-medium">{lang === "ar" ? (r.expense_categories?.name_ar ?? "—") : (r.expense_categories?.name_en ?? "—")}</TableCell>
            <TableCell className="text-end tabular-nums font-semibold">{formatMoney(r.amount, lang)}</TableCell>
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
      <ReportFilterBar module="reports_finance" start={start} end={end} setStart={setStart} setEnd={setEnd}
        onPdf={() => exportReportPDF({ title: t("profitLoss"), subtitle: `${start} → ${end}`, columns: cols, rows: expRows, lang })}
        onExcel={() => exportReportExcel({ title: t("profitLoss"), columns: cols, rows: expRows })} />
      <Card className={cn("border-2 shadow-lg", net >= 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-destructive/10 border-destructive/30")}>
        <CardContent className="p-6 flex items-center gap-5">
          <div className={cn("shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center",
            net >= 0 ? "bg-emerald-500/20 text-emerald-600" : "bg-destructive/20 text-destructive")}>
            {net >= 0 ? <PiggyBank className="w-8 h-8" /> : <TrendingDown className="w-8 h-8" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {net >= 0 ? (lang === "ar" ? "صافي الربح" : "Net Profit") : (lang === "ar" ? "صافي الخسارة" : "Net Loss")}
            </div>
            <div className={cn("text-4xl md:text-5xl font-black tabular-nums leading-tight mt-1",
              net >= 0 ? "text-emerald-600" : "text-destructive")}>
              {formatMoney(net, lang)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{start} → {end}</div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label={t("totalRevenue")} value={formatMoney(revenue, lang)} tone="success" icon={TrendingUp} />
        <KpiCard label={t("cogs")} value={formatMoney(cogs, lang)} tone="muted" icon={Receipt} />
        <KpiCard label={t("totalExpenses")} value={formatMoney(expenses, lang)} tone="warning" icon={Wallet} />
      </div>
      <Card className="shadow-sm"><CardContent className="pt-6">
        <Table>
          <TableBody>
            <TableRow className="hover:bg-transparent">
              <TableCell className="font-semibold text-foreground">{t("totalRevenue")}</TableCell>
              <TableCell className="text-end tabular-nums font-semibold text-emerald-600">{formatMoney(revenue, lang)}</TableCell>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableCell className="ps-8 text-muted-foreground italic">− {t("cogs")}</TableCell>
              <TableCell className="text-end tabular-nums text-muted-foreground italic">({formatMoney(cogs, lang)})</TableCell>
            </TableRow>
            <TableRow className="border-t-2 border-foreground/30 hover:bg-muted/30">
              <TableCell className="font-bold uppercase text-xs tracking-wide">{t("grossProfit")}</TableCell>
              <TableCell className="text-end font-bold tabular-nums">{formatMoney(gross, lang)}</TableCell>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableCell className="ps-8 text-muted-foreground italic">− {t("totalExpenses")}</TableCell>
              <TableCell className="text-end tabular-nums text-muted-foreground italic">({formatMoney(expenses, lang)})</TableCell>
            </TableRow>
            <TableRow className="border-t-4 border-double border-foreground/50 hover:bg-transparent">
              <TableCell className="font-black text-base uppercase tracking-wider">{t("netProfit")}</TableCell>
              <TableCell className={cn("text-end font-black text-lg tabular-nums", net >= 0 ? "text-emerald-600" : "text-destructive")}>
                {formatMoney(net, lang)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}