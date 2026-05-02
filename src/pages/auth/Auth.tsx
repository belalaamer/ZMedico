import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { z } from "zod";
import { Stethoscope, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";

const credSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(128),
  fullName: z.string().trim().min(1).max(100).optional(),
});

export default function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname ?? "/";

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = credSchema.safeParse({ email, password });
    if (!parsed.success) { toast.error("Invalid email or password"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    nav(from, { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = credSchema.safeParse({ email, password, fullName });
    if (!parsed.success) { toast.error("Please fill all fields"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Check your email to confirm your account");
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { toast.error("Google sign-in failed"); return; }
    if (result.redirected) return;
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
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
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
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="grid grid-cols-2 w-full mb-6">
                <TabsTrigger value="signin">{t("signIn")}</TabsTrigger>
                <TabsTrigger value="signup">{t("signUp")}</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <h2 className="text-2xl font-bold mb-1">{t("welcomeBack")}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t("appName")}</p>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("email")}</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">{t("password")}</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
              </TabsContent>

              <TabsContent value="signup">
                <h2 className="text-2xl font-bold mb-1">{t("createAccount")}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t("appName")}</p>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("fullName")}</Label>
                    <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">{t("email")}</Label>
                    <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password2">{t("password")}</Label>
                    <Input id="password2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                  </div>
                  <Button type="submit" className="w-full gradient-primary text-primary-foreground hover:opacity-95" disabled={loading}>
                    {t("signUp")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
              <svg className="me-2 size-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.46.34-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.96l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              {t("continueWithGoogle")}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}