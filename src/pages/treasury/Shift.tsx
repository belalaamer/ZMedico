import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Banknote, HandCoins, Lock, RefreshCw, ShieldAlert, Unlock } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useDataSync } from "@/lib/dataSync";
import { deskFailure, type DeskFailureCopy } from "@/lib/deskFailure";
import { formatMoney, formatDateTime } from "@/lib/format";
import { toast } from "sonner";

// The till shift desk. One read RPC and two write RPCs, and nothing else:
// `authenticated` holds no table privilege on treasury_shifts at all, so this
// screen never calls supabase.from("treasury_shifts") — every number on it comes
// from a function the server signs. A shift is "now": it is opened when someone
// counts the drawer and closed when someone counts it again, which is why there
// is no date picker here and why opening or closing can never block a payment.

type ShiftRow = {
  treasury_id: string;
  name_en: string;
  name_ar: string | null;
  currency: string;
  shift_id: string | null;
  shift_status: string;
  opened_at: string | null;
  opened_by: string | null;
  opener_name: string | null;
  opening_counted: number | string | null;
  opening_book: number | string | null;
  opening_gap: number | string | null;
  inherited_counted: number | string | null;
  opening_variance: number | string | null;
  shift_cash_income: number | string | null;
  shift_cash_outflow: number | string | null;
  shift_non_cash_income: number | string | null;
  shift_non_cash_outflow: number | string | null;
  shift_entries: number | null;
  expected_cash: number | string | null;
  cumulative_cash: number | string | null;
  unexplained_book_movement: number | string | null;
  last_closed_at: string | null;
  last_closer_name: string | null;
  last_counted: number | string | null;
  last_variance: number | string | null;
  last_handed_over_name: string | null;
};

type Candidate = { user_id: string; full_name: string | null; roles: string | null };

const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// profiles.full_name is NULL for real identities in Production, so a custody
// line without a name has to read as a dash instead of an empty gap.
const person = (v: string | null | undefined) => (v && v.trim() ? v : "—");

/** The shift RPCs raise their own codes for the two refusals this desk can
 *  actually provoke. deskFailure() would call a second open shift "a value
 *  already used by another record" and an unknown receiver "a record that no
 *  longer exists"; both are true of the SQL and useless to the cashier, so the
 *  named cases answer in their own words and everything else falls through. */
function shiftFailure(error: unknown, ar: boolean, fallback: string): DeskFailureCopy {
  const code = (error as { code?: string } | null | undefined)?.code;
  if (code === "23505") {
    return {
      title: ar ? "لهذه الخزنة وردية مفتوحة بالفعل." : "This till already has an open shift.",
      description: ar ? "أقفل الوردية الحالية أولًا ثم افتح واحدة جديدة." : "Close the running shift before opening a new one.",
    };
  }
  if (code === "55000") {
    return {
      title: ar ? "لا توجد وردية مفتوحة لهذه الخزنة." : "There is no open shift on this till.",
      description: ar ? "أقفلها زميل آخر — حدّث الشاشة." : "Someone else closed it — refresh this screen.",
    };
  }
  if (code === "23503") {
    return {
      title: ar ? "الشخص الذي اخترته لا يعمل على هذه الخزنة." : "The person you picked does not work this till.",
      description: ar ? "اختر زميلًا من نفس الفرع يملك صلاحية وردية الخزنة." : "Pick a colleague from this branch who holds the till shift permission.",
    };
  }
  return deskFailure(error, ar ? "ar" : "en", fallback);
}

export default function Shift() {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const { currentBranchId, branchSelectionReady } = useBranch();
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<DeskFailureCopy | null>(null);
  const loadRequestRef = useRef(0);

  const load = async () => {
    const requestId = ++loadRequestRef.current;
    const branchId = currentBranchId;
    if (!branchSelectionReady || !branchId) {
      setRows([]);
      setFailure(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailure(null);
    const { data, error } = await (supabase as any).rpc("fn_treasury_shift_state", { _branch_id: branchId });
    if (requestId !== loadRequestRef.current) return;
    setLoading(false);
    if (error) {
      // A failed read must never render as "no tills": the desk would count an
      // empty drawer and open a second shift on a till that already has one.
      setRows([]);
      setFailure(shiftFailure(error, ar, ar ? "تعذّر تحميل الورديات" : "Could not load the till shifts"));
      return;
    }
    setRows((data ?? []) as ShiftRow[]);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [branchSelectionReady, currentBranchId]);
  // "treasury" is the key every payment, expense and ledger mutation already
  // emits, so this desk moves with the money in this browser. A second device is
  // not live-pushed — no treasury table is in the realtime publication today —
  // and the focus refresh in dataSync covers the cashier who tabs away.
  useDataSync(["treasury"], () => { void load(); });

  const openCount = rows.filter((r) => r.shift_status === "open").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("shiftDesk")}</h1>
          <p className="text-sm text-muted-foreground">
            {ar
              ? "اعُدّ الدرج عند الفتح وعند التسليم. الأرقام التي تظهر هنا تحسبها الدفاتر، لا المتصفح."
              : "Count the drawer when you open it and when you hand it over. Every number here is computed by the books, not the browser."}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`me-2 size-4 ${loading ? "animate-spin" : ""}`} />
          {ar ? "تحديث" : "Refresh"}
        </Button>
      </div>

      {failure && (
        <Card className="p-4 shadow-card border-destructive/40 bg-destructive/5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="size-5 shrink-0 text-destructive mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-destructive">{failure.title}</div>
              {failure.description && <div className="text-sm text-muted-foreground">{failure.description}</div>}
              <Button variant="outline" size="sm" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Try again"}</Button>
            </div>
          </div>
        </Card>
      )}

      {!failure && loading && rows.length === 0 && (
        <Card className="p-8 shadow-card text-center text-sm text-muted-foreground">{t("loading")}</Card>
      )}

      {!failure && !loading && rows.length === 0 && (
        <Card className="p-8 shadow-card text-center text-sm text-muted-foreground">
          {ar ? "لا توجد خزائن لهذا الفرع." : "This branch has no treasuries yet."}
        </Card>
      )}

      {openCount > 0 && (
        <div className="text-xs text-muted-foreground">
          {ar
            ? `${openCount} وردية مفتوحة الآن — كل وردية تُقفل بنفس الشخص أو تُسلّم لزميل.`
            : `${openCount} shift${openCount === 1 ? "" : "s"} open now — each one ends with a count, by this person or the one they hand it to.`}
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((row) => (
          <ShiftCard key={row.treasury_id} row={row} onChanged={() => void load()} />
        ))}
      </div>
    </div>
  );
}

function ShiftCard({ row, onChanged }: { row: ShiftRow; onChanged: () => void }) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const currency = row.currency || "EGP";
  const isOpen = row.shift_status === "open";
  const name = ar ? (row.name_ar || row.name_en) : row.name_en;

  const [count, setCount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [receiver, setReceiver] = useState("none");
  const [closing, setClosing] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);
  // Both submit paths carry an in-flight ref, not just state: a double click
  // reads the state of the render it was created in, so two posts can both see
  // `false`. Treasury.tsx had exactly this bug on its manual adjustment.
  const busyRef = useRef(false);
  const closeBusyRef = useRef(false);

  const parsed = count.trim() === "" ? null : Number(count);
  const parsedClosing = closing.trim() === "" ? null : Number(closing);
  const expected = num(row.expected_cash);

  const reset = () => {
    setCloseOpen(false);
    setReceiver("none");
    setCandidates([]);
    setClosing("");
    setCloseNotes("");
  };

  const submitOpen = async () => {
    if (busyRef.current) return;
    if (parsed === null || !Number.isFinite(parsed) || parsed < 0) {
      toast.error(ar ? "أدخل مبلغًا صحيحًا وغير سالب" : "Enter a real, non-negative amount");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("fn_treasury_shift_open", {
        _treasury_id: row.treasury_id,
        _opening_counted: parsed,
        _notes: notes || null,
      });
      if (error) {
        toast.error(shiftFailure(error, ar, ar ? "تعذّر فتح الوردية" : "Could not open the shift").title);
        return;
      }
      toast.success(ar ? "تم فتح الوردية" : "Shift opened");
      setCount("");
      setNotes("");
      onChanged();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const openCloseDialog = async () => {
    setClosing(expected.toFixed(2));
    setCloseNotes("");
    setReceiver("none");
    setCloseOpen(true);
    const { data, error } = await (supabase as any).rpc("fn_treasury_shift_handover_candidates", {
      _treasury_id: row.treasury_id,
    });
    if (error) {
      setCandidates([]);
      toast.error(shiftFailure(error, ar, ar ? "تعذّر تحميل زملاء التسليم" : "Could not load handover colleagues").title);
      return;
    }
    setCandidates((data ?? []) as Candidate[]);
  };

  const submitClose = async () => {
    if (closeBusyRef.current) return;
    if (parsedClosing === null || !Number.isFinite(parsedClosing) || parsedClosing < 0) {
      toast.error(ar ? "أدخل مبلغًا صحيحًا وغير سالب" : "Enter a real, non-negative amount");
      return;
    }
    closeBusyRef.current = true;
    setCloseBusy(true);
    try {
      // The desk sends one amount and, at most, who takes the drawer. The stored
      // variance is the one fn_treasury_shift_close computed from the ledger, so
      // the preview above can be wrong without corrupting the record.
      const { error } = await (supabase as any).rpc("fn_treasury_shift_close", {
        _treasury_id: row.treasury_id,
        _closing_counted: parsedClosing,
        _handed_over_to: receiver === "none" ? null : receiver,
        _notes: closeNotes || null,
      });
      if (error) {
        toast.error(shiftFailure(error, ar, ar ? "تعذّر إقفال الوردية" : "Could not close the shift").title);
        return;
      }
      toast.success(ar ? "تم إقفال الوردية" : "Shift closed");
      reset();
      onChanged();
    } finally {
      closeBusyRef.current = false;
      setCloseBusy(false);
    }
  };

  const gap = num(row.opening_gap);
  const unexplained = num(row.unexplained_book_movement);
  const previewVariance = parsedClosing === null ? 0 : parsedClosing - expected;

  return (
    <Card className="p-4 shadow-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{name}</div>
          <div className="text-[11px] text-muted-foreground">{currency}</div>
        </div>
        <Badge variant="outline" className={isOpen ? "status-progress" : "status-cancelled"}>
          {isOpen ? <Unlock className="me-1 size-3" /> : <Lock className="me-1 size-3" />}
          {isOpen ? t("shiftOpen") : t("shiftIdle")}
        </Badge>
      </div>

      {isOpen ? (
        <>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Banknote className="size-3.5" /> {t("drawerNow")}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatMoney(expected, lang, currency)}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-muted/40 p-2">
              <div className="flex items-center text-muted-foreground"><ArrowDownToLine className="me-1 size-3" />{t("shiftSplit")} — {t("income")}</div>
              <div className="font-semibold tabular-nums">{formatMoney(num(row.shift_cash_income), lang, currency)}</div>
            </div>
            <div className="rounded-md bg-muted/40 p-2">
              <div className="flex items-center text-muted-foreground"><ArrowUpFromLine className="me-1 size-3" />{t("shiftSplit")} — {t("expense")}</div>
              <div className="font-semibold tabular-nums">{formatMoney(num(row.shift_cash_outflow), lang, currency)}</div>
            </div>
            <div className="rounded-md bg-muted/40 p-2">
              <div className="text-muted-foreground">{ar ? "عدد الحركات" : "Entries"}</div>
              <div className="font-semibold tabular-nums">{row.shift_entries ?? 0}</div>
            </div>
            <div className="rounded-md bg-muted/40 p-2">
              <div className="text-muted-foreground">{t("nonCash")}</div>
              <div className="font-semibold tabular-nums">{formatMoney(num(row.shift_non_cash_income) - num(row.shift_non_cash_outflow), lang, currency)}</div>
            </div>
          </div>

          <div className="space-y-1 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span>{t("cumulativeNotYours")}</span>
              <span className="font-semibold tabular-nums">{formatMoney(num(row.cumulative_cash), lang, currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>{ar ? `فتح ${person(row.opener_name)}` : `${person(row.opener_name)} opened`}</span>
              <span>{row.opened_at ? formatDateTime(row.opened_at, lang) : "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>{ar ? "العدّ الافتتاحي" : "Opening count"}</span>
              <span className="tabular-nums">{formatMoney(num(row.opening_counted), lang, currency)}</span>
            </div>
          </div>

          {gap !== 0 && (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3 mt-0.5 shrink-0" />
              <span>
                {ar
                  ? `${t("openingGap")}: الدرج كان ${formatMoney(Math.abs(gap), lang, currency)} ${gap < 0 ? "أقل" : "أكثر"} من الدفاتر عند الفتح.`
                  : `${t("openingGap")}: the drawer was ${formatMoney(Math.abs(gap), lang, currency)} ${gap < 0 ? "short of" : "over"} the books when this shift opened.`}
              </span>
            </div>
          )}

          {unexplained !== 0 && (
            <div className="flex items-start gap-1.5 rounded-md border border-border p-2 text-[11px] text-muted-foreground">
              <AlertTriangle className="size-3 mt-0.5 shrink-0" />
              <span>
                {ar
                  ? `حركة دفتر غير موثّقة في هذه الوردية: ${formatMoney(Math.abs(unexplained), lang, currency)}.`
                  : `Unmatched book movement in this shift: ${formatMoney(Math.abs(unexplained), lang, currency)}.`}
              </span>
            </div>
          )}

          <Button className="gradient-primary text-primary-foreground w-full" onClick={() => void openCloseDialog()}>
            <HandCoins className="me-2 size-4" />
            {t("shiftClose")}
          </Button>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">{t("cumulativeNotYours")}</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{formatMoney(num(row.cumulative_cash), lang, currency)}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {ar ? "هذا تاريخ الخزينة كله، ليس ما يجب أن يكون في الدرج الآن." : "This is the till's whole history, not what the drawer should hold now."}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{ar ? "عُدّ الدرج" : "Count the drawer"}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder={formatMoney(0, lang, currency)}
              aria-label={ar ? "مبلغ العدّ عند الفتح" : "Opening count"}
            />
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={ar ? "ملاحظات الفتح (اختياري)" : "Opening notes (optional)"}
            />
            <Button
              className="gradient-primary text-primary-foreground w-full"
              onClick={() => void submitOpen()}
              disabled={busy}
            >
              <Unlock className="me-2 size-4" />
              {busy ? t("loading") : t("shiftOpen")}
            </Button>
          </div>
        </>
      )}

      {row.last_closed_at && (
        <div className="border-t border-border pt-2 text-[11px] text-muted-foreground space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <span>{ar ? "آخر إقفال" : "Last close"}</span>
            <span>{formatDateTime(row.last_closed_at, lang)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{ar ? "عُدّ" : "Counted"}</span>
            <span className="tabular-nums">{formatMoney(num(row.last_counted), lang, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{ar ? "الفرق" : "Variance"}</span>
            <span className={`tabular-nums ${num(row.last_variance) === 0 ? "" : "text-destructive"}`}>
              {formatMoney(num(row.last_variance), lang, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{ar ? "من" : "Closed by"}</span>
            <span>{person(row.last_closer_name)}</span>
          </div>
          {row.last_handed_over_name && (
            <div className="flex items-center justify-between gap-2">
              <span>{t("shiftHandover")}</span>
              <span>{person(row.last_handed_over_name)}</span>
            </div>
          )}
        </div>
      )}

      <Dialog open={closeOpen} onOpenChange={(v) => !closeBusy && setCloseOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("shiftClose")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-border p-2">
              <div className="text-[11px] text-muted-foreground">{t("drawerNow")}</div>
              <div className="font-semibold tabular-nums">{formatMoney(expected, lang, currency)}</div>
            </div>
            <div className="space-y-2">
              <Label>{ar ? "ما عدّته فعلًا" : "What you actually counted"}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={closing}
                onChange={(e) => setClosing(e.target.value)}
                aria-label={ar ? "مبلغ العدّ عند الإقفال" : "Closing count"}
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("variancePreview")}:{" "}
              <span className={`font-semibold tabular-nums ${previewVariance < 0 ? "text-destructive" : ""}`}>
                {formatMoney(previewVariance, lang, currency)}
              </span>
              {" — "}
              {ar
                ? "الرقم الذي يُحسب هو ما تحسبه الدفاتر عند الإقفال، لا هذا العرض."
                : "the stored figure is the one the books compute at close, not this preview."}
            </div>
            <div className="space-y-2">
              <Label>{t("handoverPick")}</Label>
              <Select value={receiver} onValueChange={setReceiver}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{ar ? "إقفال بدون تسليم" : "Close without handover"}</SelectItem>
                  {candidates.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {person(c.full_name)}{c.roles ? ` — ${c.roles}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {candidates.length === 0 && (
                <div className="text-[11px] text-muted-foreground">
                  {ar ? "لا يوجد زميل قابل للتسليم في هذا الفرع." : "No one in this branch can take the drawer."}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("notes")}</Label>
              <Textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={2} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseOpen(false)} disabled={closeBusy}>{t("cancel")}</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => void submitClose()} disabled={closeBusy}>
              {closeBusy ? t("loading") : t("shiftClose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
