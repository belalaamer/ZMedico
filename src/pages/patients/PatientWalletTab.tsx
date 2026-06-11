import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Plus, Settings2 } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Can } from "@/components/Can";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDateTime } from "@/lib/format";

type Tx = {
  id: string;
  tx_type: "topup" | "spend" | "refund" | "referral_reward" | "adjustment_credit" | "adjustment_debit";
  direction: number;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes_en: string | null;
  notes_ar: string | null;
  created_at: string;
};

type TopupMethod = "cash" | "card" | "bank_transfer" | "insurance";

const typeKey: Record<Tx["tx_type"], string> = {
  topup: "txTopup",
  spend: "txSpend",
  refund: "txRefund",
  referral_reward: "txReferralReward",
  adjustment_credit: "txAdjustmentCredit",
  adjustment_debit: "txAdjustmentDebit",
};

const typeClass: Record<Tx["tx_type"], string> = {
  topup: "bg-success/10 text-success border-success/20",
  refund: "bg-success/10 text-success border-success/20",
  referral_reward: "bg-primary/10 text-primary border-primary/20",
  adjustment_credit: "bg-success/10 text-success border-success/20",
  spend: "bg-warning/10 text-warning border-warning/20",
  adjustment_debit: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function PatientWalletTab({ patientId }: { patientId: string }) {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  const [balance, setBalance] = useState<number>(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupOpen, setTopupOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: w }, { data: rows }] = await Promise.all([
      (supabase as any).from("patient_wallets").select("balance").eq("patient_id", patientId).maybeSingle(),
      (supabase as any)
        .from("patient_wallet_transactions")
        .select("id,tx_type,direction,amount,balance_after,reference_type,reference_id,notes_en,notes_ar,created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    setBalance(Number(w?.balance ?? 0));
    setTxs((rows ?? []) as Tx[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patientId]);

  return (
    <div className="space-y-4">
      <Card className="p-6 shadow-card flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center">
            <Wallet className="size-6" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("walletBalance")}</div>
            <div className="text-3xl font-bold tabular-nums">{formatMoney(balance, lang)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Can module="invoices" action="create">
            <Button onClick={() => setTopupOpen(true)} className="gradient-primary text-primary-foreground">
              <Plus className="me-2 size-4" />{t("topupWallet")}
            </Button>
          </Can>
          {isAdmin && (
            <Button variant="outline" onClick={() => setAdjOpen(true)}>
              <Settings2 className="me-2 size-4" />{t("manualAdjustment")}
            </Button>
          )}
        </div>
      </Card>

      <Card className="shadow-card overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">{t("walletLedger")}</div>
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">…</div>
        ) : txs.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("walletNoTransactions")}</div>
        ) : (
          <div className="divide-y divide-border">
            {txs.map((tx) => {
              const note = lang === "ar" ? (tx.notes_ar ?? tx.notes_en) : (tx.notes_en ?? tx.notes_ar);
              const signed = tx.direction >= 0 ? `+${formatMoney(tx.amount, lang)}` : `-${formatMoney(tx.amount, lang)}`;
              return (
                <div key={tx.id} className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={typeClass[tx.tx_type]}>{t(typeKey[tx.tx_type] as any)}</Badge>
                      {tx.reference_type && (
                        <span className="text-xs text-muted-foreground">{tx.reference_type}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(tx.created_at, lang)}
                      {note && <> · <span className="truncate">{note}</span></>}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className={`font-semibold tabular-nums ${tx.direction >= 0 ? "text-success" : "text-destructive"}`}>{signed}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{formatMoney(tx.balance_after, lang)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <TopupDialog
        open={topupOpen}
        onOpenChange={setTopupOpen}
        patientId={patientId}
        branchId={currentBranchId}
        userId={user?.id ?? null}
        onSaved={() => { setTopupOpen(false); load(); }}
      />
      <AdjustDialog
        open={adjOpen}
        onOpenChange={setAdjOpen}
        patientId={patientId}
        branchId={currentBranchId}
        onSaved={() => { setAdjOpen(false); load(); }}
      />
    </div>
  );
}

function TopupDialog({
  open, onOpenChange, patientId, branchId, userId, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  patientId: string; branchId: string | null; userId: string | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<TopupMethod>("cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(0); setMethod("cash"); setRef(""); setNotes("");
    setDate(new Date().toISOString().slice(0, 10));
  }, [open]);

  const save = async () => {
    if (!amount || amount <= 0) { toast.error(t("amount")); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("payments").insert({
      patient_id: patientId,
      invoice_id: null,
      branch_id: branchId,
      payment_date: date,
      amount,
      payment_method: method,
      reference_number: ref || null,
      notes: notes || null,
      received_by: userId,
      is_wallet_topup: true,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("walletTopupSuccess"));
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("topupWallet")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("amount")}</Label>
              <NumberInput value={amount} onChange={setAmount} />
            </div>
            <div className="space-y-2">
              <Label>{t("invoiceDate")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("method")}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as TopupMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("cash")}</SelectItem>
                  <SelectItem value="card">{t("card")}</SelectItem>
                  <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                  <SelectItem value="insurance">{t("insurance")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t("walletTopupMethodHint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("referenceNumber")}</Label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={save} disabled={saving} className="gradient-primary text-primary-foreground">{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({
  open, onOpenChange, patientId, branchId, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  patientId: string; branchId: string | null; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [direction, setDirection] = useState<"adjustment_credit" | "adjustment_debit">("adjustment_credit");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [refId, setRefId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDirection("adjustment_credit"); setAmount(0); setReason("");
    const id = (globalThis.crypto as any)?.randomUUID?.() ?? null;
    setRefId(id);
  }, [open]);

  const save = async () => {
    if (!amount || amount <= 0) { toast.error(t("amount")); return; }
    if (!reason.trim()) { toast.error(t("reasonRequired")); return; }
    if (!refId) { toast.error("Missing reference id"); return; }
    setSaving(true);
    const { error } = await (supabase as any).rpc("apply_wallet_tx", {
      _patient_id: patientId,
      _tx_type: direction,
      _amount: amount,
      _reference_type: "manual_adjustment",
      _reference_id: refId,
      _notes_en: reason,
      _notes_ar: reason,
      _branch_id: branchId,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("walletAdjustmentSuccess"));
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("manualAdjustment")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("type")}</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjustment_credit">{t("adjustmentCredit")}</SelectItem>
                  <SelectItem value="adjustment_debit">{t("adjustmentDebit")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("amount")}</Label>
              <NumberInput value={amount} onChange={setAmount} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("reason")}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={save} disabled={saving} className="gradient-primary text-primary-foreground">{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}