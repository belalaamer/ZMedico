import type { Database } from "@/integrations/supabase/types";
import type { DictKey } from "@/lib/i18n";

// A translation key built by string arithmetic is a key the compiler cannot
// see. `t(("visit_" + r.visit_type) as any)` looks like a translation and is
// not: `t()` takes `DictKey`, so the `as any` is what lets the call compile, and
// `t()` answers a miss with the key itself (`I18nContext.tsx:110`). On the
// medical-records list that printed `visit_follow_up` in BOTH languages,
// because no `visit_*` key exists — the dictionaries hold `visitFollowUp`.
//
// These maps are the same translation, spelled as data. The value type is
// `DictKey`, so a key that is not in the English dictionary is a build error
// rather than a string on screen, and the key type is `Record<enum, DictKey>`,
// so a new Postgres label fails compilation until the desk names it.
//
// They also end the two-vocabulary problem. The dictionaries are what every
// form control in the app already renders (`<SelectItem value="lab_result">
// {t("docLabResult")}</SelectItem>`), so routing the badges through the same
// keys means a dropdown and the badge under it cannot disagree.

type E<K extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][K];

export const VISIT_TYPE_KEY: Record<E<"visit_type">, DictKey> = {
  consultation: "visitConsultation",
  follow_up: "visitFollowUp",
  procedure: "visitProcedure",
  emergency: "visitEmergency",
};

// `doc` + the value with underscores stripped and only the first letter
// raised produced `docLabresult` and `docCtscan` — two of the seven document
// types, on both desks, forever. The real keys raise every word.
export const DOCUMENT_TYPE_KEY: Record<E<"document_type">, DictKey> = {
  lab_result: "docLabResult",
  xray: "docXray",
  mri: "docMri",
  ct_scan: "docCt",
  prescription: "docPrescription",
  report: "docReport",
  other: "docOther",
};

// Every screen that reads these columns types its row `any`, so the compiler
// cannot promise the value is in the domain: a stray `walk_in` (the shape the
// fixtures already use) is a real value in a real row. `t(undefined)` renders
// nothing, which is worse than the token it replaced, so an unmapped value
// falls back to exactly what the pre-batch screen showed.
function dictKey<K extends string>(map: Record<K, DictKey>, value: unknown): DictKey | undefined {
  return typeof value === "string" ? map[value as K] : undefined;
}

/** Label one Postgres enum value with the dictionary's word for it.
 *
 *  Same contract as `visitTypeLabel()` and `documentTypeLabel()` below, for the
 *  domains that do not need an arithmetic-proof of their own: a blank cell reads
 *  `—`, a value inside the domain reads the dictionary, and a value outside it
 *  reads the stored token. Nothing in here can render a key. */
export function enumCopy<K extends string>(
  map: Record<K, DictKey>,
  value: string | null | undefined,
  t: (k: DictKey) => string
): string {
  if (value === null || value === undefined || value === "") return "—";
  const key = dictKey(map, value);
  return key ? t(key) : value;
}

export function visitTypeLabel(
  value: string | null | undefined,
  t: (k: DictKey) => string
): string {
  return enumCopy(VISIT_TYPE_KEY, value, t);
}

export function documentTypeLabel(
  value: string | null | undefined,
  t: (k: DictKey) => string
): string {
  return enumCopy(DOCUMENT_TYPE_KEY, value, t);
}

// ─── Batch 23 (C21): the columns that were labelled by coincidence ───────────
//
// These nine domains were already spelled `t(row.column as any)` on 29 screens,
// and every one of them rendered correctly — because the dictionaries happen to
// key most enum values under the exact token Postgres stores. That is a
// coincidence with no owner: rename `bank_transfer` in the enum, or add a value,
// and the cast is what stops the build from noticing, while `t()` answers the
// miss by printing the miss. Naming the same translation in a
// `Record<enum, DictKey>` costs nothing (the keys below are the stored values)
// and moves the guarantee from "today the words line up" to "the compiler says
// so", which is the whole of batch 23: no desk sees a different word.
//
// The two non-identity maps at the bottom are not renaming anything either —
// `topup`/`root_canal` have never had a dictionary key equal to their stored
// value, so the words come from the local maps these screens already used
// (`typeKey` in PatientWalletTab, `STATUS_LABEL` in PatientDental) and are moved
// here verbatim so one vocabulary cannot fork in a second file.

export const PAYMENT_METHOD_KEY: Record<E<"payment_method">, DictKey> = {
  cash: "cash",
  card: "card",
  bank_transfer: "bank_transfer",
  insurance: "insurance",
  wallet: "wallet",
};

// `expenses.payment_method` is the `expense_method` enum, not `payment_method` —
// three of the five values, and its own domain in types.ts, so it gets its own
// total map instead of a subset cast.
export const EXPENSE_METHOD_KEY: Record<E<"expense_method">, DictKey> = {
  cash: "cash",
  card: "card",
  bank_transfer: "bank_transfer",
};

export const GENDER_KEY: Record<E<"gender">, DictKey> = {
  male: "male",
  female: "female",
};

export const APPOINTMENT_STATUS_KEY: Record<E<"appointment_status">, DictKey> = {
  scheduled: "scheduled",
  confirmed: "confirmed",
  in_progress: "in_progress",
  completed: "completed",
  cancelled: "cancelled",
  no_show: "no_show",
  departed: "departed",
};

// `reminders.reminder_type` is typed with the `reminder_channel` enum
// (types.ts:6187): the column is the channel the reminder goes out on.
export const REMINDER_CHANNEL_KEY: Record<E<"reminder_channel">, DictKey> = {
  sms: "sms",
  email: "email",
  whatsapp: "whatsapp",
  push: "push",
};

export const REMINDER_STATUS_KEY: Record<E<"reminder_status">, DictKey> = {
  pending: "pending",
  sent: "sent",
  failed: "failed",
  cancelled: "cancelled",
};

export const REPORT_FREQUENCY_KEY: Record<E<"report_frequency">, DictKey> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
};

export const TREASURY_TX_TYPE_KEY: Record<E<"treasury_tx_type">, DictKey> = {
  income: "income",
  expense: "expense",
  transfer: "transfer",
};

export const WALLET_TX_TYPE_KEY: Record<E<"wallet_tx_type">, DictKey> = {
  topup: "txTopup",
  spend: "txSpend",
  refund: "txRefund",
  referral_reward: "txReferralReward",
  adjustment_credit: "txAdjustmentCredit",
  adjustment_debit: "txAdjustmentDebit",
};

export const TOOTH_STATUS_KEY: Record<E<"tooth_status">, DictKey> = {
  healthy: "chartLegendHealthy",
  caries: "chartLegendCaries",
  filled: "chartLegendFilled",
  crown: "chartLegendCrown",
  implant: "chartLegendImplant",
  extracted: "chartLegendExtracted",
  root_canal: "chartLegendRootCanal",
  bridge: "chartLegendBridge",
};

// ─── Batch 23 (C21): the four screens that built their key by arithmetic ──────

// Batch 22 found five `t()` calls that composed a key from a stored value —
// `` t(`status${upperFirst(a.status)}` as any) `` and its three siblings — and
// froze them as registered derivations: proven to land on a real key for every
// value the domain can hold. Batch 23 writes those same keys down as maps, so
// the derivation, the cast, and the need for that proof are all gone: a value
// with no word is now a compile error, not a string that reaches `t()` and gets
// printed. Every entry is the exact key the old derivation computed, asserted in
// the contract test rather than trusted here.
//
// These are a *second* vocabulary for `appointment_status`: Dashboard labels an
// appointment badge `statusConfirmed`, PatientOverviewSnapshot labels the same
// row through `APPOINTMENT_STATUS_KEY`. Copy is untouched by this batch, so both
// stay and the split is counted in the C19 recount instead of being decided here.

export const STATUS_KEY_BY_APPOINTMENT_STATUS: Record<E<"appointment_status">, DictKey> = {
  scheduled: "statusScheduled",
  confirmed: "statusConfirmed",
  in_progress: "statusInProgress",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
  no_show: "statusNoShow",
  departed: "statusDeparted",
};

export const STATUS_KEY_BY_LEAVE_REQUEST_STATUS: Record<E<"leave_request_status">, DictKey> = {
  pending: "statusPending",
  approved: "statusApproved",
  rejected: "statusRejected",
  cancelled: "statusCancelled",
};

export const STATUS_KEY_BY_PAYROLL_STATUS: Record<E<"payroll_status">, DictKey> = {
  draft: "statusDraft",
  approved: "statusApproved",
  paid: "statusPaid",
};

// Not a Postgres enum: StockOverview's adjustment dialog offers these six values
// itself, and the list is the domain. The contract test compares this map to the
// `REASONS` array on the page, so adding a reason without a word stops the build.
export type StockAdjustmentReason = "restock" | "damage" | "theft" | "count" | "expired" | "other";

export const REASON_KEY_BY_STOCK_ADJUSTMENT: Record<StockAdjustmentReason, DictKey> = {
  restock: "reasonRestock",
  damage: "reasonDamage",
  theft: "reasonTheft",
  count: "reasonCount",
  expired: "reasonExpired",
  other: "reasonOther",
};
