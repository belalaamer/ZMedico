import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { identifierLoginErrorText, signInWithIdentifier } from "@/lib/signInWithIdentifier";
import { isValidEmailAddress, requestPasswordRecovery } from "@/lib/passwordRecovery";

export default function PatientPortalLogin() {
  const { lang, setLang, t } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const recoveryBusy = useRef(false);
  const mounted = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!authLoading && user) nav("/patient-portal", { replace: true }); }, [authLoading, nav, user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (recoveryBusy.current) return;
    // P4: a login form cannot know what the account was created with, and this
    // >=8 gate locked out patients whose recovery link had set a 6-7 char password.
    if (!identifier.trim() || !password) { toast.error(lang === "ar" ? "أدخل البريد أو اسم المستخدم وكلمة المرور" : "Enter your email or username and password"); return; }
    setLoading(true);
    const { data, error } = await signInWithIdentifier(identifier, password);
    setLoading(false);
    if (error || !data.session) { toast.error(identifierLoginErrorText(error, lang, lang === "ar" ? "بيانات الدخول غير صحيحة أو لم يتم تفعيل الحساب" : "Invalid credentials or the account has not been activated")); return; }
    nav("/patient-portal", { replace: true });
  };

  const sendRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    if (recoveryBusy.current) return;
    const email = recoveryEmail.trim().toLowerCase();
    if (!isValidEmailAddress(email)) { toast.error(t("invalidRecoveryEmail")); return; }
    recoveryBusy.current = true;
    setRecoveryLoading(true);
    try {
      const result = await requestPasswordRecovery(email, "patient");
      if (!mounted.current) return;
      // Nothing here says whether the address belongs to a patient: GoTrue
      // answers the same either way, and so does this screen.
      if (result.kind === "rejected") { toast.error(t("recoverySendFailed")); return; }
      if (result.kind === "transport") { toast.error(t("recoverySendUncertain")); return; }
      if (result.kind === "invalid") { toast.error(t("invalidRecoveryEmail")); return; }
      toast.success(t("resetLinkSent"));
      setRecoveryOpen(false);
    } finally {
      recoveryBusy.current = false;
      if (mounted.current) setRecoveryLoading(false);
    }
  };

  return <main className="min-h-dvh grid place-items-center bg-muted/30 p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
    <Card className="w-full max-w-md p-6 shadow-elegant">
      <div className="text-center"><ShieldCheck className="mx-auto size-10 text-primary" /><h1 className="mt-3 text-2xl font-black">{lang === "ar" ? "بوابة المريض" : "Patient Portal"}</h1><p className="mt-1 text-sm text-muted-foreground">{lang === "ar" ? "ادخل للاطلاع على مواعيدك وجلساتك ومتابعتك" : "Sign in to view your appointments, sessions, and follow-up"}</p></div>
      <form onSubmit={submit} className="mt-6 space-y-4"><div className="space-y-2"><Label htmlFor="patient-portal-identifier">{lang === "ar" ? "البريد الإلكتروني أو اسم المستخدم" : "Email or username"}</Label><Input id="patient-portal-identifier" type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required /></div><div className="space-y-2"><Label htmlFor="patient-portal-password">{lang === "ar" ? "كلمة المرور" : "Password"}</Label><Input id="patient-portal-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div><Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}><LogIn className="me-2 size-4" />{loading ? "…" : (lang === "ar" ? "دخول إلى البوابة" : "Sign in to portal")}</Button></form>
      <div className="mt-3 text-end">
        <button type="button" disabled={loading} className="text-xs text-primary hover:underline" onClick={() => setRecoveryOpen((open) => !open)} aria-expanded={recoveryOpen} aria-controls="patient-recovery-form">{t("forgotPassword")}</button>
      </div>
      {recoveryOpen ? (
        <form id="patient-recovery-form" onSubmit={sendRecovery} className="mt-2 space-y-3 rounded-2xl border border-border/60 bg-muted/40 p-4">
          <div className="space-y-2">
            <Label htmlFor="patient-recovery-email">{t("email")}</Label>
            <Input id="patient-recovery-email" type="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} disabled={recoveryLoading} autoComplete="email" required />
            <p className="text-xs text-muted-foreground">{t("recoveryEmailHint")}</p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 gradient-primary text-primary-foreground" disabled={recoveryLoading}>{t("sendResetLink")}</Button>
            <Button type="button" variant="outline" disabled={recoveryLoading} onClick={() => setRecoveryOpen(false)}>{t("cancel")}</Button>
          </div>
        </form>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-3 text-xs"><Link className="text-primary hover:underline" to="/auth">{lang === "ar" ? "دخول الموظفين" : "Staff sign in"}</Link><button type="button" className="text-primary hover:underline" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "English" : "العربية"}</button></div>
    </Card>
  </main>;
}
