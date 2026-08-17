import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, CreditCard, X, Copy, Download, MessageCircle, Shield, Receipt, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { notifyDataChange } from "@/lib/dataSync";
import { RecordPaymentDialog } from "../payments/RecordPaymentDialog";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { useAuth } from "@/contexts/AuthContext";
import { Can } from "@/components/Can";
import { openWhatsApp, invoiceWhatsAppMessage } from "@/lib/whatsapp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { reportClientError } from "@/lib/observability/reportError";
import { patientDisplayDirection, patientDisplayName } from "@/lib/patientName";

type Inv = any;

const statusClass: Record<string, string> = {
  draft: "status-cancelled", pending: "status-review", paid: "status-completed", partial: "status-progress", cancelled: "status-departed",
};

const statusAccent: Record<string, string> = {
  draft: "bg-muted",
  pending: "bg-warning",
  paid: "bg-emerald-500",
  partial: "bg-warning",
  cancelled: "bg-muted",
};

const statusIconTint: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-warning/10 text-warning",
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  partial: "bg-warning/10 text-warning",
  cancelled: "bg-muted text-muted-foreground",
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [inv, setInv] = useState<Inv | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [pays, setPays] = useState<any[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [coupon, setCoupon] = useState<{ code: string; amount: number } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = async () => {
    if (!id) return;
    const [{ data: i }, { data: it }, { data: ps }] = await Promise.all([
      supabase.from("invoices").select("*, patients(*)").eq("id", id).maybeSingle(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at"),
      supabase.from("payments").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
    ]);
    setInv(i); setItems(it ?? []); setPays(ps ?? []);
    const { data: cr } = await (supabase as any)
      .from("coupon_redemptions")
      .select("discount_amount, coupons(code)")
      .eq("invoice_id", id)
      .maybeSingle();
    if (cr) setCoupon({ code: cr.coupons?.code ?? "", amount: Number(cr.discount_amount) || 0 });
    else setCoupon(null);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!inv) return <div className="text-center text-muted-foreground py-10">…</div>;

  const p = inv.patients;
  const name = patientDisplayName(p, lang);
  const nameDirection = patientDisplayDirection(p, lang);
  const remaining = +(Number(inv.total) - Number(inv.paid_amount)).toFixed(2);
  const statusLabel = ({ draft: t("statusDraft"), pending: t("statusPending"), paid: t("statusPaid"), partial: t("statusPartial"), cancelled: t("statusCancelled") } as any)[inv.status];

  const cancelInvoice = async () => {
    // Atomic void: cancels invoice + soft-deletes payments + restores stock + cancels commissions.
    const { error } = await (supabase as any).rpc("void_invoice_financials", {
      _invoice_id: inv.id,
      _user_id: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    notifyDataChange("invoices");
    notifyDataChange("inventory");
    notifyDataChange("payments");
    notifyDataChange("doctor_commissions");
    toast.success(lang === "ar" ? "تم إلغاء الفاتورة" : "Invoice cancelled");
    load();
  };

  const loadClinicLogo = async (): Promise<string | null> => {
    const { data } = await (supabase as any).rpc("get_clinic_logo", { _branch_id: inv.branch_id ?? null });
    const url: string | undefined = (data as string | null) ?? undefined;
    if (!url) return null;
    if (url.startsWith("data:")) return url;
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return url;
    }
  };

  const runPdfAction = async (mode: "download" | "print") => {
    setPdfLoading(true);
    try {
      let branch = null;
      if (inv.branch_id) {
        const { data, error } = await supabase
          .from("branches")
          .select("name_en,name_ar,address,phone")
          .eq("id", inv.branch_id)
          .maybeSingle();
        if (error) throw error;
        branch = data;
      }

      const logoUrl = await loadClinicLogo();
      await generateInvoicePdf({
        invoice: inv,
        items,
        payments: pays,
        patient: inv.patients,
        branch,
        logoUrl,
        lang,
        mode,
        t: t as any,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(
        lang === "ar"
          ? "تعذر إنشاء ملف الفاتورة. حاول مرة أخرى أو استخدم الطباعة."
          : "Could not generate the invoice file. Try again, or use Print."
      );
      void reportClientError({
        kind: "error",
        message: `invoice pdf failed: ${message}`,
        component: "InvoiceDetail.pdf",
        branch_id: inv.branch_id ?? undefined,
      });
    } finally {
      setPdfLoading(false);
    }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <Button asChild variant="ghost" size="sm"><Link to="/invoices"><ArrowLeft className="me-2 size-4" />{t("invoices")}</Link></Button>
        <div className="flex gap-2">
          {inv.status !== "cancelled" && remaining > 0 && (
            <Can permission="invoices.create">
              <Button size="lg" className="gradient-primary text-primary-foreground shadow-md hover:shadow-lg transition-shadow font-semibold" onClick={() => setPayOpen(true)}>
                <CreditCard className="me-2 size-4" />{t("recordPayment")}
              </Button>
            </Can>
          )}
          <Button variant="outline" onClick={() => runPdfAction("print")} disabled={pdfLoading} aria-busy={pdfLoading}><Printer className="me-2 size-4" />{t("print")}</Button>
          <Button variant="outline" onClick={() => runPdfAction("download")} disabled={pdfLoading} aria-busy={pdfLoading}><Download className="me-2 size-4" />{t("downloadPdf")}</Button>
          <Button variant="outline" onClick={sendWhatsApp} className="bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#128C7E] border-[#25D366]/30 dark:text-[#25D366] dark:border-[#25D366]/40">
            <MessageCircle className="me-2 size-4"/>WhatsApp
          </Button>
          {inv.status !== "cancelled" && (
            <Can permission="invoices.delete">
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
            </Can>
          )}
        </div>
      </div>

      <Card className="shadow-card p-0 overflow-hidden print:shadow-none print:border-0 relative">
        <div className={`h-1 w-full ${statusAccent[inv.status] ?? "bg-muted"} print:hidden`} />
        <div className="p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className={`size-11 rounded-lg flex items-center justify-center ${statusIconTint[inv.status] ?? "bg-primary/10 text-primary"} print:hidden`}>
              <Receipt className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{t("invoice")}</div>
              <div className="text-3xl font-bold tabular-nums">{inv.invoice_number}</div>
              <Badge variant="outline" className={`mt-2 ${statusClass[inv.status]}`}>{statusLabel}</Badge>
            </div>
          </div>
          <div className="text-end">
            <div className="text-xs text-muted-foreground">{t("invoiceDate")}</div>
            <div className="font-medium">{formatDate(inv.invoice_date, lang)}</div>
            <div className="text-xs text-muted-foreground mt-2">{t("patientName")}</div>
            <div className="font-medium" dir={nameDirection}>{name}</div>
          </div>
        </div>

        <div className="mt-8 border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 bg-muted/60 rounded-t-md px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-6">{t("description")}</div>
            <div className="col-span-2 text-end">{t("quantity")}</div>
            <div className="col-span-2 text-end">{t("unitPrice")}</div>
            <div className="col-span-2 text-end">{t("total")}</div>
          </div>
          {items.map((it) => (
            <div key={it.id} className="grid grid-cols-12 gap-2 px-4 py-4 border-t border-border text-sm hover:bg-muted/20 transition-colors">
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
          <div className="space-y-2 text-sm rounded-lg bg-muted/30 p-4 border border-border">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("subtotal")}</span><span className="tabular-nums">{formatMoney(inv.subtotal, lang)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("discount")}</span><span className="tabular-nums">- {formatMoney(inv.discount, lang)}</span></div>
            {coupon && (
              <div className="flex justify-between"><span className="text-muted-foreground">{lang === "ar" ? `كوبون (${coupon.code})` : `Coupon (${coupon.code})`}</span><span className="tabular-nums text-success">- {formatMoney(coupon.amount, lang)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">{t("tax")}</span><span className="tabular-nums">+ {formatMoney(inv.tax, lang)}</span></div>
            <div className="flex justify-between border-t border-border pt-3 text-xl font-bold"><span>{t("total")}</span><span className="tabular-nums text-primary">{formatMoney(inv.total, lang)}</span></div>
            <div className="flex justify-between text-success text-sm"><span>{t("paid")}</span><span className="tabular-nums font-medium">{formatMoney(inv.paid_amount, lang)}</span></div>
            {remaining > 0 && inv.status !== "cancelled" ? (
              <div className="mt-3 text-2xl font-black text-warning bg-warning/10 border border-warning/20 px-4 py-3 rounded-lg flex items-center justify-between">
                <span className="uppercase tracking-wide text-xs font-bold">{t("remaining")}</span>
                <span className="tabular-nums">{formatMoney(remaining, lang)}</span>
              </div>
            ) : (
              <div className="mt-3 text-base font-semibold text-success bg-success/10 border border-success/20 px-4 py-2.5 rounded-lg flex items-center justify-between">
                <span className="uppercase tracking-wide text-xs font-bold">{t("remaining")}</span>
                <span className="tabular-nums">{formatMoney(remaining, lang)}</span>
              </div>
            )}
          </div>
        </div>
        </div>
      </Card>

      {inv.insurance_company_id && (
        <Card className="shadow-card p-6 print:hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Shield className="size-4" />
            </div>
            <div>
              <h2 className="font-semibold leading-tight">{lang === "ar" ? "مطالبة التأمين" : "Insurance Claim"}</h2>
              <div className="text-xs text-muted-foreground">{lang === "ar" ? "إدارة حالة المطالبة" : "Manage claim status"}</div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{lang === "ar" ? "حالة المطالبة" : "Claim status"}</div>
              <Can permission="invoices.edit">
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
              </Can>
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
        <div className="flex items-center gap-3 mb-4">
          <div className="size-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Wallet className="size-4" />
          </div>
          <div>
            <h2 className="font-semibold leading-tight">{t("payments")}</h2>
            <div className="text-xs text-muted-foreground">{pays.length} {lang === "ar" ? "معاملة" : pays.length === 1 ? "transaction" : "transactions"}</div>
          </div>
        </div>
        {pays.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">{t("noPayments")}</div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {pays.map((pay) => (
              <div key={pay.id} className="px-4 py-3 flex items-center justify-between text-sm hover:bg-muted/30 transition-colors">
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
