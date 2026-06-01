import { useEffect, useState } from "react";
import { useDataSync } from "@/lib/dataSync";
import { Banknote, ArrowDownToLine, ArrowUpFromLine, TrendingUp, ArrowLeftRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDateTime } from "@/lib/format";
import { TransferDialog } from "./TransferDialog";
import { RowActions } from "@/components/RowActions";

export default function Treasury() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const [treasuries, setTreasuries] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [adj, setAdj] = useState({ open: false, type: "income", amount: 0, desc_en: "", desc_ar: "", treasury_id: "" });
  const [adjIsCash, setAdjIsCash] = useState<"cash" | "non_cash">("cash");
  const [today, setToday] = useState({ income: 0, expense: 0 });
  const [transferOpen, setTransferOpen] = useState(false);

  const load = async () => {
    let tq = supabase.from("treasury").select("*").is("deleted_at", null).order("created_at");
    if (currentBranchId) tq = tq.eq("branch_id", currentBranchId);
    const { data: trs } = await tq;
    setTreasuries(trs ?? []);

    const ids = (trs ?? []).map((t: any) => t.id);
    if (ids.length) {
      const { data: tx } = await supabase.from("treasury_transactions").select("*").in("treasury_id", ids).order("created_at", { ascending: false }).limit(100);
      setTxs(tx ?? []);

      const startISO = new Date(new Date().setHours(0,0,0,0)).toISOString();
      const { data: tt } = await supabase.from("treasury_transactions").select("transaction_type,amount").in("treasury_id", ids).gte("created_at", startISO);
      const inc = (tt ?? []).filter((r: any) => r.transaction_type === "income").reduce((s: number, r: any) => s + Number(r.amount), 0);
      const exp = (tt ?? []).filter((r: any) => r.transaction_type === "expense").reduce((s: number, r: any) => s + Number(r.amount), 0);
      setToday({ income: inc, expense: exp });
    } else {
      setTxs([]); setToday({ income: 0, expense: 0 });
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId]);
  useDataSync(["treasury_transactions", "payments", "expenses"], () => { load(); });

  const softDeleteTreasury = async (tr: any): Promise<void> => {
    const { count } = await supabase.from("treasury_transactions").select("id", { count: "exact", head: true }).eq("treasury_id", tr.id);
    if ((count ?? 0) > 0) { toast.error(lang === "ar" ? "لا يمكن الحذف: توجد معاملات" : "Cannot delete: has transactions"); return; }
    const { error } = await supabase.from("treasury").update({ deleted_at: new Date().toISOString() } as any).eq("id", tr.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };

  const totalCashBalance = treasuries.reduce((s, tr) => s + Number(tr.current_balance), 0);
  const totalNonCashBalance = treasuries.reduce((s, tr) => s + Number(tr.non_cash_balance ?? 0), 0);
  const totalBalance = totalCashBalance + totalNonCashBalance;

  const submitAdj = async () => {
    if (!adj.treasury_id || !adj.amount || !adj.desc_en) { toast.error("Fill all fields"); return; }
    const { error } = await supabase.rpc("add_treasury_tx", {
      _treasury_id: adj.treasury_id,
      _type: adj.type,
      _amount: adj.amount,
      _ref_type: "manual",
      _ref_id: null,
      _desc_en: adj.desc_en,
      _desc_ar: adj.desc_ar || adj.desc_en,
      _by: user?.id ?? null,
      _is_cash: adjIsCash === "cash",
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(t("save"));
    setAdj({ open: false, type: "income", amount: 0, desc_en: "", desc_ar: "", treasury_id: "" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("treasury")}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTransferOpen(true)} disabled={treasuries.length < 2}>
            <ArrowLeftRight className="me-2 size-4" />{t("transferFunds")}
          </Button>
          <Dialog open={adj.open} onOpenChange={(v) => setAdj({ ...adj, open: v })}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground">{t("adjust")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("adjust")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{t("treasury")}</Label>
                <Select value={adj.treasury_id} onValueChange={(v) => setAdj({ ...adj, treasury_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("selectTreasury")} /></SelectTrigger>
                  <SelectContent>{treasuries.map((tr) => <SelectItem key={tr.id} value={tr.id}>{lang === "ar" ? tr.name_ar : tr.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("transactionType")}</Label>
                  <Select value={adj.type} onValueChange={(v) => setAdj({ ...adj, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">{t("income")}</SelectItem>
                      <SelectItem value="expense">{t("expense")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("amount")}</Label>
                  <Input type="number" min={0.01} step="0.01" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("description")}</Label>
                <Input value={adj.desc_en} onChange={(e) => setAdj({ ...adj, desc_en: e.target.value, desc_ar: e.target.value })} maxLength={200} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAdj({ ...adj, open: false })}>{t("cancel")}</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={submitAdj}>{t("save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("cashBalance"), value: totalBalance, icon: Banknote, tone: "from-primary to-primary-glow" },
      { label: t("nonCashBalance"), value: totalNonCashBalance, icon: Banknote, tone: "from-info to-info" },
          { label: t("todayIncome"), value: today.income, icon: ArrowDownToLine, tone: "from-success to-success" },
          { label: t("todayExpenses"), value: today.expense, icon: ArrowUpFromLine, tone: "from-destructive to-destructive" },
        ].map((m) => (
          <Card key={m.label} className="p-4 shadow-card">
            <div className="flex items-start justify-between">
              <div className="text-xs font-medium text-muted-foreground">{m.label}</div>
              <div className={`size-8 rounded-lg bg-gradient-to-br ${m.tone} text-white flex items-center justify-center`}>
                <m.icon className="size-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-bold tabular-nums">{formatMoney(m.value, lang)}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4 shadow-card lg:col-span-1 space-y-3">
          <h2 className="font-semibold">{t("treasury")}</h2>
          {treasuries.length === 0 ? (
            <div className="text-sm text-muted-foreground">—</div>
          ) : treasuries.map((tr) => (
            <div key={tr.id} className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{lang === "ar" ? tr.name_ar : tr.name_en}</div>
                <RowActions canEdit={false} onDelete={() => softDeleteTreasury(tr)} />
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatMoney(tr.current_balance, lang, tr.currency)}</div>
            </div>
          ))}
        </Card>

        <Card className="lg:col-span-2 shadow-card overflow-hidden">
          <div className="p-4 font-semibold border-b border-border">{t("transactions")}</div>
          {txs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">{t("noTransactions")}</div>
          ) : (
            <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
              {txs.map((x) => {
                const isInc = x.transaction_type === "income";
                const isTrf = x.transaction_type === "transfer";
                return (
                  <div key={x.id} className="flex items-center gap-3 p-3 text-sm">
                    <Badge variant="outline" className={isInc ? "status-completed" : isTrf ? "status-progress" : "status-departed"}>
                      {t(x.transaction_type as any)}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{lang === "ar" ? (x.description_ar || x.description_en) : x.description_en}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(x.created_at, lang)}</div>
                    </div>
                    <div className="text-end">
                      <div className={`font-semibold tabular-nums ${isInc ? "text-success" : "text-destructive"}`}>
                        {isInc ? "+" : "-"} {formatMoney(x.amount, lang)}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{t("balanceAfter")}: {formatMoney(x.balance_after, lang)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <TransferDialog
        open={transferOpen} onOpenChange={setTransferOpen}
        treasuries={treasuries}
        onSaved={() => { setTransferOpen(false); load(); }}
      />
    </div>
  );
}