import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Stethoscope, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { hasPersistedAuthSession, persistAuthSessionForPreview } from "@/lib/authSessionPersistence";
import { resolvePostAuthDestination } from "@/lib/authRedirect";
import { useTenantBranding } from "@/contexts/TenantBrandingContext";
import { identifierLoginErrorText, signInWithIdentifier } from "@/lib/signInWithIdentifier";
import { isValidEmailAddress, requestPasswordRecovery } from "@/lib/passwordRecovery";
import { reportAuthFailure } from "@/lib/authFailureTelemetry";

function authDebug(message: string, details?: Record<string, unknown>) {
  if (import.meta.env.DEV) console.info("[auth-debug]", message, details ?? {});
}

async function getRolesForRedirect(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) {
    authDebug("post-auth role lookup failed", { error: error.message });
    return [];
  }
  return (data ?? []).map((row) => String(row.role ?? ""));
}

function safeRedirectPath(value?: string | null) {
  if (!value) return "/";
  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const url = new URL(value);
      if (url.origin !== window.location.origin) return "/";
      return `${url.pathname}${url.search}${url.hash}` || "/";
    }
    if (!value.startsWith("/") || value.startsWith("//")) return "/";
    if (value.startsWith("/auth")) return "/";
    return value;
  } catch {
    return "/";
  }
}

export default function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const { branding, isBrandedTenantHost } = useTenantBranding();
  const nav = useNavigate();
  const location = useLocation();
  const selectedPlan = useMemo(() => new URLSearchParams(location.search).get("plan"), [location.search]);
  const requestTrialHref = selectedPlan ? `/request-trial?plan=${encodeURIComponent(selectedPlan)}` : "/request-trial";
  const brandName = branding?.display_name || t("appName");
  const from = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const next = params.get("next");
    const stateFrom = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
    const statePath = stateFrom
      ? `${stateFrom.pathname ?? "/"}${stateFrom.search ?? ""}${stateFrom.hash ?? ""}`
      : null;
    return safeRedirectPath(next ?? statePath ?? "/");
  }, [location.search, location.state]);

  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const resetBusy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    authDebug( "auth page mounted", {
      path: window.location.pathname + window.location.search,
      redirectAfterLogin: from,
      authLoading,
      hasUser: Boolean(user),
      hasStoredToken: hasPersistedAuthSession(),
    });
  }, [authLoading, from, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    const redirectExistingSession = async () => {
      const roles = await getRolesForRedirect(user.id);
      if (!active) return;
      const destination = await resolvePostAuthDestination(from, roles);
      if (!active) return;
      authDebug("auth page detected existing session", { redirectAfterLogin: destination, roles });
      nav(destination, { replace: true });
    };
    void redirectExistingSession();
    return () => { active = false; };
  }, [authLoading, from, nav, user]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (resetBusy.current) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    const submittedIdentifier = String(formData.get("identifier") ?? "").trim();
    const submittedPassword = String(formData.get("password") ?? "");

    setIdentifier(submittedIdentifier);
    setPassword(submittedPassword);

    const validEmail = isValidEmailAddress(submittedIdentifier);
    const validUsername = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(submittedIdentifier);
    if ((!validEmail && !validUsername) || submittedPassword.length < 6 || submittedPassword.length > 128) {
      toast.error("Invalid email or password");
      return;
    }

    const credentials = {
      identifier: submittedIdentifier,
      password: submittedPassword,
    };

    setLoading(true);
    authDebug( "password sign-in started", {
      redirectAfterLogin: from,
      client: {
        hasAuthClient: Boolean(supabase?.auth),
        storage: "browser-localStorage",
        environment: import.meta.env.PROD ? "production" : "development",
      },
      payload: {
        identifierType: credentials.identifier.includes("@") ? "email" : "username",
        passwordLength: credentials.password.length,
      },
    });

    const { data, error } = await signInWithIdentifier(credentials.identifier, credentials.password);

    setLoading(false);
    authDebug( "password sign-in completed", {
      hasSession: Boolean(data.session),
      hasUser: Boolean(data.user),
      error: error?.message ?? null,
    });
    if (error) { toast.error(identifierLoginErrorText(error, lang)); return; }
    persistAuthSessionForPreview(data.session, "password-login-result");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    persistAuthSessionForPreview(sessionData.session, "password-login-get-session");
    authDebug( "session after password login", {
      hasSession: Boolean(sessionData.session),
      hasUser: Boolean(sessionData.session?.user),
      error: sessionError?.message ?? null,
      hasStoredToken: hasPersistedAuthSession(),
    });
    if (sessionError || !sessionData.session) {
      toast.error(sessionError?.message ?? (lang === "ar" ? "لم يتم حفظ جلسة تسجيل الدخول" : "Sign-in session was not saved"));
      return;
    }
    const roles = await getRolesForRedirect(sessionData.session.user.id);
    const destination = await resolvePostAuthDestination(from, roles);
    authDebug("post-auth redirect resolved", { destination, roles });
    nav(destination, { replace: true });
  };

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (resetBusy.current) return;
    const email = resetEmail.trim().toLowerCase();
    if (!isValidEmailAddress(email)) {
      toast.error(lang === "ar" ? "أدخل بريداً صالحاً" : "Enter a valid email");
      return;
    }
    resetBusy.current = true;
    setResetLoading(true);
    try {
      const result = await requestPasswordRecovery(email, "staff");
      if (!mounted.current) return;
      if (result.kind === "rejected") { reportAuthFailure("send-recovery-link", "rejected", result.error); toast.error(lang === "ar" ? "تعذر إرسال رابط الاستعادة. تحقق من الاتصال وحاول لاحقًا." : "Unable to send the recovery link. Check your connection and try again later."); return; }
      if (result.kind === "transport") {
        reportAuthFailure("send-recovery-link", "transport");
        toast.error(lang === "ar" ? "لم يتأكد إرسال الرابط. تحقق من بريدك قبل إعادة المحاولة." : "Sending the link could not be confirmed. Check your inbox before trying again.");
        return;
      }
      // The form validated above, so this cannot fire here; it is here because a
      // request that was never sent must never be reported as one that was.
      if (result.kind === "invalid") { toast.error(lang === "ar" ? "أدخل بريداً صالحاً" : "Enter a valid email"); return; }
      // Same response for registered/unregistered email addresses; do not enumerate accounts.
      toast.success(t("resetLinkSent"));
      setResetOpen(false);
    } catch {
      if (mounted.current) {
        reportAuthFailure("send-recovery-link", "transport");
        toast.error(lang === "ar" ? "لم يتأكد إرسال الرابط. تحقق من بريدك قبل إعادة المحاولة." : "Sending the link could not be confirmed. Check your inbox before trying again.");
      }
    } finally {
      resetBusy.current = false;
      if (mounted.current) setResetLoading(false);
    }
  };

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-10 gradient-primary text-primary-foreground relative overflow-hidden">
        <div className="flex items-center gap-3">
          {branding ? (branding.logo_url ? <img src={branding.logo_url} alt={brandName} className="size-11 rounded-2xl bg-white/15 object-contain p-1" /> : <div className="size-11 rounded-2xl border border-white/10 bg-white/5" aria-hidden="true" />) : <div className="size-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center"><Stethoscope className="size-6" /></div>}
          <div>
            <div className="text-xl font-bold">{brandName}</div>
            {!isBrandedTenantHost ? <div className="text-sm text-white/70">{t("tagline")}</div> : null}
          </div>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-bold leading-tight text-balance">
            {isBrandedTenantHost
              ? (lang === "ar" ? `مرحبًا بك في ${brandName}` : `Welcome to ${brandName}`)
              : (lang === "ar" ? "نظام إدارة العيادات الذي يفهم احتياجاتك." : "A clinic management system built for every specialty.")}
          </h1>
            <p className="text-white/80">
            {isBrandedTenantHost
              ? (lang === "ar" ? `إدارة ${brandName} ومتابعة أعمال فريقك من مكان واحد.` : `Manage ${brandName} and keep your team in sync from one place.`)
              : (lang === "ar" ? "إدارة المرضى، المواعيد، الفواتير، والفروع في مكان واحد." : "Patients, appointments, billing, and multi-branch — all in one place.")}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-white/60">
          <span>© {new Date().getFullYear()} {brandName}</span>
          {isBrandedTenantHost && branding?.show_powered_by ? <span>{lang === "ar" ? "مدعوم بواسطة ZMedico" : "Powered by ZMedico"}</span> : null}
        </div>
        <div className="absolute -right-32 -bottom-32 size-96 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="flex flex-col justify-center p-6 sm:p-10">
        <div className="w-full max-w-md mx-auto">
          <div className="flex justify-end mb-4">
            <Button variant="ghost" size="sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              <Globe className="me-2 size-4" />
              {lang === "ar" ? "English" : "العربية"}
            </Button>
          </div>

          <Card className="p-6 shadow-elegant border-border/60">
            <div>
              <h2 className="text-2xl font-bold mb-1">{t("welcomeBack")}</h2>
              <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
                {branding?.logo_url ? <img src={branding.logo_url} alt={brandName} className="size-8 rounded-lg object-contain" /> : null}
                <span>{brandName}</span>
              </div>
              <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="identifier">{lang === "ar" ? "البريد الإلكتروني أو اسم المستخدم" : "Email or username"}</Label>
                    <Input id="identifier" name="identifier" type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">{t("password")}</Label>
                    <Input id="password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                  </div>
                  <Button type="submit" className="w-full gradient-primary text-primary-foreground hover:opacity-95" disabled={loading || resetLoading}>
                    {t("signIn")}
                  </Button>
              </form>
                  <div className="text-end">
                    <Dialog open={resetOpen} onOpenChange={(open) => { if (!resetBusy.current) setResetOpen(open); }}>
                      <DialogTrigger asChild>
                        <button type="button" disabled={loading} className="text-xs text-primary hover:underline">
                          {t("forgotPassword")}
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>{t("resetPassword")}</DialogTitle></DialogHeader>
                        <form onSubmit={handleSendReset} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="rsemail">{t("email")}</Label>
                            <Input id="rsemail" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} disabled={resetLoading} required />
                          </div>
                          <DialogFooter>
                            <Button type="button" variant="outline" disabled={resetLoading} onClick={() => setResetOpen(false)}>{t("cancel")}</Button>
                            <Button type="submit" className="gradient-primary text-primary-foreground" disabled={resetLoading}>
                              {t("sendResetLink")}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
              {!isBrandedTenantHost ? <div className="mt-5 border-t pt-4 text-center">
                <p className="text-xs text-muted-foreground">
                  {lang === "ar" ? "ليس لديك حساب؟ اطلب تجربة لعيادتك وسيتواصل معك فريق ZMedico." : "New clinic? Request a trial and the ZMedico team will contact you."}
                </p>
                <Button asChild variant="outline" className="mt-3 w-full">
                  <Link to={requestTrialHref}>{lang === "ar" ? "اطلب تجربة مجانية" : "Request a free trial"}</Link>
                </Button>
              </div> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
