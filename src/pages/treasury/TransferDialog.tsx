import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

export function TransferDialog({
  open, onOpenChange, treasuries, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  treasuries: Array<{ id: string; name_en: string; name_ar: string; current_balance: number; currency: string }>;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const transferReferenceRef = useRef<string | null>(null);

  const reset = () => {
    transferReferenceRef.current = null;
    setFromId(""); setToId(""); setAmount(0); setNote("");
  };
  const fromTr = treasuries.find((x) => x.id === fromId);
  const toTr = treasuries.find((x) => x.id === toId);

  const submit = async () => {
    if (submittingRef.current) return;
    if (!fromId || !toId) { toast.error(t("selectTreasury")); return; }
    if (fromId === toId) { toast.error(t("sameTreasuryError")); return; }
    if (!fromTr?.currency?.trim() || !toTr?.currency?.trim() || fromTr.currency !== toTr.currency) {
      toast.error(lang === "ar" ? "التحويل متاح بين خزنتين بنفس العملة فقط." : "Transfers require two treasuries with the same currency.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error(t("amount")); return; }
    if (!transferReferenceRef.current && amount > fromTr.current_balance) {
      toast.error(lang === "ar" ? "الرصيد النقدي المتاح لا يكفي لهذا التحويل." : "Available cash is insufficient for this transfer.");
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      // Keep the same idempotency key after an unknown response while this
      // dialog remains open. A retry can then recover the committed pair
      // instead of creating a second transfer.
      const refId = transferReferenceRef.current ?? crypto.randomUUID();
      transferReferenceRef.current = refId;
      const { error } = await supabase.rpc("transfer_treasury_funds", {
        p_from_treasury_id: fromId,
        p_to_treasury_id: toId,
        p_amount: amount,
        p_reference_id: refId,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      toast.success(t("transferSuccess"));
      reset();
      onSaved();
    } catch {
      toast.error(lang === "ar"
        ? "تعذر تأكيد نتيجة التحويل. راجع حركات الخزنتين قبل إعادة المحاولة."
        : "Transfer outcome could not be confirmed. Please review both treasury ledgers before retrying.");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (submittingRef.current) return; onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("transferFunds")}</DialogTitle>
          <DialogDescription>{t("transferDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-2">
              <Label>{t("fromTreasury")}</Label>
              <Select value={fromId} onValueChange={setFromId} disabled={saving}>
                <SelectTrigger><SelectValue placeholder={t("selectTreasury")} /></SelectTrigger>
                <SelectContent>
                  {treasuries.map((tr) => <SelectItem key={tr.id} value={tr.id}>{lang === "ar" ? tr.name_ar : tr.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="mx-auto size-5 text-muted-foreground rotate-90 sm:mb-3 sm:rotate-0 rtl:sm:rotate-180" />
            <div className="space-y-2">
              <Label>{t("toTreasury")}</Label>
              <Select value={toId} onValueChange={setToId} disabled={saving}>
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
            <Input disabled={saving} type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>{t("notes")}</Label>
            <Textarea disabled={saving} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} />
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
