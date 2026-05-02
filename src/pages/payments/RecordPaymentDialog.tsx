import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [pidSelectOpen, setPidSelectOpen] = useState(false);
  const [iid, setIid] = useState<string>(invoiceId ?? "");
  const [amount, setAmount] = useState<number>(defaultAmount ?? 0);
  const [method, setMethod] = useState<Method>("cash");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPid(patientId ?? "");
    setIid(invoiceId ?? "");
    setAmount(defaultAmount ?? 0);
    setMethod("cash"); setRef(""); setNotes("");
    setDate(new Date().toISOString().slice(0,10));
    if (!patientId) loadPatients();
  }, [open, patientId, invoiceId, defaultAmount]);

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
    if (!pid) { toast.error(t("selectPatient")); return; }
    if (!amount || amount <= 0) { toast.error("Amount required"); return; }
    setSaving(true);
    const { error } = await supabase.from("payments").insert({
      patient_id: pid,
      invoice_id: iid || null,
      branch_id: currentBranchId,
      amount,
      payment_method: method,
      payment_date: date,
      reference_number: ref || null,
      notes: notes || null,
      received_by: user?.id ?? null,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("paid"));
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("recordPayment")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {!patientId && (
            <div className="space-y-2">
              <Label>{t("patientName")}</Label>
              <Select
                value={pid}
                onValueChange={setPid}
                open={pidSelectOpen}
                onOpenChange={(o) => {
                  setPidSelectOpen(o);
                  if (o) loadPatients();
                }}
              >
                <SelectTrigger><SelectValue placeholder={t("selectPatient")} /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("amount")}</Label>
              <Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
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
                  <SelectItem value="wallet">{t("wallet")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("referenceNumber")}</Label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>{t("cancel")}</Button>
          <Button type="button" className="gradient-primary text-primary-foreground" onClick={save} disabled={saving}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}