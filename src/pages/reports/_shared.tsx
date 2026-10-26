import { ReactNode, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { CanExport } from "@/components/CanExport";
import { toast } from "sonner";

export function ExportButtons({
  onPdf, onExcel,
}: {
  onPdf?: () => void | Promise<unknown>; onExcel?: () => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<null | "pdf" | "excel">(null);

  // A PDF export rasterises the whole table with html2canvas after loading an
  // Arabic webfont, so it can run for seconds. The buttons used to stay live the
  // whole time: a second click started a second export and downloaded the same
  // report twice, and a failed export rejected with no message at all.
  const run = async (kind: "pdf" | "excel", fn?: () => void | Promise<unknown>) => {
    if (!fn || busy) return;
    setBusy(kind);
    try {
      await fn();
    } catch {
      toast.error(t("backupExportFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {onPdf && (
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void run("pdf", onPdf)}>
          {busy === "pdf" ? <Loader2 className="size-4 me-1 animate-spin" /> : <Download className="size-4 me-1" />}
          {busy === "pdf" ? t("exporting") : "PDF"}
        </Button>
      )}
      {onExcel && (
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void run("excel", onExcel)}>
          {busy === "excel" ? <Loader2 className="size-4 me-1 animate-spin" /> : <FileSpreadsheet className="size-4 me-1" />}
          {busy === "excel" ? t("exporting") : "Excel"}
        </Button>
      )}
    </>
  );
}

export function ReportFilterBar({
  start, end, setStart, setEnd, extra, onPdf, onExcel, module = "reports",
}: {
  start: string; end: string;
  setStart: (v: string) => void; setEnd: (v: string) => void;
  extra?: ReactNode;
  onPdf?: () => void | Promise<unknown>; onExcel?: () => void | Promise<unknown>;
  /** Permission module used to gate export/print buttons. */
  module?: string;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="pt-6 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">{t("fromDate")}</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">{t("toDate")}</Label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" />
        </div>
        {extra}
        <div className="ms-auto flex gap-2">
          <CanExport module={module}>
            <ExportButtons onPdf={onPdf} onExcel={onExcel} />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4 me-1" />{t("print")}</Button>
          </CanExport>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function ReportPageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}