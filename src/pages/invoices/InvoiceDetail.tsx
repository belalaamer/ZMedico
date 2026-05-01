import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, CreditCard, X, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { RecordPaymentDialog } from "../payments/RecordPaymentDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Inv = any;

const statusClass: Record<string, string> = {
  draft: "status-cancelled", pending: "status-review", paid: "status-completed", partial: "status-progress", cancelled: "status-departed",
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const [inv, setInv] = useState<Inv | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [pays, setPays] = useState<any[]>([]);
  const [payOpen, setPayOpen] = useState(false);

  const load = async () => {
    if (!id) return;
    const [{ data: i }, { data: it }, { data: ps }] = await Promise.all([
      supabase.from("invoices").select("*, patients(*)").eq("id", id).maybeSingle(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at"),
      supabase.from("payments").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
    ]);
    setInv(i); setItems(it ?? []); setPays(ps ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!inv) return <div className="text-center text-muted-foreground py-10">…</div>;

  const p = inv.patients;
  const name = lang === "ar"
    ? `${p?.first_name_ar ?? p?.first_name_en ?? ""} ${p?.last_name_ar ?? p?.last_name_en ?? ""}`.trim()
    : `${p?.first_name_en ?? ""} ${p?.last_name_en ?? ""}`.trim();
  const remaining = +(Number(inv.total) - Number(inv.paid_amount)).toFixed(2);
  const statusLabel = ({ draft: t("statusDraft"), pending: t("statusPending"), paid: t("statusPaid"), partial: t("statusPartial"), cancelled: t("statusCancelled") } as any)[inv.status];

  const cancelInvoice = async () => {
    const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cancelled");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <Button asChild variant="ghost" size="sm"><Link to="/invoices"><ArrowLeft className="me-2 size-4" />{t("invoices")}</Link></Button>
        <div className="flex gap-2">
          {inv.status !== "cancelled" && remaining > 0 && (
            <Button className="gradient-primary text-primary-foreground" onClick={() => setPayOpen(true)}>
              <CreditCard className="me-2 size-4" />{t("recordPayment")}
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}><Printer className="me-2 size-4" />{t("print")}</Button>
          {inv.status !== "cancelled" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline"><X className="me-2 size-4" />{t("cancelInvoice")}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("cancelInvoice")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("confirmCancelInvoice")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={cancelInvoice}>{t("confirm")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Card className="shadow-card p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-muted-foreground">{t("invoice")}</div>
            <div className="text-3xl font-bold tabular-nums">{inv.invoice_number}</div>
            <Badge variant="outline" className={`mt-2 ${statusClass[inv.status]}`}>{statusLabel}</Badge>
          </div>
          <div className="text-end">
            <div className="text-xs text-muted-foreground">{t("invoiceDate")}</div>
            <div className="font-medium">{formatDate(inv.invoice_date, lang)}</div>
            <div className="text-xs text-muted-foreground mt-2">{t("patientName")}</div>
            <div className="font-medium">{name} <span className="text-xs text-muted-foreground">#{p?.patient_code}</span></div>
          </div>
        </div>

        <div className="mt-8 border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-6">{t("description")}</div>
            <div className="col-span-2 text-end">{t("quantity")}</div>
            <div className="col-span-2 text-end">{t("unitPrice")}</div>
            <div className="col-span-2 text-end">{t("total")}</div>
          </div>
          {items.map((it) => (
            <div key={it.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-border text-sm">
              <div className="col-span-6">
                <div className="font-medium">{lang === "ar" ? (it.description_ar || it.description_en) : it.description_en}</div>
                {lang === "en" && it.description_ar && <div className="text-xs text-muted-foreground" dir="rtl">{it.description_ar}</div>}
              </div>
              <div className="col-span-2 text-end tabular-nums">{it.quantity}</div>
              <div className="col-span-2 text-end tabular-nums">{formatMoney(it.unit_price, lang)}</div>
              <div className="col-span-2 text-end tabular-nums font-medium">{formatMoney(it.total, lang)}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid sm:grid-cols-2 gap-6">
          <div>
            {inv.notes && (
              <>
                <div className="text-xs text-muted-foreground mb-1">{t("notes")}</div>
                <div className="text-sm whitespace-pre-wrap">{inv.notes}</div>
              </>
            )}
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("subtotal")}</span><span className="tabular-nums">{formatMoney(inv.subtotal, lang)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("discount")}</span><span className="tabular-nums">- {formatMoney(inv.discount, lang)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("tax")}</span><span className="tabular-nums">+ {formatMoney(inv.tax, lang)}</span></div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>{t("total")}</span><span className="tabular-nums text-primary">{formatMoney(inv.total, lang)}</span></div>
            <div className="flex justify-between text-success"><span>{t("paid")}</span><span className="tabular-nums">{formatMoney(inv.paid_amount, lang)}</span></div>
            <div className="flex justify-between text-warning font-semibold"><span>{t("remaining")}</span><span className="tabular-nums">{formatMoney(remaining, lang)}</span></div>
          </div>
        </div>
      </Card>

      <Card className="shadow-card p-6 print:hidden">
        <h2 className="font-semibold mb-3">{t("payments")}</h2>
        {pays.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("noPayments")}</div>
        ) : (
          <div className="divide-y divide-border">
            {pays.map((pay) => (
              <div key={pay.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium tabular-nums">{formatMoney(pay.amount, lang)}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(pay.created_at, lang)} · {t(pay.payment_method as any) ?? pay.payment_method}</div>
                </div>
                {pay.reference_number && <Badge variant="outline" className="text-[10px]">{pay.reference_number}</Badge>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <RecordPaymentDialog
        open={payOpen} onOpenChange={setPayOpen}
        invoiceId={inv.id} patientId={inv.patient_id}
        defaultAmount={remaining}
        onSaved={() => { setPayOpen(false); load(); }}
      />
    </div>
  );
}