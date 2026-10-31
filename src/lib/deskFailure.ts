// S1: every desk screen used to print `error.message` straight into a toast.
// PostgREST fills that field with the database's own sentence, so an Arabic
// receptionist saw things like
//   duplicate key value violates unique constraint "patients_patient_code_active_key"
//   new row violates row-level security policy for table "appointments"
//   This appointments belongs to branch 4f2c…-…, but the patient belongs to a different branch.
// None of those say what to do, none of them are translated, and the last one puts
// a row identifier on screen. What the desk can act on is the *class* of the
// failure, so the codes and the raise texts these screens actually provoke are
// mapped below to a sentence plus the advice that goes with it. The server's own
// words are never copied into the result.
//
// Reachability was read out of the migrations, not guessed: `appointments` writes
// (Queue walk-in / status / reassign / room, Calendar save / cancel / status), the
// `patients` insert and soft delete, and the three RPCs these screens call
// (`create_self_checkin_link`, `list_doctors_for_service`, and the row-level
// security policies behind them). `booking_request_expired`, `slot_unavailable` and
// the rejection-reason raises are deliberately absent: CalendarPage and
// PendingBookings already carry their own bilingual copy for those two tokens, and
// a second voice for the same raise would only drift. In-app sentinels are absent
// for the same kind of reason: `branch_required` is refused at every call site
// before the call (Queue.tsx shows `selectBranch` instead), and the consultation
// sentinels already have bilingual copy in `queueConsultation.ts`.

export type DeskFailureCopy = { title: string; description?: string };

type Rule = { en: string; ar: string; hintEn?: string; hintAr?: string };

const MISSING: Rule = {
  en: "This record is missing or no longer available to you.",
  ar: "هذا السجل غير موجود أو لم يعد متاحًا لك.",
  hintEn: "Refresh the list before trying again.",
  hintAr: "حدّث القائمة قبل إعادة المحاولة.",
};

const SESSION: Rule = {
  en: "Your session has expired.",
  ar: "انتهت جلسة الدخول الخاصة بك.",
  hintEn: "Nothing was changed. Sign in again and repeat the action.",
  hintAr: "لم يتغير شيء. سجّل الدخول مجددًا وأعد العملية.",
};

const PERMISSION: Rule = {
  en: "Your account is not allowed to make this change.",
  ar: "حسابك لا يملك صلاحية إجراء هذا التغيير.",
  hintEn: "Check which branch you are working in, or ask the workspace owner for the permission.",
  hintAr: "تأكد من الفرع الذي تعمل عليه، أو اطلب الصلاحية من مالك مساحة العمل.",
};

const CONCURRENT: Rule = {
  en: "Someone else changed this at the same moment.",
  ar: "غيّر مستخدم آخر هذا السجل في نفس اللحظة.",
  hintEn: "Refresh the screen and check the result before retrying.",
  hintAr: "حدّث الشاشة وتحقق من النتيجة قبل إعادة المحاولة.",
};

const UNAVAILABLE: Rule = {
  en: "This action is not available right now.",
  ar: "هذا الإجراء غير متاح حاليًا.",
  hintEn: "Try again shortly. If it keeps failing, contact support.",
  hintAr: "أعد المحاولة بعد قليل، وإن استمر الفشل تواصل مع الدعم.",
};

// Checked before the codes: several RPCs raise their own text with a generic
// ERRCODE, and `check_violation` alone would give the same advice for a dead
// subscription and for a value the desk mistyped.
const TEXTS: Array<{ has: string; rule: Rule }> = [
  { has: "authentication required", rule: SESSION }, // create_self_checkin_link, PostgREST JWT rejection
  { has: "jwt expired", rule: SESSION },
  {
    has: "branch access required", // create_self_checkin_link
    rule: {
      en: "This appointment belongs to a branch you cannot open.",
      ar: "هذا الموعد يخص فرعًا لا تملك صلاحية فتحه.",
      hintEn: "Switch to its branch, or ask for access to it.",
      hintAr: "انتقل إلى فرعه، أو اطلب صلاحية الوصول إليه.",
    },
  },
  {
    has: "appointment not found", // create_self_checkin_link
    rule: MISSING,
  },
  {
    has: "tenant subscription is not active", // create_self_checkin_link
    rule: {
      en: "This clinic's subscription is not active.",
      ar: "اشتراك هذه العيادة غير نشط.",
      hintEn: "Ask the workspace owner to renew it, then try again.",
      hintAr: "اطلب من مالك مساحة العمل تجديده، ثم أعد المحاولة.",
    },
  },
  {
    has: "not eligible for self check-in", // create_self_checkin_link: status outside scheduled/confirmed
    rule: {
      en: "This appointment cannot get a self check-in link.",
      ar: "لا يمكن إصدار رابط تسجيل وصول ذاتي لهذا الموعد.",
      hintEn: "Only scheduled or confirmed appointments can be checked in this way.",
      hintAr: "الرابط متاح للمواعيد المجدولة أو المؤكدة فقط.",
    },
  },
  {
    has: "doctor_not_available_for_service", // list_doctors_for_service
    rule: {
      en: "This doctor does not provide the service you selected.",
      ar: "هذا الطبيب لا يقدّم الخدمة التي اخترتها.",
      hintEn: "Choose another doctor, or clear the service choice.",
      hintAr: "اختر طبيبًا آخر، أو ألغِ اختيار الخدمة.",
    },
  },
  {
    has: "plan_limit_patients_reached", // trg_plan_limit_patients on the patients insert
    rule: {
      en: "This plan has reached its patient limit.",
      ar: "وصلت هذه الباقة إلى حد عدد المرضى.",
      hintEn: "Remove an inactive patient, or ask the workspace owner to change the plan.",
      hintAr: "أزل مريضًا غير نشط، أو اطلب من مالك مساحة العمل تغيير الباقة.",
    },
  },
  {
    // tg_enforce_branch_referential_integrity: its message interpolates a branch UUID.
    has: "belongs to a different branch",
    rule: {
      en: "This patient belongs to another branch.",
      ar: "هذا المريض يخص فرعًا آخر.",
      hintEn: "Choose a patient from the branch you are working in.",
      hintAr: "اختر مريضًا من الفرع الذي تعمل عليه.",
    },
  },
];

const CODES: Record<string, Rule> = {
  "23505": {
    en: "That value is already used by another record.",
    ar: "هذه القيمة مستخدمة بالفعل في سجل آخر.",
    hintEn: "Change it, or edit the record that already has it.",
    hintAr: "غيّرها، أو عدّل السجل الذي يستخدمها.",
  },
  "23502": {
    en: "A required field was left empty.",
    ar: "أحد الحقول المطلوبة تركته فارغًا.",
    hintEn: "Fill it in and save again.",
    hintAr: "املأه ثم احفظ مجددًا.",
  },
  "23503": {
    en: "The record this one points to no longer exists.",
    ar: "السجل المرتبط بهذا السجل لم يعد موجودًا.",
    hintEn: "Refresh the screen and choose it again.",
    hintAr: "حدّث الشاشة واختره من جديد.",
  },
  "23514": {
    en: "The clinic's rules rejected one of these values.",
    ar: "قواعد العيادة رفضت إحدى هذه القيم.",
    hintEn: "Check what you entered and try again.",
    hintAr: "تحقق مما أدخلته وأعد المحاولة.",
  },
  "22001": {
    en: "One of the values is longer than this field allows.",
    ar: "إحدى القيم أطول مما يسمح به هذا الحقل.",
    hintEn: "Shorten it and try again.",
    hintAr: "اختصرها ثم أعد المحاولة.",
  },
  "22023": { en: "One of the values is outside the range this action accepts.", ar: "إحدى القيم خارج النطاق الذي يقبله هذا الإجراء." },
  "22p02": {
    en: "One of the values is in a format this field cannot store.",
    ar: "إحدى القيم بتنسيق لا يستطيع هذا الحقل تخزينه.",
    hintEn: "Check the format of what you entered and try again.",
    hintAr: "راجع تنسيق ما أدخلته وأعد المحاولة.",
  },
  "42501": PERMISSION,
  "40001": CONCURRENT,
  "40p01": CONCURRENT,
  "55p03": CONCURRENT,
  "p0002": MISSING,
  "42883": UNAVAILABLE,
  // PostgREST's own codes: 116 is `.single()/.maybeSingle()` finding no row, 202 is
  // a table or function the API no longer resolves.
  "pgrst116": MISSING,
  "pgrst202": UNAVAILABLE,
};

// Advice for a failure the tables do not know: it cannot promise nothing changed
// (a timeout or a 5xx may have applied), so it tells the desk to look.
const UNKNOWN_HINT = {
  en: "Refresh the screen and check the result before retrying.",
  ar: "حدّث الشاشة وتحقق من النتيجة قبل إعادة المحاولة.",
};

function knownRule(error: unknown): Rule | null {
  const err = error as { code?: unknown; message?: unknown } | null | undefined;
  const message = typeof err?.message === "string" ? err.message.toLowerCase() : "";
  for (const { has, rule } of TEXTS) {
    if (message.includes(has)) return rule;
  }
  const code = typeof err?.code === "string" ? err.code.toLowerCase() : "";
  return code ? CODES[code] ?? null : null;
}

/**
 * `fallbackTitle` is the screen's own sentence, already in `lang` — its existing
 * `t()` key or an inline `lang === "ar" ? … : …`. It is what the desk reads when
 * nothing above recognises the failure, so a new server message degrades to the
 * words this screen already used, never to the server's.
 */
export function deskFailure(error: unknown, lang: string, fallbackTitle: string): DeskFailureCopy {
  const ar = lang === "ar";
  const rule = knownRule(error);
  if (rule) {
    return {
      title: ar ? rule.ar : rule.en,
      description: (ar ? rule.hintAr ?? UNKNOWN_HINT.ar : rule.hintEn ?? UNKNOWN_HINT.en),
    };
  }
  // `null` is how a caller reports "the response simply did not confirm the
  // write"; that is not a server refusal, so the screen's sentence stands alone.
  if (!error) return { title: fallbackTitle };
  return { title: fallbackTitle, description: ar ? UNKNOWN_HINT.ar : UNKNOWN_HINT.en };
}
