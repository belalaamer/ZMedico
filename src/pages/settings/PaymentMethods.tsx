import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit3, Power } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TYPES = ["cash","card","bank_transfer","wallet","insurance","other"] as const;

export default function PaymentMethods() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setE] = useState<any>(null);
  const [f, setF] = useState<any>({ name_en: "", name_ar: "", code: "", type: "cash", requires_reference: false, processing_fee_percentage: 0, processing_fee_fixed: 0, display_order: 0, is_active: true });

  const load = async () => {
    const { data } = await supabase.from("payment_methods").select("*").order("display_order");
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setE(null); setF({ name_en: "", name_ar: "", code: "", type: "cash", requires_reference: false, processing_fee_percentage: 0, processing_fee_fixed: 0, display_order: items.length, is_active: true }); setOpen(true); };
  const openEdit = (m: any) => { setE(m); setF({ ...m }); setOpen(true); };
  const save = async () => {
    if (!f.name_en || !f.name_ar || !f.code) return toast.error("required");
    const payload = { name_en: f.name_en, name_ar: f.name_ar, code: f.code, type: f.type, requires_reference: f.requires_reference, processing_fee_percentage: f.processing_fee_percentage, processing_fee_fixed: f.processing_fee_fixed, display_order: f.display_order, is_active: f.is_active };
    const { error } = edit ? await supabase.from("payment_methods").update(payload).eq("id", edit.id) : await supabase.from("payment_methods").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("saved")); setOpen(false); load();
  };
  const toggle = async (m: any) => { await supabase.from("payment_methods").update({ is_active: !m.is_active }).eq("id", m.id); load(); };

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("paymentMethods")}</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground" onClick={openNew}><Plus className="me-2 size-4" />{t("addPaymentMethod")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{edit ? t("edit") : t("addPaymentMethod")}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>{t("nameEn2")}</Label><Input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} /></div>
                <div><Label>{t("nameAr2")}</Label><Input dir="rtl" value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} /></div>
                <div><Label>{t("methodCode")}</Label><Input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /></div>
                <div><Label>{t("methodType")}</Label>
                  <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>{t("processingFeePct")}</Label><Input type="number" step="0.01" value={f.processing_fee_percentage} onChange={e => setF({ ...f, processing_fee_percentage: +e.target.value })} /></div>
                <div><Label>{t("processingFeeFixed")}</Label><Input type="number" step="0.01" value={f.processing_fee_fixed} onChange={e => setF({ ...f, processing_fee_fixed: +e.target.value })} /></div>
                <div><Label>{t("displayOrder")}</Label><Input type="number" value={f.display_order} onChange={e => setF({ ...f, display_order: +e.target.value })} /></div>
                <div className="flex items-center justify-between rounded-lg border p-3"><Label>{t("requiresReference")}</Label><Switch checked={!!f.requires_reference} onCheckedChange={v => setF({ ...f, requires_reference: v })} /></div>
              </div>
              <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Card className="overflow-hidden">
          <div className="divide-y">
            {items.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{lang === "ar" ? m.name_ar : m.name_en}</div>
                    <Badge variant="outline">{m.code}</Badge>
                    <Badge variant="outline">{m.type}</Badge>
                    <Badge variant="outline" className={m.is_active ? "status-completed" : "status-departed"}>{m.is_active ? t("active") : t("inactive")}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{t("processingFeePct")}: {m.processing_fee_percentage}% · {t("processingFeeFixed")}: {m.processing_fee_fixed}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Edit3 className="size-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => toggle(m)}><Power className="size-4" /></Button>
              </div>
            ))}
            {items.length === 0 && <div className="p-8 text-center text-muted-foreground">{t("noData")}</div>}
          </div>
        </Card>
      </div>
    </SettingsLayout>
  );
}