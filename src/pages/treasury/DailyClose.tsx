import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Banknote, ArrowDownToLine, ArrowUpFromLine, Wallet, Lock, ArrowLeft } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDateTime } from "@/lib/format";
import { toast } from "sonner";

type Summary = {
  opening_cash: number;
  cash_income: number;
  cash_expense: number;
  expected_cash: number;
  non_cash_total: number;
};

export default function DailyClose() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const { roles } = useUserRole();
  const canClose = roles.includes("admin") || roles.includes("manager");

  const today = new Date().toISOString().slice(0, 10);
  const [businessDate, setBusinessDate] = useState<string>(today);
  const [treasuries, setTreasuries] = useState<any[]>([]);
  const [treasuryId, setTreasuryId] = useState<string>("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [existing, setExisting] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [counted, setCounted] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Load treasuries for current branch
  useEffect(() => {
    (async () => {
      let q = supabase.from("treasury").select("*").is("deleted_at", null).order("created_at");
      if (currentBranchId) q = q.eq("branch_id", currentBranchId);
      const { data } = await q;
      setTreasuries(data ?? []);
      if (data && data.length && !treasuryId) setTreasuryId(data[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranchId]);

  const selectedTreasury = useMemo(
    () => treasuries.find((tr) => tr.id === treasuryId),
    [treasuries, treasuryId]
  );

  // Load summary + existing close
  const load = async () => {
    if (!treasuryId || !businessDate) { setSummary(null); setExisting(null); return; }
    setLoading(true);
    try {
      const [{ data: sum, error: sumErr }, { data: ex }] = await Promise.all([
        supabase.rpc("fn_treasury_day_cash_summary", {
          _treasury_id: treasuryId,
          _business_date: businessDate,
        } as any),
        supabase
          .from("treasury_daily_closes")
          .select("*")
          .eq("treasury_id", treasuryId)
          .eq("business_date", businessDate)
          .maybeSingle(),
      ]);
      if (sumErr) toast.error(sumErr.message);
      const row = Array.isArray(sum) ? sum[0] : sum;
      setSummary(
        row
          ? {
              opening_cash: Number(row.opening_cash) || 0,
              cash_income: Number(row.cash_income) || 0,
              cash_expense: Number(row.cash_expense) || 0,
              expected_cash: Number(row.expected_cash) || 0,
              non_cash_total: Number(row.non_cash_total) || 0,
            }
          : null
      );
      setExisting(ex ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [treasuryId, businessDate]);

  const openConfirm = () => {
    if (!summary) return;
    setCounted(summary.expected_cash.toFixed(2));
    setNotes("");
    setConfirmOpen(true);
  };

  const submitClose = async () => {
    if (!treasuryId || !selectedTreasury || !summary || submitting) return;
    const countedNum = Number(counted);
    if (!isFinite(countedNum) || countedNum < 0) {
      toast.error(lang === "ar" ? "أدخل قيمة صحيحة" : "Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("treasury_daily_closes").insert({
        treasury_id: treasuryId,
        branch_id: selectedTreasury.branch_id,
        business_date: businessDate,
        opening_cash: summary.opening_cash,
        expected_cash: summary.expected_cash,
        counted_cash: countedNum,
        non_cash_total: summary.non_cash_total,
        notes: notes || null,
        closed_by: user?.id ?? null,
      } as any);
      if (error) {
        if ((error as any).code === "23505") {
          toast.error(lang === "ar" ? "تم الإقفال مسبقًا لهذا اليوم" : "Already closed for this date");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success(lang === "ar" ? "تم إقفال اليوم" : "Day closed");
      setConfirmOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const variance = existing
    ? Number(existing.counted_cash) - Number(existing.expected_cash)
    : summary
    ? Number(counted || 0) - summary.expected_cash
    : 0;

  const currency = selectedTreasury?.currency;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <Link to="/treasury" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="me-1 size-3" /> {t("treasury")}
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {lang === "ar" ? "الإقفال اليومي للخزينة" : "Treasury Daily Close"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === "ar"
              ? "قارن النقد المعدود مع النقد المتوقع في الدرج. الطرق غير النقدية تظهر للعلم فقط."
              : "Compare counted cash against expected cash drawer. Non-cash methods are shown for visibility only."}
          </p>
        </div>
      </div>

      {/* Selectors */}
      <Card className="p-4 shadow-card grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>{t("treasury")}</Label>
          <Select value={treasuryId} onValueChange={setTreasuryId}>
            <SelectTrigger><SelectValue placeholder={t("selectTreasury") || "Select treasury"} /></SelectTrigger>
            <SelectContent>
              {treasuries.map((tr) => (
                <SelectItem key={tr.id} value={tr.id}>{lang === "ar" ? tr.name_ar : tr.name_en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{lang === "ar" ? "تاريخ العمل" : "Business date"}</Label>
          <Input type="date" value={businessDate} max={today} onChange={(e) => setBusinessDate(e.target.value)} />
        </div>
        <div className="space-y-2 flex flex-col justify-end">
          {existing ? (
            <Badge className="self-start status-completed">
              <Lock className="me-1 size-3" />
              {lang === "ar" ? "مُقفل" : "Closed"}
            </Badge>
          ) : canClose ? (
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={!summary || loading}
              onClick={openConfirm}
            >
              {lang === "ar" ? "تأكيد الإقفال" : "Confirm close"}
            </Button>
          ) : (
            <div className="text-xs text-muted-foreground">
              {lang === "ar" ? "يتطلب صلاحية مدير أو مشرف" : "Admin or manager role required"}
            </div>
          )}
        </div>
      </Card>

      {/* Cash drawer summary */}
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          {lang === "ar" ? "درج النقد (يُحتسب في الفرق)" : "Cash drawer (counted in variance)"}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: lang === "ar" ? "النقد الافتتاحي" : "Opening cash", value: summary?.opening_cash ?? 0, icon: Wallet, tone: "from-muted to-muted" },
            { label: lang === "ar" ? "إيراد نقدي" : "Cash income", value: summary?.cash_income ?? 0, icon: ArrowDownToLine, tone: "from-success to-success" },
            { label: lang === "ar" ? "مصروف نقدي" : "Cash expense", value: summary?.cash_expense ?? 0, icon: ArrowUpFromLine, tone: "from-destructive to-destructive" },
            { label: lang === "ar" ? "النقد المتوقع" : "Expected cash", value: summary?.expected_cash ?? 0, icon: Banknote, tone: "from-primary to-primary-glow" },
          ].map((m) => (
            <Card key={m.label} className="p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div className="text-xs font-medium text-muted-foreground">{m.label}</div>
                <div className={`size-8 rounded-lg bg-gradient-to-br ${m.tone} text-white flex items-center justify-center`}>
                  <m.icon className="size-4" />
                </div>
              </div>
              <div className="mt-2 text-xl font-bold tabular-nums">{formatMoney(m.value, lang, currency)}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* Existing close */}
      {existing && (
        <Card className="p-4 shadow-card space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">{lang === "ar" ? "سجل الإقفال" : "Close record"}</h2>
            <Badge variant="outline" className="ms-auto">
              {formatDateTime(existing.closed_at, lang)}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Field label={lang === "ar" ? "النقد المتوقع" : "Expected cash"} value={formatMoney(existing.expected_cash, lang, currency)} />
            <Field label={lang === "ar" ? "النقد المعدود" : "Counted cash"} value={formatMoney(existing.counted_cash, lang, currency)} />
            <Field
              label={lang === "ar" ? "الفرق" : "Variance"}
              value={formatMoney(existing.variance, lang, currency)}
              tone={Number(existing.variance) === 0 ? "ok" : Number(existing.variance) > 0 ? "pos" : "neg"}
            />
            <Field label={lang === "ar" ? "غير نقدي (للعلم)" : "Non-cash (info)"} value={formatMoney(existing.non_cash_total, lang, currency)} muted />
          </div>
          {existing.notes && (
            <div className="text-sm">
              <div className="text-xs text-muted-foreground mb-1">{lang === "ar" ? "ملاحظات" : "Notes"}</div>
              <div className="rounded-md border border-border p-2 whitespace-pre-wrap">{existing.notes}</div>
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">
            {lang === "ar"
              ? "هذا السجل غير قابل للتعديل في هذه المرحلة."
              : "This record is immutable in this phase."}
          </div>
        </Card>
      )}

      {/* Non-cash visibility (not in variance) */}
      <Card className="p-4 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">
              {lang === "ar" ? "إجمالي غير نقدي (لليوم)" : "Non-cash total (today)"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {lang === "ar"
                ? "بطاقات/تحويلات بنكية — تُعرض للعلم فقط ولا تدخل في فرق درج النقد."
                : "Cards / bank transfers — displayed for visibility only, not part of the cash variance."}
            </div>
          </div>
          <div className="text-xl font-bold tabular-nums">{formatMoney(summary?.non_cash_total ?? 0, lang, currency)}</div>
        </div>
      </Card>

      {/* Confirm close dialog */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !submitting && setConfirmOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "تأكيد الإقفال اليومي" : "Confirm daily close"}</DialogTitle>
          </DialogHeader>
          {summary && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label={lang === "ar" ? "النقد المتوقع" : "Expected cash"} value={formatMoney(summary.expected_cash, lang, currency)} />
                <Field
                  label={lang === "ar" ? "الفرق المتوقع" : "Variance"}
                  value={formatMoney(variance, lang, currency)}
                  tone={variance === 0 ? "ok" : variance > 0 ? "pos" : "neg"}
                />
              </div>
              <div className="space-y-2">
                <Label>{lang === "ar" ? "النقد المعدود فعلًا" : "Counted cash"}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{lang === "ar" ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? "بعد التأكيد لن يمكن تعديل هذا الإقفال."
                  : "Once confirmed, this close cannot be edited."}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button
              className="gradient-primary text-primary-foreground"
              onClick={submitClose}
              disabled={submitting}
            >
              {submitting ? (lang === "ar" ? "جارٍ الحفظ..." : "Saving...") : (lang === "ar" ? "تأكيد الإقفال" : "Confirm close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, tone, muted }: { label: string; value: string; tone?: "ok" | "pos" | "neg"; muted?: boolean }) {
  const cls =
    tone === "neg" ? "text-destructive" :
    tone === "pos" ? "text-success" :
    tone === "ok" ? "text-foreground" :
    muted ? "text-muted-foreground" : "";
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}