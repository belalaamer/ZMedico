import { useEffect, useState } from "react";
import { Wallet, AlertCircle, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDate } from "@/lib/format";

type Props = {
  patientId: string;
  invoices: any[];
  payments: any[];
  onRecordPayment?: () => void;
  onTopupWallet?: () => void;
  onOpenFinancial?: () => void;
  canPay?: boolean;
  canTopup?: boolean;
  reloadKey?: number;
};

export default function PatientFinancialCard({
  patientId, invoices, payments,
  onRecordPayment, onTopupWallet, onOpenFinancial,
  canPay, canTopup, reloadKey,
}: Props) {
  const { lang, t } = useI18n();
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    let active = true;
    (supabase as any)
      .from("patient_wallets")
      .select("balance")
      .eq("patient_id", patientId)
      .maybeSingle()
      .then(({ data }: any) => { if (active) setBalance(Number(data?.balance ?? 0)); });
    return () => { active = false; };
  }, [patientId, reloadKey]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const open = invoices.filter((i) => i.status !== "cancelled" && (Number(i.total) - Number(i.paid_amount)) > 0.009);
  const overdue = open.filter((i) => i.due_date && new Date(i.due_date).getTime() < today.getTime());
  const overdueAmt = overdue.reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount)), 0);
  const openAmt = open.reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount)), 0);
  const currentAmt = +(openAmt - overdueAmt).toFixed(2);
  const lastPay = payments[0];

  return (
    <Card className="p-4 shadow-card">
      <div className="grid sm:grid-cols-4 gap-4">
        <Stat
          label={lang === "ar" ? "إجمالي المستحق" : "Outstanding"}
          value={formatMoney(openAmt, lang)}
          tone={openAmt > 0 ? "warning" : "muted"}
        />
        <Stat
          label={lang === "ar" ? "متأخر" : "Overdue"}
          value={formatMoney(overdueAmt, lang)}
          tone={overdueAmt > 0 ? "destructive" : "muted"}
          icon={overdueAmt > 0 ? <AlertCircle className="size-3.5" /> : undefined}
        />
        <Stat
          label={lang === "ar" ? "رصيد المحفظة" : "Wallet"}
          value={formatMoney(balance, lang)}
          tone={balance > 0 ? "success" : "muted"}
          icon={<Wallet className="size-3.5" />}
        />
        <Stat
          label={lang === "ar" ? "آخر دفعة" : "Last payment"}
          value={lastPay ? `${formatMoney(lastPay.amount, lang)} · ${formatDate(lastPay.created_at, lang)}` : "—"}
          tone="muted"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
        {canPay && (
          <Button size="sm" variant="outline" onClick={onRecordPayment}>
            {t("recordPayment")}
          </Button>
        )}
        {canTopup && (
          <Button size="sm" variant="outline" onClick={onTopupWallet}>
            {t("topupWallet")}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ms-auto" onClick={onOpenFinancial}>
          {lang === "ar" ? "كل الفواتير والمدفوعات" : "All invoices & payments"}
          <ArrowRight className="ms-1 size-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function Stat({
  label, value, tone, icon,
}: { label: string; value: string; tone: "primary" | "warning" | "destructive" | "success" | "muted"; icon?: React.ReactNode }) {
  const valTone = {
    primary: "text-primary",
    warning: "text-warning",
    destructive: "text-destructive",
    success: "text-success",
    muted: "text-foreground",
  }[tone];
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${valTone}`}>{value}</div>
    </div>
  );
}