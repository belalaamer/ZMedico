import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";

/**
 * Public route. Reached via the recovery email link Supabase sends.
 * The link contains `type=recovery` in the URL hash; Supabase's auth
 * client picks it up automatically and creates a temporary session
 * that lets us call `updateUser({ password })`.
 */
export default function ResetPassword() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Wait until the recovery session has been picked up.
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error(lang === "ar" ? "كلمة المرور قصيرة" : "Password too short"); return; }
    if (password !== confirm) { toast.error(lang === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("passwordUpdated"));
    await supabase.auth.signOut();
    nav("/auth", { replace: true });
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-6 shadow-elegant border-border/60">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-10 rounded-2xl gradient-primary text-primary-foreground flex items-center justify-center">
            <Stethoscope className="size-5" />
          </div>
          <h1 className="text-xl font-bold">{t("resetPassword")}</h1>
        </div>

        {!ready ? (
          <p className="text-sm text-muted-foreground">
            {lang === "ar" ? "جارٍ التحقق من الرابط..." : "Verifying link..."}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="np">{t("newPassword")}</Label>
              <Input id="np" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp">{t("confirmPassword")}</Label>
              <Input id="cp" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
              {t("resetPassword")}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => nav("/auth")}>
              {t("backToSignIn")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}