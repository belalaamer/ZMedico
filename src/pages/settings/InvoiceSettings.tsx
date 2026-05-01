import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function InvoiceSettings() {
  const { t, lang } = useI18n();
  const { branches, currentBranchId } = useBranch();
  const [branchId, setBranchId] = useState(currentBranchId ?? "");
  const [f, setF] = useState<any>({
    invoice_prefix: "INV", invoice_suffix: "", invoice_start_number: 1, reset_number_yearly: true,
    default_tax_rate: 0, default_payment_terms_days: 0,
    show_logo_on_invoice: true, show_tax_id: true, show_payment_qr: false,
    invoice_notes_ar: "", invoice_notes_en: "", invoice_footer_ar: "", invoice_footer_en: "",
    terms_conditions_ar: "", terms_conditions_en: "",
  });
  useEffect(() => {
    if (!branchId) return;
    supabase.from("invoice_settings").select("*").eq("branch_id", branchId).maybeSingle()
      .then(({ data }) => { if (data) setF({ ...f, ...data }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);
  const save = async () => {
    if (!branchId) return toast.error(t("branch"));
    const { error } = await supabase.from("invoice_settings").upsert({ ...f, branch_id: branchId }, { onConflict: "branch_id" });
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
  };
  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold">{t("invoiceSettings")}</h1>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-56"><SelectValue placeholder={t("branch")} /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Card className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><Label>{t("invoicePrefix")}</Label><Input value={f.invoice_prefix} onChange={e => setF({ ...f, invoice_prefix: e.target.value })} /></div>
          <div><Label>{t("invoiceSuffix")}</Label><Input value={f.invoice_suffix ?? ""} onChange={e => setF({ ...f, invoice_suffix: e.target.value })} /></div>
          <div><Label>{t("invoiceStartNumber")}</Label><Input type="number" value={f.invoice_start_number} onChange={e => setF({ ...f, invoice_start_number: +e.target.value })} /></div>
          <div><Label>{t("defaultTaxRate")} (%)</Label><Input type="number" step="0.01" value={f.default_tax_rate} onChange={e => setF({ ...f, default_tax_rate: +e.target.value })} /></div>
          <div><Label>{t("defaultPaymentTermsDays")}</Label><Input type="number" value={f.default_payment_terms_days} onChange={e => setF({ ...f, default_payment_terms_days: +e.target.value })} /></div>
          <div className="flex items-center justify-between rounded-lg border p-3"><Label>{t("resetNumberYearly")}</Label><Switch checked={!!f.reset_number_yearly} onCheckedChange={v => setF({ ...f, reset_number_yearly: v })} /></div>
          <div className="flex items-center justify-between rounded-lg border p-3"><Label>{t("showLogoOnInvoice")}</Label><Switch checked={!!f.show_logo_on_invoice} onCheckedChange={v => setF({ ...f, show_logo_on_invoice: v })} /></div>
          <div className="flex items-center justify-between rounded-lg border p-3"><Label>{t("showTaxId")}</Label><Switch checked={!!f.show_tax_id} onCheckedChange={v => setF({ ...f, show_tax_id: v })} /></div>
          <div className="flex items-center justify-between rounded-lg border p-3"><Label>{t("showPaymentQr")}</Label><Switch checked={!!f.show_payment_qr} onCheckedChange={v => setF({ ...f, show_payment_qr: v })} /></div>
          <div className="sm:col-span-2"><Label>{t("invoiceNotes")} (AR)</Label><Textarea dir="rtl" value={f.invoice_notes_ar ?? ""} onChange={e => setF({ ...f, invoice_notes_ar: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>{t("invoiceNotes")} (EN)</Label><Textarea value={f.invoice_notes_en ?? ""} onChange={e => setF({ ...f, invoice_notes_en: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>{t("invoiceFooter")} (AR)</Label><Input dir="rtl" value={f.invoice_footer_ar ?? ""} onChange={e => setF({ ...f, invoice_footer_ar: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>{t("termsConditions")} (AR)</Label><Textarea dir="rtl" value={f.terms_conditions_ar ?? ""} onChange={e => setF({ ...f, terms_conditions_ar: e.target.value })} /></div>
          <div className="sm:col-span-2 flex justify-end"><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></div>
        </Card>
      </div>
    </SettingsLayout>
  );
}