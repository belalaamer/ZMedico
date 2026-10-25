import { describeEdgeFailure, edgeCode, safeEdgeReason } from "./edgeFailure";

type Lang = "ar" | "en";
const copy = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

// A rejected precondition never started the mutation, so it can be reported as a
// finished failure. Anything else (5xx, 401, transport) may have applied and must
// keep the cautious wording.
const PRECONDITION_STATUS = new Set([400, 403, 404, 405, 409]);

const CODES: Record<string, { en: string; ar: string }> = {
  patient_email_required: {
    en: "Add the patient’s email address first — the portal is invited by email.",
    ar: "أضف البريد الإلكتروني للمريض أولًا؛ دعوة البوابة تُرسل بالبريد.",
  },
};

function codeOf(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_]+$/.test(value) ? value : null;
}

async function read(error: unknown, bodyError: unknown) {
  const f = await describeEdgeFailure(error, "");
  const code = edgeCode(f.body) ?? codeOf(bodyError) ?? codeOf(error);
  return { code, reason: f.message, status: f.status };
}

/** The translated code, or the service's own sentence, or "" when neither is safe. */
export async function portalFailureReason(error: unknown, bodyError: unknown, lang: Lang): Promise<string> {
  const { code, reason } = await read(error, bodyError);
  const known = code ? CODES[code] : undefined;
  if (known) return copy(lang, known.en, known.ar);
  return reason || safeEdgeReason(bodyError, "");
}

export type PortalMutationFailure = {
  definitive: boolean;
  title: string;
  description?: string;
};

export async function portalMutationFailure(
  error: unknown,
  bodyError: unknown,
  lang: Lang,
  unconfirmed: { en: string; ar: string },
): Promise<PortalMutationFailure> {
  const { code, reason, status } = await read(error, bodyError);
  const known = code ? CODES[code] : undefined;
  const title = known ? copy(lang, known.en, known.ar) : reason || safeEdgeReason(bodyError, "");
  if (title && (known || (status !== null && PRECONDITION_STATUS.has(status)))) {
    return { definitive: true, title };
  }
  return {
    definitive: false,
    title: copy(lang, unconfirmed.en, unconfirmed.ar),
    description: copy(
      lang,
      "Nothing was changed until this is confirmed. Refresh the account status before retrying.",
      "لم يتغير شيء حتى التأكد من هذه العملية. حدّث حالة الحساب قبل إعادة المحاولة.",
    ),
  };
}
