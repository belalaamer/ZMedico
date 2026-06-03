import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDataSync } from "@/lib/dataSync";
import { Plus, CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDateTime } from "@/lib/format";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { RowActions } from "@/components/RowActions";

export default function Payments() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const prefillInvoice = searchParams.get("invoice") || undefined;
  const prefillPatient = searchParams.get("patient") || undefined;
  const prefillAmount = searchParams.get("amount");

  useEffect(() => {
    if (prefillInvoice || prefillPatient) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillInvoice, prefillPatient]);

  const clearPrefill = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("invoice"); next.delete("patient"); next.delete("amount");
    setSearchParams(next, { replace: true });
  };

  const load = async () => {
    let q = supabase.from("payments")
      .select("*, patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code), invoices(invoice_number)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(200);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setItems(data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId]);
  useDataSync(["payments", "invoices"], () => { load(); });

  const softDelete = async (p: any): Promise<void> => {
    const { error } = await supabase.from("payments").update({ deleted_at: new Date().toISOString() } as any).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    // Treasury reversal & invoice recalc happen automatically via DB trigger.
    toast.success(t("delete")); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("payments")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} {t("payments").toLowerCase()}</p>
        </div>
        <Button className="gradient-primary text-primary-foreground" onClick={() => setOpen(true)}>
          <Plus className="me-2 size-4" />{t("recordPayment")}
        </Button>
      </div>

      <Card className="shadow-card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noPayments")}</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((p) => {
              const pt = p.patients;
              const name = lang === "ar"
                ? `${pt?.first_name_ar ?? pt?.first_name_en ?? ""} ${pt?.last_name_ar ?? pt?.last_name_en ?? ""}`.trim()
                : `${pt?.first_name_en ?? ""} ${pt?.last_name_en ?? ""}`.trim();
              return (
                <div key={p.id} className="flex items-center gap-4 p-4">
                  <div className="size-10 rounded-lg bg-success/15 text-success flex items-center justify-center">
                    <CreditCard className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{name} <span className="text-xs text-muted-foreground">#{pt?.patient_code}</span></div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(p.created_at, lang)} · {t(p.payment_method as any) ?? p.payment_method}
                      {p.invoices?.invoice_number ? ` · ${p.invoices.invoice_number}` : ""}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="font-semibold tabular-nums text-success">{formatMoney(p.amount, lang)}</div>
                    {p.reference_number && <Badge variant="outline" className="text-[10px] mt-1">{p.reference_number}</Badge>}
                  </div>
                  <RowActions canEdit={false} onDelete={() => softDelete(p)} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <RecordPaymentDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) clearPrefill(); }}
        onSaved={() => { setOpen(false); clearPrefill(); load(); }}
        invoiceId={prefillInvoice ?? null}
        patientId={prefillPatient}
        defaultAmount={prefillAmount ? Number(prefillAmount) : undefined}
      />
    </div>
  );
}