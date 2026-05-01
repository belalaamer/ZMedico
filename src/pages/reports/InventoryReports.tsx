import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatMoney, formatDate } from "@/lib/format";
import { ReportPageHeader, StatCard } from "./_shared";
import { exportReportPDF, exportReportExcel } from "@/lib/reportExport";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InventoryReports() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  return (
    <div className="space-y-4">
      <ReportPageHeader title={t("inventoryReports")} />
      <Tabs defaultValue="value">
        <TabsList>
          <TabsTrigger value="value">{t("stockValueReport")}</TabsTrigger>
          <TabsTrigger value="low">{t("lowStockReport")}</TabsTrigger>
          <TabsTrigger value="exp">{t("expiryReport")}</TabsTrigger>
        </TabsList>
        <TabsContent value="value"><StockValueTab branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
        <TabsContent value="low"><LowStockTab branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
        <TabsContent value="exp"><ExpiryTab branchId={currentBranchId} lang={lang} t={t} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ExportBar({ onPdf, onExcel, t }: any) {
  return (
    <Card><CardContent className="pt-6 flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={onPdf}><Download className="size-4 me-1" />PDF</Button>
      <Button variant="outline" size="sm" onClick={onExcel}><FileSpreadsheet className="size-4 me-1" />Excel</Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4 me-1" />{t("print")}</Button>
    </CardContent></Card>
  );
}

function StockValueTab({ branchId, lang, t }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("inventory").select("quantity, products(name_en, name_ar, cost_price, product_categories(name_en, name_ar))");
    if (branchId) q = q.eq("branch_id", branchId);
    q.then(({ data }) => setRows(data ?? []));
  }, [branchId]);

  const enriched = rows.map((r: any) => ({
    name: lang === "ar" ? r.products?.name_ar : r.products?.name_en,
    cat: lang === "ar" ? r.products?.product_categories?.name_ar ?? "—" : r.products?.product_categories?.name_en ?? "—",
    qty: Number(r.quantity || 0),
    cost: Number(r.products?.cost_price || 0),
    value: Number(r.quantity || 0) * Number(r.products?.cost_price || 0),
  }));
  const total = enriched.reduce((s, r) => s + r.value, 0);
  const cols = [{ header: t("product"), key: "name" }, { header: t("category"), key: "cat" }, { header: t("qty"), key: "qty" }, { header: t("cost"), key: "cost" }, { header: t("valueAmt"), key: "value" }];
  const expRows = enriched.map((r) => ({ ...r, cost: r.cost.toFixed(2), value: r.value.toFixed(2) }));

  return (
    <div className="space-y-4 mt-4">
      <ExportBar t={t} onPdf={() => exportReportPDF({ title: t("stockValueReport"), columns: cols, rows: expRows, summary: [{ label: t("totalValue"), value: formatMoney(total, lang) }], lang })}
        onExcel={() => exportReportExcel({ title: t("stockValueReport"), columns: cols, rows: expRows, summary: [{ label: t("totalValue"), value: formatMoney(total, lang) }] })} />
      <StatCard label={t("totalValue")} value={formatMoney(total, lang)} />
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("product")}</TableHead><TableHead>{t("category")}</TableHead>
          <TableHead className="text-end">{t("qty")}</TableHead>
          <TableHead className="text-end">{t("cost")}</TableHead>
          <TableHead className="text-end">{t("valueAmt")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{enriched.map((r, i) => (
          <TableRow key={i}><TableCell>{r.name}</TableCell><TableCell>{r.cat}</TableCell>
          <TableCell className="text-end">{r.qty}</TableCell>
          <TableCell className="text-end">{formatMoney(r.cost, lang)}</TableCell>
          <TableCell className="text-end font-medium">{formatMoney(r.value, lang)}</TableCell></TableRow>
        ))}{!enriched.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function LowStockTab({ branchId, lang, t }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("inventory").select("quantity, products(name_en, name_ar, min_stock_level, max_stock_level)");
    if (branchId) q = q.eq("branch_id", branchId);
    q.then(({ data }) => {
      const filtered = (data ?? []).filter((r: any) => Number(r.quantity || 0) <= Number(r.products?.min_stock_level || 0));
      setRows(filtered);
    });
  }, [branchId]);

  const enriched = rows.map((r: any) => ({
    name: lang === "ar" ? r.products?.name_ar : r.products?.name_en,
    current: Number(r.quantity || 0),
    min: Number(r.products?.min_stock_level || 0),
    reorder: Math.max(0, Number(r.products?.max_stock_level || r.products?.min_stock_level || 0) - Number(r.quantity || 0)),
  }));
  const cols = [{ header: t("product"), key: "name" }, { header: t("currentQty"), key: "current" }, { header: t("minQty"), key: "min" }, { header: t("reorderQty"), key: "reorder" }];

  return (
    <div className="space-y-4 mt-4">
      <ExportBar t={t} onPdf={() => exportReportPDF({ title: t("lowStockReport"), columns: cols, rows: enriched, lang })}
        onExcel={() => exportReportExcel({ title: t("lowStockReport"), columns: cols, rows: enriched })} />
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("product")}</TableHead>
          <TableHead className="text-end">{t("currentQty")}</TableHead>
          <TableHead className="text-end">{t("minQty")}</TableHead>
          <TableHead className="text-end">{t("reorderQty")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{enriched.map((r, i) => (
          <TableRow key={i}><TableCell>{r.name}</TableCell>
          <TableCell className="text-end text-destructive font-medium">{r.current}</TableCell>
          <TableCell className="text-end">{r.min}</TableCell>
          <TableCell className="text-end">{r.reorder}</TableCell></TableRow>
        ))}{!enriched.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function ExpiryTab({ branchId, lang, t }: any) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    const end = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    let q = supabase.from("inventory_transactions")
      .select("quantity, expiry_date, batch_number, products(name_en, name_ar, expiry_tracking)")
      .not("expiry_date", "is", null).lte("expiry_date", end).eq("transaction_type", "purchase");
    if (branchId) q = q.eq("branch_id", branchId);
    q.then(({ data }) => setRows((data ?? []).filter((r: any) => r.products?.expiry_tracking)));
  }, [days, branchId]);

  const enriched = rows.map((r: any) => ({
    name: lang === "ar" ? r.products?.name_ar : r.products?.name_en,
    batch: r.batch_number ?? "—", expiry: r.expiry_date, qty: Number(r.quantity || 0),
  }));
  const cols = [{ header: t("product"), key: "name" }, { header: t("batchNo"), key: "batch" }, { header: t("expiryCol"), key: "expiry" }, { header: t("qty"), key: "qty" }];

  return (
    <div className="space-y-4 mt-4">
      <Card><CardContent className="pt-6 flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">{t("daysUntilExpiry")}</Label><Input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-32" /></div>
        <div className="ms-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportReportPDF({ title: t("expiryReport"), columns: cols, rows: enriched, lang })}><Download className="size-4 me-1" />PDF</Button>
          <Button variant="outline" size="sm" onClick={() => exportReportExcel({ title: t("expiryReport"), columns: cols, rows: enriched })}><FileSpreadsheet className="size-4 me-1" />Excel</Button>
        </div>
      </CardContent></Card>
      <Card><CardContent className="pt-6 overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead>{t("product")}</TableHead><TableHead>{t("batchNo")}</TableHead>
          <TableHead>{t("expiryCol")}</TableHead><TableHead className="text-end">{t("qty")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{enriched.map((r, i) => (
          <TableRow key={i}><TableCell>{r.name}</TableCell><TableCell className="font-mono text-xs">{r.batch}</TableCell>
          <TableCell>{formatDate(r.expiry, lang)}</TableCell><TableCell className="text-end">{r.qty}</TableCell></TableRow>
        ))}{!enriched.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}