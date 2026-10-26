// PostgREST reports a write that RLS filtered to zero rows as a plain success:
// no error, HTTP 2xx, empty body. Every guarded write in the app therefore has
// to ask for the rows it actually touched before it is allowed to say "Saved".
export function rowsWritten(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  return data == null || data === false ? 0 : 1;
}

export type WriteOutcome = "delete" | "save" | "own";

const COPY: Record<WriteOutcome, { ar: string; en: string }> = {
  delete: {
    ar: "لم يتم الحذف — السجل لم يعد متاحًا في هذا الفرع أو كان محذوفًا بالفعل.",
    en: "Nothing was deleted — the record is no longer available in this branch, or it was already deleted.",
  },
  save: {
    ar: "لم يتم الحفظ — السجل لم يعد متاحًا في هذا الفرع أو عدّله مستخدم آخر.",
    en: "Nothing was saved — the record is no longer available in this branch, or another user changed it.",
  },
  own: {
    ar: "لا يمكن حذف هذا العنصر لأنه يخص مستخدمًا آخر.",
    en: "This item belongs to another user, so it cannot be deleted.",
  },
};

export function notConfirmedCopy(lang: string, outcome: WriteOutcome): string {
  const c = COPY[outcome];
  return lang === "ar" ? c.ar : c.en;
}
