import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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

const AUTH_DEBUG_PREFIX = "[auth-debug]";

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 255;
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
  const nav = useNavigate();
  const location = useLocation();
  const from = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const next = params.get("next");
    const stateFrom = (location.state as any)?.from;
    const statePath = stateFrom
      ? `${stateFrom.pathname ?? "/"}${stateFrom.search ?? ""}${stateFrom.hash ?? ""}`
      : null;
    return safeRedirectPath(next ?? statePath ?? "/");
  }, [location.search, location.state]);

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    console.info(AUTH_DEBUG_PREFIX, "auth page mounted", {
      path: window.location.pathname + window.location.search,
      redirectAfterLogin: from,
      authLoading,
      hasUser: Boolean(user),
      hasStoredToken: hasPersistedAuthSession(),
    });
  }, [authLoading, from, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    console.info(AUTH_DEBUG_PREFIX, "auth page detected existing session", { redirectAfterLogin: from });
    nav(from, { replace: true });
  }, [authLoading, from, nav, user]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);
    const submittedEmail = String(formData.get("email") ?? "");
    const submittedPassword = String(formData.get("password") ?? "");

    setEmail(submittedEmail);
    setPassword(submittedPassword);

    if (!isValidEmailAddress(submittedEmail) || submittedPassword.length < 6 || submittedPassword.length > 128) {
      toast.error("Invalid email or password");
      return;
    }

    const credentials = {
      email: submittedEmail,
      password: submittedPassword,
    };

    setLoading(true);
    console.info(AUTH_DEBUG_PREFIX, "password sign-in started", {
      redirectAfterLogin: from,
      client: {
        hasAuthClient: Boolean(supabase?.auth),
        storage: "browser-localStorage",
        environment: import.meta.env.PROD ? "production" : "development",
      },
      payload: {
        email: credentials.email,
        passwordLength: credentials.password.length,
        passwordFirstCharCode: credentials.password.length ? credentials.password.charCodeAt(0) : null,
        passwordLastCharCode: credentials.password.length ? credentials.password.charCodeAt(credentials.password.length - 1) : null,
      },
    });
    console.log(AUTH_DEBUG_PREFIX, "signInWithPassword payload", {
      email: credentials.email,
      password: "[redacted]",
      passwordLength: credentials.password.length,
    });

    const { data, error } = await supabase.auth.signInWithPassword(credentials);

    setLoading(false);
    console.info(AUTH_DEBUG_PREFIX, "password sign-in completed", {
      hasSession: Boolean(data.session),
      hasUser: Boolean(data.user),
      error: error?.message ?? null,
    });
    if (error) { toast.error(error.message); return; }
    persistAuthSessionForPreview(data.session, "password-login-result");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    persistAuthSessionForPreview(sessionData.session, "password-login-get-session");
    console.info(AUTH_DEBUG_PREFIX, "session after password login", {
      hasSession: Boolean(sessionData.session),
      hasUser: Boolean(sessionData.session?.user),
      error: sessionError?.message ?? null,
      hasStoredToken: hasPersistedAuthSession(),
    });
    if (sessionError || !sessionData.session) {
      toast.error(sessionError?.message ?? (lang === "ar" ? "لم يتم حفظ جلسة تسجيل الدخول" : "Sign-in session was not saved"));
      return;
    }
    nav(from, { replace: true });
  };

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetEmail.includes("@")) {
      toast.error(lang === "ar" ? "أدخل بريداً صالحاً" : "Enter a valid email");
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("resetLinkSent"));
    setResetOpen(false);
  };

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-10 gradient-primary text-primary-foreground relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <Stethoscope className="size-6" />
          </div>
          <div>
            <div className="text-xl font-bold">{t("appName")}</div>
            <div className="text-sm text-white/70">{t("tagline")}</div>
          </div>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-bold leading-tight text-balance">
            {lang === "ar"
              ? "نظام إدارة العيادات الذي يفهم احتياجاتك."
              : "A clinic management system built for every specialty."}
          </h1>
          <p className="text-white/80">
            {lang === "ar"
              ? "إدارة المرضى، المواعيد، الفواتير، والفروع في مكان واحد."
              : "Patients, appointments, billing, and multi-branch — all in one place."}
          </p>
        </div>
        <div className="text-xs text-white/60">© {new Date().getFullYear()} {t("appName")}</div>
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
              <p className="text-sm text-muted-foreground mb-6">{t("appName")}</p>
              <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("email")}</Label>
                    <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">{t("password")}</Label>
                    <Input id="password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                  </div>
                  <Button type="submit" className="w-full gradient-primary text-primary-foreground hover:opacity-95" disabled={loading}>
                    {t("signIn")}
                  </Button>
                  <div className="text-end">
                    <Dialog open={resetOpen} onOpenChange={setResetOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className="text-xs text-primary hover:underline">
                          {t("forgotPassword")}
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>{t("resetPassword")}</DialogTitle></DialogHeader>
                        <form onSubmit={handleSendReset} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="rsemail">{t("email")}</Label>
                            <Input id="rsemail" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
                          </div>
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>{t("cancel")}</Button>
                            <Button type="submit" className="gradient-primary text-primary-foreground" disabled={resetLoading}>
                              {t("sendResetLink")}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </form>
              <p className="text-xs text-muted-foreground text-center mt-4">
                {lang === "ar"
                  ? "التسجيل عن طريق دعوة المسؤول فقط."
                  : "New accounts are created by an administrator."}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}