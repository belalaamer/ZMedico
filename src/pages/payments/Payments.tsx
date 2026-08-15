import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDataSync } from "@/lib/dataSync";
import { Plus, CreditCard, Banknote, Wallet, Shield, Landmark, Smartphone } from "lucide-react";
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
import { TablePager } from "@/components/TablePager";
import { Can } from "@/components/Can";

const PAGE_SIZE = 50;

const methodStyle = (m: string): { badge: string; icon: string; Icon: any } => {
  const key = (m || "").toLowerCase();
  if (key.includes("cash")) return { badge: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400", icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", Icon: Banknote };
  if (key.includes("visa") || key.includes("card")) return { badge: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400", icon: "bg-blue-500/10 text-blue-600 dark:text-blue-400", Icon: CreditCard };
  if (key.includes("insurance")) return { badge: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-400", icon: "bg-purple-500/10 text-purple-600 dark:text-purple-400", Icon: Shield };
  if (key.includes("wallet") || key.includes("instapay") || key.includes("vodafone") || key.includes("fawry")) return { badge: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/30 dark:text-fuchsia-400", icon: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400", Icon: Smartphone };
  if (key.includes("bank") || key.includes("transfer")) return { badge: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400", icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400", Icon: Landmark };
  return { badge: "bg-muted text-muted-foreground border-border", icon: "bg-success/10 text-success", Icon: Wallet };
};

export default function Payments() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
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
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from("payments")
      .select("*, patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code), invoices(invoice_number)", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false }).range(from, to);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data, error, count } = await q;
    if (error) { toast.error(error.message); return; }
    setItems(data ?? []);
    setTotal(count ?? 0);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId, page]);
  useEffect(() => { setPage(0); }, [currentBranchId]);
  useDataSync(["payments", "invoices"], () => { load(); });

  const softDelete = async (p: any): Promise<void> => {
    const { error } = await supabase.from("payments").update({ deleted_at: new Date().toISOString() } as any).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    // Treasury reversal & invoice recalc happen automatically via DB trigger.
    toast.success(t("delete")); load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("payments")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{items.length} {t("payments").toLowerCase()}</p>
      </div>

      <div className="bg-card border shadow-sm rounded-lg p-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 ps-2 text-sm text-muted-foreground">
          <Wallet className="size-4 text-primary" />
          <span className="font-medium text-foreground">{t("payments")}</span>
          <span className="text-xs">· {total}</span>
        </div>
        <Can permission="invoices.create">
          <Button className="gradient-primary text-primary-foreground shadow-md hover:shadow-lg transition-shadow" onClick={() => setOpen(true)}>
            <Plus className="me-2 size-4" />{t("recordPayment")}
          </Button>
        </Can>
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
              const ms = methodStyle(p.payment_method);
              const MIcon = ms.Icon;
              const methodLabel = (t(p.payment_method as any) as string) ?? p.payment_method;
              return (
                <div key={p.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                  <div className={`size-11 rounded-lg flex items-center justify-center ${ms.icon}`}>
                    <MIcon className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{t("paymentDate")}: {formatDateTime(p.created_at, lang)}</span>
                      <Badge variant="outline" className={`text-[10px] font-medium ${ms.badge}`}>{methodLabel}</Badge>
                      {p.invoices?.invoice_number && (
                        <Badge variant="outline" className="text-[10px] font-mono bg-primary/5 text-primary border-primary/20">
                          #{p.invoices.invoice_number}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-lg font-bold tabular-nums text-success">{formatMoney(p.amount, lang)}</div>
                    {p.reference_number && <Badge variant="outline" className="text-[10px] mt-1">{p.reference_number}</Badge>}
                  </div>
                  <Can permission="treasury.delete">
                    <RowActions canEdit={false} onDelete={() => softDelete(p)} />
                  </Can>
                </div>
              );
            })}
          </div>
        )}
        <TablePager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
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
