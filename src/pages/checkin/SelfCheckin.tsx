import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Globe2, Link2Off, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { ActionButton, Panel } from "@/components/zds/surface";
import { cn } from "@/lib/utils";
import {
  getSelfCheckinToken,
  localizedBranchName,
  localizedClinicName,
  mapSelfCheckinDetailsState,
  mapSelfCheckinResultState,
  selfCheckinUnavailableReason,
  type PublicSelfCheckinDetails,
} from "@/lib/selfCheckin";
import { toast } from "sonner";

function publicRpc<T>(name: string, params: Record<string, unknown>) {
  const client = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: { message?: string } | null }>;
  };
  return client.rpc(name, params);
}

function formatAppointmentTime(iso: string | null, language: "ar" | "en") {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(language === "ar" ? "ar-EG" : "en-EG", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SelfCheckin() {
  const { lang, setLang } = useI18n();
  const [details, setDetails] = useState<PublicSelfCheckinDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [resultState, setResultState] = useState<"idle" | "success" | "closed" | "invalid" | "error">("idle");

  const token = useMemo(() => getSelfCheckinToken(window.location.search), []);
  const detailsState = mapSelfCheckinDetailsState(details);
  const language = lang === "ar" ? "ar" : "en";
  const isArabic = language === "ar";

  useEffect(() => {
    let cancelled = false;
    const loadDetails = async () => {
      if (!token) {
        setLoading(false);
        setResultState("invalid");
        return;
      }
      const { data, error } = await publicRpc<PublicSelfCheckinDetails[]>("public_self_checkin_details", { p_token: token });
      if (cancelled) return;
      if (error) {
        setResultState("error");
      } else {
        const nextDetails = Array.isArray(data) ? data[0] ?? null : null;
        setDetails(nextDetails);
        setResultState(mapSelfCheckinDetailsState(nextDetails) === "ready" ? "idle" : "invalid");
      }
      setLoading(false);
    };
    void loadDetails();
    return () => { cancelled = true; };
  }, [token]);

  const submitCheckin = async () => {
    if (!token || detailsState !== "ready" || checkingIn) return;
    setCheckingIn(true);
    const { data, error } = await publicRpc<Array<{ success?: boolean; state?: string | null; checked_in_at?: string | null }>>("public_self_checkin", { p_token: token });
    setCheckingIn(false);
    const row = Array.isArray(data) ? data[0] : null;
    const nextState = mapSelfCheckinResultState(row, Boolean(error));
    setResultState(nextState);
    if (nextState === "success") toast.success(isArabic ? "تم تسجيل وصولك بنجاح" : "You are checked in");
  };

  const clinicName = details ? localizedClinicName(details, language) : "ZMedico";
  const branchName = details ? localizedBranchName(details, language) : "";

  const copy = {
    title: isArabic ? "تسجيل الوصول" : "Self check-in",
    subtitle: isArabic ? "سجّل وصولك للموعد من هاتفك بسهولة" : "Check in for your appointment from your phone",
    missingTitle: isArabic ? "رابط تسجيل الوصول غير مكتمل" : "This check-in link is incomplete",
    missingBody: isArabic ? "لم يجد هاتفك رمز تسجيل الوصول داخل الرابط. افتح الرسالة كاملة أو اطلب من موظف الاستقبال إرسال رابط جديد." : "Your phone did not find a check-in code inside this link. Open the full message, or ask the front desk to send a new link.",
    rejectedTitle: isArabic ? "رابط تسجيل الوصول لم يعد مقبولًا" : "This check-in link is no longer accepted",
    rejectedBody: isArabic ? "ربما انتهت صلاحية الرابط أو حلّ محله رابط أحدث. اطلب من الاستقبال إرسال رابط جديد، أو سجّل وصولك معهم مباشرة." : "The link may have expired or been replaced by a newer one. Ask the front desk to send a new link, or check in with them directly.",
    unavailableTitle: isArabic ? "تسجيل الوصول الإلكتروني غير متاح حاليًا" : "Online check-in is unavailable right now",
    unavailableBody: isArabic ? "يرجى تسجيل وصولك مع فريق الاستقبال عند وصولك — يمكنهم مساعدتك مباشرة." : "Please check in with the front desk when you arrive — they can help you directly.",
    errorTitle: isArabic ? "تعذر تحميل الرابط" : "We could not load this link",
    errorBody: isArabic ? "تحقق من اتصال الإنترنت وحاول مرة أخرى." : "Check your internet connection and try again.",
    readyTitle: isArabic ? "موعدك جاهز لتسجيل الوصول" : "Your appointment is ready",
    readyBody: isArabic ? "راجع الوقت والفرع ثم اضغط تسجيل الوصول عند وصولك إلى العيادة." : "Review the time and branch, then check in when you arrive at the clinic.",
    appointment: isArabic ? "الموعد" : "Appointment",
    branch: isArabic ? "الفرع" : "Branch",
    confirm: isArabic ? "تسجيل الوصول الآن" : "Check in now",
    successTitle: isArabic ? "تم تسجيل الوصول" : "You are checked in",
    successBody: isArabic ? "تم إبلاغ فريق الاستقبال بوصولك. يمكنك التوجه إلى منطقة الانتظار." : "The front desk has been notified. You can proceed to the waiting area.",
    closedTitle: isArabic ? "تسجيل الوصول مغلق" : "Check-in is closed",
    closedBody: isArabic ? "تسجيل الوصول الذاتي غير متاح لهذا الموعد حاليًا. إذا كنت في العيادة، يمكن لفريق الاستقبال تسجيل وصولك." : "Self check-in is not open for this appointment right now. If you are at the clinic, the front desk can check you in.",
    retry: isArabic ? "إعادة المحاولة" : "Try again",
    privacy: isArabic ? "لا نطلب اسمك أو رقم هاتفك أو أي تفاصيل طبية عبر هذا الرابط." : "We do not ask for your name, phone number, or medical details through this link.",
  };

  /** One shape for every non-ready state: a mark, a title, one sentence, and an optional action. */
  function StateCard({
    tone,
    icon,
    title,
    body,
    action,
  }: {
    tone: "positive" | "critical" | "neutral";
    icon: React.ReactNode;
    title: string;
    body: string;
    action?: React.ReactNode;
  }) {
    const mark = {
      positive: "bg-z-positive-fill text-z-positive-ink",
      critical: "bg-z-critical-fill text-z-critical-ink",
      neutral: "bg-z-sunk text-z-ink-500",
    }[tone];
    return (
      <div className="py-z5 text-center" role={tone === "critical" ? "alert" : "status"}>
        <div className={cn("mx-auto flex size-14 items-center justify-center rounded-z2 [&_svg]:size-7", mark)}>{icon}</div>
        <h2 className="mt-z4 text-z-subtitle rtl:text-z-subtitle-ar font-semibold text-z-ink-900">{title}</h2>
        <p className="mt-z2 text-z-small rtl:text-z-small-ar text-z-ink-500">{body}</p>
        {action}
      </div>
    );
  }

  const body = (() => {
    if (loading) {
      return (
        <div className="flex min-h-48 items-center justify-center" role="status" aria-live="polite">
          <Loader2 className="size-6 animate-spin text-z-ink-400" />
        </div>
      );
    }
    if (resultState === "success") {
      return <StateCard tone="positive" icon={<CheckCircle2 aria-hidden="true" />} title={copy.successTitle} body={copy.successBody} />;
    }
    if (resultState === "closed") {
      return <StateCard tone="neutral" icon={<Link2Off aria-hidden="true" />} title={copy.closedTitle} body={copy.closedBody} />;
    }
    if (resultState === "error") {
      return (
        <StateCard
          tone="critical"
          icon={<Link2Off aria-hidden="true" />}
          title={copy.errorTitle}
          body={copy.errorBody}
          action={
            <ActionButton tone="quiet" className="mt-z5" onClick={() => window.location.reload()}>
              {copy.retry}
            </ActionButton>
          }
        />
      );
    }
    if (resultState === "invalid" || detailsState !== "ready" || !details) {
      // Four causes are observable here: no usable token ever left the URL, and the
      // three reasons the RPC can now name for a real token (invalid / closed /
      // clinic_unavailable). A missing or unknown reason stays "invalid" so an RPC
      // that predates the reason column degrades to the old single card.
      const reason = token === null ? null : selfCheckinUnavailableReason(details);
      const [title, message] =
        reason === null ? [copy.missingTitle, copy.missingBody]
        : reason === "closed" ? [copy.closedTitle, copy.closedBody]
        : reason === "clinic_unavailable" ? [copy.unavailableTitle, copy.unavailableBody]
        : [copy.rejectedTitle, copy.rejectedBody];
      return <StateCard tone="critical" icon={<Link2Off aria-hidden="true" />} title={title} body={message} />;
    }
    return (
      <div className="space-y-z5">
        <div>
          <p className="text-z-small rtl:text-z-small-ar font-medium text-z-ink-900">{copy.readyTitle}</p>
          <p className="mt-z1 text-z-small rtl:text-z-small-ar text-z-ink-500">{copy.readyBody}</p>
        </div>
        <div className="space-y-z3 rounded-z3 border border-z-line-edge bg-z-sunk px-z4 py-z4">
          <div className="flex items-start gap-z3">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-z-brand-500" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{copy.appointment}</p>
              <p className="text-z-small rtl:text-z-small-ar font-medium text-z-ink-900">{formatAppointmentTime(details.scheduled_at, language)}</p>
            </div>
          </div>
          <div className="border-t border-z-line-hairline" />
          <div className="flex items-start gap-z3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-z-brand-500" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{copy.branch}</p>
              <p className="text-z-small rtl:text-z-small-ar font-medium text-z-ink-900">{branchName || clinicName}</p>
            </div>
          </div>
        </div>
        <ActionButton className={cn("h-z12 w-full")} onClick={() => void submitCheckin()} disabled={checkingIn}>
          {checkingIn ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
          {copy.confirm}
        </ActionButton>
      </div>
    );
  })();

  return (
    <main className="z-desk min-h-screen px-z4 py-z6 sm:py-z10" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-lg flex-col justify-center">
        <header className="mb-z5 flex items-center justify-between gap-z3 px-z1">
          <div className="flex items-center gap-z3">
            <div className="flex size-10 items-center justify-center rounded-z2 bg-z-brand-050 text-z-brand-700 [&_svg]:size-5">
              <ShieldCheck aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-z-small rtl:text-z-small-ar font-semibold text-z-ink-900">{clinicName}</p>
              <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{copy.subtitle}</p>
            </div>
          </div>
          <ActionButton
            tone="ghost"
            onClick={() => setLang(isArabic ? "en" : "ar")}
            aria-label={isArabic ? "Switch to English" : "التبديل إلى العربية"}
          >
            <Globe2 className="size-4" aria-hidden="true" />
            {isArabic ? "EN" : "عربي"}
          </ActionButton>
        </header>
        <Panel className="overflow-hidden">
          <div className="border-b border-z-line-hairline px-z6 py-z4">
            <h1 className="text-z-subtitle rtl:text-z-subtitle-ar font-semibold text-z-ink-900">{copy.title}</h1>
            <p className="mt-z1 flex items-center gap-z2 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
              <Clock3 className="size-4 shrink-0" aria-hidden="true" />
              {copy.privacy}
            </p>
          </div>
          <div className="px-z6 py-z5">{body}</div>
        </Panel>
        <p className="mt-z5 text-center text-z-micro rtl:text-z-micro-ar text-z-ink-500">
          {isArabic ? "للمساعدة، تواصل مع فريق الاستقبال في العيادة." : "For help, contact your clinic's front desk."}
        </p>
      </div>
    </main>
  );
}
