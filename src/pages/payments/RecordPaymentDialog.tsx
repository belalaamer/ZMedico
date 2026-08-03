import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDataSync } from "@/lib/dataSync";

type Method = "cash" | "card" | "bank_transfer" | "insurance" | "wallet";

export function RecordPaymentDialog({
  open, onOpenChange, onSaved, invoiceId, patientId, defaultAmount,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
  invoiceId?: string | null; patientId?: string; defaultAmount?: number;
}) {
  const { t } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();

  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [pid, setPid] = useState<string>(patientId ?? "");
  const [iid, setIid] = useState<string>(invoiceId ?? "");
  const [invoices, setInvoices] = useState<{ id: string; label: string; remaining: number }[]>([]);
  const [amount, setAmount] = useState<number>(defaultAmount ?? 0);
  const [method, setMethod] = useState<Method>("cash");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const [split, setSplit] = useState(false);
  const [method2, setMethod2] = useState<Method>("wallet");
  const [amount2, setAmount2] = useState<number>(0);
  const [remaining, setRemaining] = useState<number>(defaultAmount ?? 0);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletBalanceLoading, setWalletBalanceLoading] = useState<boolean>(false);
  const [isTopup, setIsTopup] = useState<boolean>(false);

  useEffect(() => {
    if (!open) return;
    setPid(patientId ?? "");
    setIid(invoiceId ?? "");
    setAmount(defaultAmount ?? 0);
    setMethod("cash"); setRef(""); setNotes("");
    setDate(new Date().toISOString().slice(0,10));
    setSplit(false); setMethod2("wallet"); setAmount2(0);
    setRemaining(defaultAmount ?? 0);
    setIsTopup(false);
    setWalletBalance(0);
    if (!patientId) loadPatients();
  }, [open, patientId, invoiceId, defaultAmount]);

  // Load open invoices for the selected patient (when not fixed by parent)
  useEffect(() => {
    if (!open || invoiceId) return;
    if (!pid) { setInvoices([]); return; }
    supabase
      .from("invoices")
      .select("id,invoice_number,total,paid_amount,status,invoice_date,deleted_at")
      .eq("patient_id", pid)
      .is("deleted_at", null)
      .in("status", ["pending", "partial", "draft"])
      .order("invoice_date", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const rows = (data ?? [])
          .filter((i: any) => i.deleted_at == null)
          .map((i: any) => ({
            id: i.id,
            remaining: +(Number(i.total) - Number(i.paid_amount)).toFixed(2),
            label: `${i.invoice_number} · ${(+(Number(i.total) - Number(i.paid_amount))).toFixed(2)}`,
          }))
          .filter((i) => i.remaining > 0);
        setInvoices(rows);
      });
  }, [open, pid, invoiceId]);

  // Load wallet balance when wallet is relevant (selected as method or method2).
  useEffect(() => {
    if (!open || !pid) { setWalletBalance(0); setWalletBalanceLoading(false); return; }
    let active = true;
    setWalletBalanceLoading(true);
    (supabase as any)
      .from("patient_wallets")
      .select("balance")
      .eq("patient_id", pid)
      .maybeSingle()
      .then(({ data }: any) => {
        if (!active) return;
        setWalletBalance(Number(data?.balance ?? 0));
        setWalletBalanceLoading(false);
      });
    return () => { active = false; };
  }, [open, pid]);

  const onInvoiceChange = (v: string) => {
    setIid(v);
    const found = invoices.find((i) => i.id === v);
    if (found) { setAmount(found.remaining); setRemaining(found.remaining); setAmount2(0); }
  };

  const loadPatients = () => {
    supabase
      .from("patients")
      .select("id,first_name_en,last_name_en,patient_code,deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        const rows = (data ?? []).filter((p: any) => p.deleted_at == null);
        setPatients(rows.map((p: any) => ({
          id: p.id,
          label: `#${p.patient_code} · ${p.first_name_en} ${p.last_name_en ?? ""}`.trim(),
        })));
      });
  };

  useDataSync(["patients"], () => { if (!patientId) loadPatients(); });

  const save = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (!pid) { toast.error(t("selectPatient")); submittingRef.current = false; return; }
    if (!amount || amount <= 0) { toast.error("Amount required"); submittingRef.current = false; return; }
    if (isTopup) {
      if (method === "wallet" || (split && method2 === "wallet")) {
        toast.error(t("walletTopupCannotUseWallet")); submittingRef.current = false; return;
      }
    } else {
      const walletInvolved = method === "wallet" || (split && method2 === "wallet");
      if (walletInvolved && walletBalanceLoading) {
        toast.error(t("walletBalanceLoading")); submittingRef.current = false; return;
      }
      // Validate wallet usage against current balance.
      const walletSpend = (method === "wallet" ? Number(amount) : 0) + (split && method2 === "wallet" ? Number(amount2) : 0);
      if (walletSpend > walletBalance + 0.009) {
        toast.error(t("walletInsufficient")); submittingRef.current = false; return;
      }
    }
    if (split) {
      if (method === method2) { toast.error(t("bothMethodsRequired")); submittingRef.current = false; return; }
      if (!amount2 || amount2 <= 0) { toast.error(t("bothMethodsRequired")); submittingRef.current = false; return; }
      const sum = +(Number(amount) + Number(amount2)).toFixed(2);
      const cap = remaining > 0 ? remaining : (defaultAmount ?? 0);
      if (cap > 0 && sum > cap + 0.009) { toast.error(t("splitSumExceeds")); submittingRef.current = false; return; }
    }
    setSaving(true);
    const base = {
      patient_id: pid,
      invoice_id: isTopup ? null : (iid || null),
      branch_id: currentBranchId,
      payment_date: date,
      reference_number: ref || null,
      notes: notes || null,
      received_by: user?.id ?? null,
      ...(isTopup ? { is_wallet_topup: true } : {}),
    };
    const rows: any[] = [{ ...base, amount, payment_method: method }];
    if (split) rows.push({ ...base, amount: amount2, payment_method: method2 });
    const { error } = await supabase.from("payments").insert(rows as any);
    setSaving(false);
    submittingRef.current = false;
    if (error) {
      const walletInvolved = method === "wallet" || (split && method2 === "wallet");
      const code = (error as any).code as string | undefined;
      const raw = `${error.message ?? ""} ${(error as any).details ?? ""} ${(error as any).hint ?? ""}`.toLowerCase();
      // Prefer Postgres SQLSTATE for CHECK violations (23514) — the wallet
      // balance constraint surfaces this code. Fall back to a heuristic string
      // match for older drivers that don't propagate `code`.
      const isInsufficient =
        !isTopup && walletInvolved && (
          code === "23514" ||
          raw.includes("insufficient") ||
          (raw.includes("balance") && (raw.includes("check") || raw.includes("negative") || raw.includes(">= 0") || raw.includes(">=0")))
        );
      toast.error(isInsufficient ? t("walletInsufficient") : (error.message ?? "Error"));
      return;
    }
    toast.success(t("paid"));
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("recordPayment")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <Label htmlFor="topup-toggle" className="cursor-pointer">{t("walletTopupMode")}</Label>
              <p className="text-[11px] text-muted-foreground">{t("walletTopupModeHint")}</p>
            </div>
            <Switch
              id="topup-toggle"
              checked={isTopup}
              onCheckedChange={(v) => {
                setIsTopup(v);
                if (v) {
                  setSplit(false);
                  if (method === "wallet") setMethod("cash");
                }
              }}
            />
          </div>
          {!patientId && (
            <div className="space-y-2">
              <Label>{t("patientName")}</Label>
              <Combobox
                value={pid}
                onChange={(v) => { setPid(v); loadPatients(); }}
                options={patients.map((p) => ({ value: p.id, label: p.label }))}
                placeholder={t("selectPatient")}
                searchPlaceholder="Search patient..."
              />
            </div>
          )}
          {!invoiceId && pid && !isTopup && (
            <div className="space-y-2">
              <Label>{t("invoice")}</Label>
              <Combobox
                value={iid}
                onChange={onInvoiceChange}
                options={invoices.map((i) => ({ value: i.id, label: i.label }))}
                placeholder={invoices.length ? "—" : (t("noInvoices") ?? "—")}
                searchPlaceholder="Search invoice..."
              />
            </div>
          )}
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
              <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("cash")}</SelectItem>
                  <SelectItem value="card">{t("card")}</SelectItem>
                  <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                  <SelectItem value="insurance">{t("insurance")}</SelectItem>
                  {!isTopup && <SelectItem value="wallet">{t("wallet")}</SelectItem>}
                </SelectContent>
              </Select>
              {pid && !isTopup && (method === "wallet" || (split && method2 === "wallet")) && (
                <p className={`text-[11px] tabular-nums ${
                  ((method === "wallet" ? amount : 0) + (split && method2 === "wallet" ? amount2 : 0)) > walletBalance + 0.009
                    ? "text-destructive" : "text-muted-foreground"
                }`}>
                  {t("walletBalanceLabel")}: {walletBalance.toFixed(2)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("referenceNumber")}</Label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} />
            </div>
          </div>
          {!isTopup && (
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label htmlFor="split-toggle" className="cursor-pointer">{t("splitPayment")}</Label>
              <Switch id="split-toggle" checked={split} onCheckedChange={(v) => { setSplit(v); if (!v) setAmount2(0); }} />
            </div>
          )}
          {split && !isTopup && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-dashed border-border p-3">
              <div className="space-y-2">
                <Label>{t("method2")}</Label>
                <Select value={method2} onValueChange={(v) => setMethod2(v as Method)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t("cash")}</SelectItem>
                    <SelectItem value="card">{t("card")}</SelectItem>
                    <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                    <SelectItem value="insurance">{t("insurance")}</SelectItem>
                    <SelectItem value="wallet">{t("wallet")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("amount")} ({t("method2")})</Label>
                <NumberInput value={amount2} onChange={setAmount2} />
              </div>
              <div className="col-span-2 text-xs text-muted-foreground tabular-nums flex justify-between">
                <span>{t("remaining")}: {(remaining || defaultAmount || 0).toFixed(2)}</span>
                <span>{t("total")}: {(Number(amount) + Number(amount2)).toFixed(2)}</span>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>{t("notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>{t("cancel")}</Button>
          <Button
            type="button"
            className="gradient-primary text-primary-foreground"
            onClick={save}
            disabled={saving || (!isTopup && (method === "wallet" || (split && method2 === "wallet")) && walletBalanceLoading)}
          >{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}