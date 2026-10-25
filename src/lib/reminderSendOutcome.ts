import { describeEdgeFailure, edgeCount, safeEdgeReason } from "./edgeFailure";

type Lang = "ar" | "en";

export type ReminderSendOutcome = {
  tone: "success" | "error";
  title: string;
  description?: string;
};

const copy = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

function count(body: Record<string, unknown> | null, key: string, fallback = 0): number {
  return edgeCount(body, key) ?? fallback;
}

/**
 * `send-reminder` answers a completed-but-unrecordable send with HTTP 500 and the
 * counters still in the body. Treating that as an ordinary failure hides the one
 * case where retrying would text the patient twice.
 */
export async function reminderSendOutcome(opts: {
  data: Record<string, unknown> | null;
  error: unknown;
  lang: Lang;
  single?: boolean;
}): Promise<ReminderSendOutcome> {
  const { lang, single = false } = opts;
  const failure = await describeEdgeFailure(opts.error, copy(lang, "Sending reminders failed.", "تعذر إرسال التنبيهات."));
  const body = (opts.error ? failure.body : opts.data) as Record<string, unknown> | null;

  if (opts.error) {
    const unconfirmed = Array.isArray(body?.sent_unconfirmed) ? body!.sent_unconfirmed!.length : 0;
    if (unconfirmed > 0) {
      const processed = count(body, "processed");
      return {
        tone: "error",
        title: copy(lang, "Sent but not recorded", "أُرسلت دون أن تُسجَّل"),
        description: copy(
          lang,
          `${unconfirmed} of ${processed} messages were accepted by the provider but their reminder rows are still pending. Reload the list before sending again — a second run delivers the message twice.`,
          `${unconfirmed} من ${processed} رسالة قبلها المزوّد لكن سجلات التنبيه ما زالت معلّقة. حدِّث القائمة قبل أي إرسال آخر، لأن إعادة التشغيل تصل للمريض مرتين.`,
        ),
      };
    }
    const maxBatch = edgeCount(body, "max_batch");
    return {
      tone: "error",
      title: failure.message,
      description: maxBatch
        ? copy(lang, `Send at most ${maxBatch} reminders at a time.`, `أرسل ${maxBatch} تنبيهًا على الأكثر في المرة الواحدة.`)
        : failure.status === 429
          ? copy(lang, "Wait a minute, then send again.", "انتظر دقيقة ثم أعد الإرسال.")
          : undefined,
    };
  }

  if (!opts.data) {
    return { tone: "error", title: copy(lang, "The send did not report a result.", "لم يُبلَّغ عن نتيجة الإرسال.") };
  }

  const sent = count(body, "sent");
  const failed = count(body, "failed");
  const processed = count(body, "processed");
  const deferred = count(body, "deferred");

  if (single) {
    const first = Array.isArray(opts.data.results) ? (opts.data.results as Record<string, unknown>[])[0] : undefined;
    if (first && first.ok !== true) {
      return { tone: "error", title: safeEdgeReason(first.error, copy(lang, "The reminder was not sent.", "لم يُرسل التنبيه.")) };
    }
    if (first || sent > 0) return { tone: "success", title: copy(lang, "Reminder sent", "تم إرسال التنبيه") };
    return { tone: "error", title: copy(lang, "The reminder was not sent.", "لم يُرسل التنبيه.") };
  }

  if (processed === 0) {
    return { tone: "success", title: copy(lang, "No reminders were due", "لا توجد تنبيهات مستحقة") };
  }
  return {
    tone: failed > 0 ? "error" : "success",
    title: copy(lang, `Sent ${sent}, failed ${failed}`, `تم إرسال ${sent} وفشل ${failed}`),
    description: deferred > 0
      ? copy(lang, `${deferred} are not due yet and were left pending.`, `${deferred} لم يحن موعدها بعد وترِكت معلّقة.`)
      : undefined,
  };
}
