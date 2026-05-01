import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

export function TransferDialog({
  open, onOpenChange, treasuries, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  treasuries: Array<{ id: string; name_en: string; name_ar: string; current_balance: number; currency?: string }>;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setFromId(""); setToId(""); setAmount(0); setNote(""); };
  const fromTr = treasuries.find((x) => x.id === fromId);

  const submit = async () => {
    if (!fromId || !toId) { toast.error(t("selectTreasury")); return; }
    if (fromId === toId) { toast.error(t("sameTreasuryError")); return; }
    if (!amount || amount <= 0) { toast.error(t("amount")); return; }
    setSaving(true);
    const fromName = lang === "ar" ? fromTr?.name_ar : fromTr?.name_en;
    const toTr = treasuries.find((x) => x.id === toId);
    const toName = lang === "ar" ? toTr?.name_ar : toTr?.name_en;
    const refId = crypto.randomUUID();
    const descEn = `Transfer to ${toTr?.name_en}${note ? ` — ${note}` : ""}`;
    const descAr = `تحويل إلى ${toTr?.name_ar}${note ? ` — ${note}` : ""}`;
    const descEn2 = `Transfer from ${fromTr?.name_en}${note ? ` — ${note}` : ""}`;
    const descAr2 = `تحويل من ${fromTr?.name_ar}${note ? ` — ${note}` : ""}`;

    const { error: e1 } = await supabase.rpc("add_treasury_tx", {
      _treasury_id: fromId, _type: "expense", _amount: amount,
      _ref_type: "transfer", _ref_id: refId,
      _desc_en: descEn, _desc_ar: descAr, _by: user?.id ?? null,
    } as any);
    if (e1) { setSaving(false); toast.error(e1.message); return; }
    const { error: e2 } = await supabase.rpc("add_treasury_tx", {
      _treasury_id: toId, _type: "income", _amount: amount,
      _ref_type: "transfer", _ref_id: refId,
      _desc_en: descEn2, _desc_ar: descAr2, _by: user?.id ?? null,
    } as any);
    setSaving(false);
    if (e2) { toast.error(e2.message); return; }
    toast.success(t("transferSuccess"));
    reset();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("transferFunds")}</DialogTitle>
          <DialogDescription>{t("transferDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-2">
              <Label>{t("fromTreasury")}</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger><SelectValue placeholder={t("selectTreasury")} /></SelectTrigger>
                <SelectContent>
                  {treasuries.map((tr) => <SelectItem key={tr.id} value={tr.id}>{lang === "ar" ? tr.name_ar : tr.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="size-5 text-muted-foreground mb-3 rtl:rotate-180" />
            <div className="space-y-2">
              <Label>{t("toTreasury")}</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger><SelectValue placeholder={t("selectTreasury")} /></SelectTrigger>
                <SelectContent>
                  {treasuries.filter((x) => x.id !== fromId).map((tr) => <SelectItem key={tr.id} value={tr.id}>{lang === "ar" ? tr.name_ar : tr.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {fromTr && (
            <div className="text-xs text-muted-foreground">
              {t("balance")}: <span className="tabular-nums font-medium">{formatMoney(fromTr.current_balance, lang, fromTr.currency)}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label>{t("amount")}</Label>
            <Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>{t("notes")}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>{t("cancel")}</Button>
          <Button className="gradient-primary text-primary-foreground" onClick={submit} disabled={saving}>{t("confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}