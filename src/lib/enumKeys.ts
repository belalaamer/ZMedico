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

export function visitTypeLabel(
  value: string | null | undefined,
  t: (k: DictKey) => string
): string {
  if (value === null || value === undefined || value === "") return "—";
  const key = dictKey(VISIT_TYPE_KEY, value);
  return key ? t(key) : value;
}

export function documentTypeLabel(
  value: string | null | undefined,
  t: (k: DictKey) => string
): string {
  if (value === null || value === undefined || value === "") return "—";
  const key = dictKey(DOCUMENT_TYPE_KEY, value);
  return key ? t(key) : value;
}
