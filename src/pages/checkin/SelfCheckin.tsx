import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Globe2, Link2Off, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import {
  getSelfCheckinToken,
  localizedBranchName,
  localizedClinicName,
  mapSelfCheckinDetailsState,
  mapSelfCheckinResultState,
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
    invalidTitle: isArabic ? "الرابط غير صالح أو منتهي" : "This link is invalid or expired",
    invalidBody: isArabic ? "اطلب من موظف الاستقبال إرسال رابط جديد. لا تحاول مشاركة بيانات شخصية هنا." : "Ask the front desk for a new link. Do not enter personal information here.",
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
    closedBody: isArabic ? "هذا الموعد لم يعد متاحًا لتسجيل الوصول الذاتي. تواصل مع العيادة إذا احتجت مساعدة." : "This appointment is no longer available for self check-in. Contact the clinic if you need help.",
    retry: isArabic ? "إعادة المحاولة" : "Try again",
    privacy: isArabic ? "لا نطلب اسمك أو رقم هاتفك أو أي تفاصيل طبية عبر هذا الرابط." : "We do not ask for your name, phone number, or medical details through this link.",
  };

  const body = (() => {
    if (loading) {
      return <div className="flex min-h-48 items-center justify-center" role="status" aria-live="polite"><Loader2 className="size-6 animate-spin text-primary" /></div>;
    }
    if (resultState === "success") {
      return (
        <div className="py-5 text-center">
          <CheckCircle2 className="mx-auto size-14 text-emerald-600" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">{copy.successTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{copy.successBody}</p>
        </div>
      );
    }
    if (resultState === "closed") {
      return (
        <div className="py-5 text-center">
          <Link2Off className="mx-auto size-12 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">{copy.closedTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{copy.closedBody}</p>
        </div>
      );
    }
    if (resultState === "error") {
      return (
        <div className="py-5 text-center">
          <Link2Off className="mx-auto size-12 text-destructive" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">{copy.errorTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{copy.errorBody}</p>
          <Button className="mt-5" variant="outline" onClick={() => window.location.reload()}>{copy.retry}</Button>
        </div>
      );
    }
    if (resultState === "invalid" || detailsState !== "ready" || !details) {
      return (
        <div className="py-5 text-center">
          <Link2Off className="mx-auto size-12 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">{copy.invalidTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{copy.invalidBody}</p>
        </div>
      );
    }
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium">{copy.readyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.readyBody}</p>
        </div>
        <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="text-xs text-muted-foreground">{copy.appointment}</p><p className="font-medium">{formatAppointmentTime(details.scheduled_at, language)}</p></div></div>
          <Separator />
          <div className="flex items-start gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="text-xs text-muted-foreground">{copy.branch}</p><p className="font-medium">{clinicName}{branchName ? ` · ${branchName}` : ""}</p></div></div>
        </div>
        <Button className="w-full" size="lg" onClick={() => void submitCheckin()} disabled={checkingIn}>
          {checkingIn ? <Loader2 className="me-2 size-4 animate-spin" /> : <CheckCircle2 className="me-2 size-4" />}
          {copy.confirm}
        </Button>
      </div>
    );
  })();

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background px-4 py-6 sm:py-10" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-lg flex-col justify-center">
        <header className="mb-5 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2"><div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></div><div><p className="font-semibold">{clinicName}</p><p className="text-xs text-muted-foreground">{copy.subtitle}</p></div></div>
          <Button variant="ghost" size="sm" onClick={() => setLang(isArabic ? "en" : "ar")} aria-label={isArabic ? "Switch to English" : "التبديل إلى العربية"}><Globe2 className="me-1 size-4" />{isArabic ? "EN" : "عربي"}</Button>
        </header>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>{copy.title}</CardTitle><CardDescription className="flex items-center gap-2"><Clock3 className="size-4" />{copy.privacy}</CardDescription></CardHeader>
          <CardContent>{body}</CardContent>
        </Card>
        <p className="mt-5 text-center text-xs text-muted-foreground">{isArabic ? "للمساعدة، تواصل مع فريق الاستقبال في العيادة." : "For help, contact your clinic's front desk."}</p>
      </div>
    </main>
  );
}
