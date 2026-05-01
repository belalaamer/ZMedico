import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

export function ReportFilterBar({
  start, end, setStart, setEnd, extra, onPdf, onExcel,
}: {
  start: string; end: string;
  setStart: (v: string) => void; setEnd: (v: string) => void;
  extra?: ReactNode;
  onPdf?: () => void; onExcel?: () => void;
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
          {onPdf && <Button variant="outline" size="sm" onClick={onPdf}><Download className="size-4 me-1" />PDF</Button>}
          {onExcel && <Button variant="outline" size="sm" onClick={onExcel}><FileSpreadsheet className="size-4 me-1" />Excel</Button>}
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4 me-1" />{t("print")}</Button>
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