import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, CreditCard, X, Copy, Download, MessageCircle, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { RecordPaymentDialog } from "../payments/RecordPaymentDialog";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { useAuth } from "@/contexts/AuthContext";
import { openWhatsApp, invoiceWhatsAppMessage } from "@/lib/whatsapp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const { user } = useAuth();
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
    // Restore inventory for product items first
    if (inv.status !== "draft" && inv.branch_id) {
      const productItems = items.filter((it: any) => it.item_type === "product" && it.product_id);
      for (const it of productItems) {
        const qty = Number(it.quantity) || 0;
        if (qty > 0) {
          const { error: txErr } = await (supabase as any).rpc("apply_inventory_tx", {
            _product_id: it.product_id,
            _branch_id: inv.branch_id,
            _type: "return",
            _signed_qty: qty,
            _unit_cost: null,
            _ref_type: "invoice_cancel",
            _ref_id: inv.id,
            _notes_en: `Cancelled invoice ${inv.invoice_number}`,
            _notes_ar: `إلغاء فاتورة ${inv.invoice_number}`,
            _expiry: null,
            _batch: null,
            _by: user?.id ?? null,
          });
          if (txErr) toast.error(txErr.message);
        }
      }
      if (productItems.length) toast.success(t("inventoryRestored"));
    }
    const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cancelled");
    load();
  };

  const downloadPdf = async () => {
    let branch = null;
    if (inv.branch_id) {
      const { data } = await supabase.from("branches").select("name_en,name_ar,address,phone").eq("id", inv.branch_id).maybeSingle();
      branch = data;
    }
    generateInvoicePdf({ invoice: inv, items, payments: pays, patient: inv.patients, branch, lang, t: t as any });
  };

  const sendWhatsApp = () => {
    if (!p?.phone) {
      toast.error(lang === "ar" ? "لا يوجد رقم هاتف للمريض" : "Patient has no phone number");
      return;
    }
    const msg = invoiceWhatsAppMessage({
      patientName: name,
      invoiceNumber: inv.invoice_number,
      total: formatMoney(inv.total, lang),
      remaining: formatMoney(remaining, lang),
      lang,
      link: window.location.href,
    });
    if (!openWhatsApp(p.phone, msg)) toast.error(lang === "ar" ? "رقم هاتف غير صالح" : "Invalid phone number");
  };

  const updateClaimStatus = async (status: string) => {
    const patch: any = { claim_status: status };
    if (status === "submitted") patch.claim_submitted_at = new Date().toISOString();
    if (status === "approved" || status === "rejected" || status === "paid") patch.claim_resolved_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(patch).eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success(t("save")); load();
  };

  const printInvoice = async () => {
    let branch = null;
    if (inv.branch_id) {
      const { data } = await supabase.from("branches").select("name_en,name_ar,address,phone").eq("id", inv.branch_id).maybeSingle();
      branch = data;
    }
    generateInvoicePdf({ invoice: inv, items, payments: pays, patient: inv.patients, branch, lang, mode: "print", t: t as any });
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
          <Button variant="outline" onClick={printInvoice}><Printer className="me-2 size-4" />{t("print")}</Button>
          <Button variant="outline" onClick={downloadPdf}><Download className="me-2 size-4" />{t("downloadPdf")}</Button>
          <Button variant="outline" onClick={sendWhatsApp} className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200 dark:bg-green-950/30 dark:hover:bg-green-900/40 dark:text-green-300 dark:border-green-900">
            <MessageCircle className="me-2 size-4"/>WhatsApp
          </Button>
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

      {inv.insurance_company_id && (
        <Card className="shadow-card p-6 print:hidden">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="size-4 text-primary" />
            <h2 className="font-semibold">{lang === "ar" ? "مطالبة التأمين" : "Insurance Claim"}</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{lang === "ar" ? "حالة المطالبة" : "Claim status"}</div>
              <Select value={inv.claim_status ?? "none"} onValueChange={updateClaimStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{lang === "ar" ? "لا يوجد" : "None"}</SelectItem>
                  <SelectItem value="pending">{lang === "ar" ? "قيد التحضير" : "Pending"}</SelectItem>
                  <SelectItem value="submitted">{lang === "ar" ? "مُقدَّمة" : "Submitted"}</SelectItem>
                  <SelectItem value="approved">{lang === "ar" ? "موافَق عليها" : "Approved"}</SelectItem>
                  <SelectItem value="rejected">{lang === "ar" ? "مرفوضة" : "Rejected"}</SelectItem>
                  <SelectItem value="paid">{lang === "ar" ? "مدفوعة" : "Paid"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              {inv.claim_number && <div className="flex justify-between"><span className="text-muted-foreground">{lang === "ar" ? "رقم المطالبة" : "Claim #"}</span><span className="font-medium">{inv.claim_number}</span></div>}
              {Number(inv.claim_amount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{lang === "ar" ? "مبلغ المطالبة" : "Claim amount"}</span><span className="tabular-nums">{formatMoney(inv.claim_amount, lang)}</span></div>}
              {inv.claim_submitted_at && <div className="flex justify-between"><span className="text-muted-foreground">{lang === "ar" ? "تاريخ التقديم" : "Submitted"}</span><span>{formatDateTime(inv.claim_submitted_at, lang)}</span></div>}
              {inv.claim_resolved_at && <div className="flex justify-between"><span className="text-muted-foreground">{lang === "ar" ? "تاريخ الحل" : "Resolved"}</span><span>{formatDateTime(inv.claim_resolved_at, lang)}</span></div>}
            </div>
          </div>
        </Card>
      )}

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