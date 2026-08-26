import { useEffect, useState } from "react";
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

export default function PatientPortalLogin() {
  const { lang, setLang } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!authLoading && user) nav("/patient-portal", { replace: true }); }, [authLoading, nav, user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || password.length < 8) { toast.error(lang === "ar" ? "أدخل البريد وكلمة المرور" : "Enter your email and password"); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (error || !data.session) { toast.error(lang === "ar" ? "بيانات الدخول غير صحيحة أو لم يتم تفعيل الحساب" : "Invalid credentials or the account has not been activated"); return; }
    nav("/patient-portal", { replace: true });
  };

  return <main className="min-h-dvh grid place-items-center bg-muted/30 p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
    <Card className="w-full max-w-md p-6 shadow-elegant">
      <div className="text-center"><ShieldCheck className="mx-auto size-10 text-primary" /><h1 className="mt-3 text-2xl font-black">{lang === "ar" ? "بوابة المريض" : "Patient Portal"}</h1><p className="mt-1 text-sm text-muted-foreground">{lang === "ar" ? "ادخل للاطلاع على مواعيدك وجلساتك ومتابعتك" : "Sign in to view your appointments, sessions, and follow-up"}</p></div>
      <form onSubmit={submit} className="mt-6 space-y-4"><div className="space-y-2"><Label htmlFor="patient-portal-email">{lang === "ar" ? "البريد الإلكتروني" : "Email"}</Label><Input id="patient-portal-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div><div className="space-y-2"><Label htmlFor="patient-portal-password">{lang === "ar" ? "كلمة المرور" : "Password"}</Label><Input id="patient-portal-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div><Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}><LogIn className="me-2 size-4" />{loading ? "…" : (lang === "ar" ? "دخول إلى البوابة" : "Sign in to portal")}</Button></form>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs"><Link className="text-primary hover:underline" to="/auth">{lang === "ar" ? "دخول الموظفين" : "Staff sign in"}</Link><button type="button" className="text-primary hover:underline" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "English" : "العربية"}</button></div>
    </Card>
  </main>;
}
