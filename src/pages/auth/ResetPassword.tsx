import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthError } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { withTimeout } from "@/lib/withTimeout";
import { reportAuthFailure } from "@/lib/authFailureTelemetry";

/**
 * Public route. Reached via the recovery email link Supabase sends.
 * The link contains `type=recovery` in the URL hash; Supabase's auth
 * client picks it up automatically and creates a temporary session
 * that lets us call `updateUser({ password })`.
 */
export default function ResetPassword() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "error" | "uncertain">("checking");
  const [verification, setVerification] = useState(0);
  const [updated, setUpdated] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const identity = useRef<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let eventRevision = 0;
    const invalidateOperation = () => { generation.current++; };
    const applySession = (session: Session | null, newRecovery = false) => {
      const next = session?.user?.id ?? null;
      const changed = next !== identity.current || newRecovery;
      if (changed) {
        generation.current++;
        identity.current = next;
        setPassword(""); setConfirm(""); setUpdated(false);
      }
      setState(previous => !next ? "invalid" : !changed && previous === "uncertain" ? "uncertain" : "ready");
    };
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      eventRevision++;
      if (event === "SIGNED_OUT" || (event as string) === "USER_DELETED") applySession(null);
      else applySession(session, event === "PASSWORD_RECOVERY");
    });
    const revision = eventRevision;
    void (async () => {
      try {
        const result = await withTimeout(supabase.auth.getSession(), {
          ms: 8000,
          fallback: { data: { session: null }, error: new AuthError("Recovery verification timed out", undefined, "request_timeout") },
        });
        if (!active || revision !== eventRevision) return;
        if (result.error) { reportAuthFailure("verify-recovery", "rejected", result.error); setState("error"); } else applySession(result.data.session);
      } catch {
        if (active && revision === eventRevision) { reportAuthFailure("verify-recovery", "transport"); setState("error"); }
      }
    })();
    return () => { active = false; mounted.current = false; invalidateOperation(); sub.data.subscription.unsubscribe(); };
  }, [verification]);

  const finishSignOut = async (expectedId: string, operation: number) => {
    // A completion belonging to a previous account must not log out the new one.
    if (!mounted.current || identity.current !== expectedId || generation.current !== operation) return;
    try {
      const { error } = await supabase.auth.signOut();
      const sameOperation = identity.current === expectedId && generation.current === operation;
      const expectedSignOut = identity.current === null && generation.current === operation + 1;
      if (!mounted.current || (!sameOperation && !expectedSignOut)) return;
      if (error) {
        reportAuthFailure("signout-after-password", "rejected", error);
        toast.error(lang === "ar" ? "تم تحديث كلمة المرور، لكن تعذر تسجيل الخروج. حاول تسجيل الخروج مرة أخرى." : "Password updated, but sign out failed. Try signing out again.");
        return;
      }
      nav("/auth", { replace: true });
    } catch {
      if (mounted.current && identity.current === expectedId && generation.current === operation) {
        reportAuthFailure("signout-after-password", "transport");
        toast.error(lang === "ar" ? "تم تحديث كلمة المرور، لكن لم يتأكد تسجيل الخروج. حاول مرة أخرى." : "Password updated, but sign out could not be confirmed. Try again.");
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current || state !== "ready" || !identity.current) return;
    // P4: 8, the floor the invitation generator and the portal's own
    // change-password step already required; recovery was the only way to make a
    // shorter patient password.
    if (!updated && password.length < 8) { toast.error(lang === "ar" ? "كلمة المرور يجب ألا تقل عن 8 أحرف" : "Password must be at least 8 characters"); return; }
    if (!updated && password !== confirm) { toast.error(lang === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match"); return; }
    const expectedId = identity.current;
    const operation = generation.current;
    const current = () => mounted.current && generation.current === operation && identity.current === expectedId;
    busy.current = true;
    setLoading(true);
    try {
      if (!updated) {
        const { data, error } = await supabase.auth.updateUser({ password });
        if (!current()) return;
        if (error) { reportAuthFailure("update-password", "rejected", error); toast.error(lang === "ar" ? "تعذر تحديث كلمة المرور. تحقق من متطلبات كلمة المرور وصلاحية الرابط." : "Unable to update password. Check the password requirements and recovery link."); return; }
        if (data.user?.id !== expectedId) { reportAuthFailure("update-password", "identity-mismatch"); setState("uncertain"); return; }
        setUpdated(true); setPassword(""); setConfirm("");
        toast.success(t("passwordUpdated"));
      }
      await finishSignOut(expectedId, operation);
    } catch {
      if (current()) {
        reportAuthFailure("update-password", "transport");
        setState("uncertain");
        toast.error(lang === "ar" ? "لم يتأكد تغيير كلمة المرور. جرّب الدخول بالكلمة الجديدة أو اطلب رابطًا جديدًا؛ لن نكرر الطلب تلقائيًا." : "Password change could not be confirmed. Try signing in with the new password or request a new link; the request was not retried.");
      }
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
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

        {state !== "ready" ? (
          <div className="space-y-4">
          <p role={state === "checking" ? "status" : "alert"} className="text-sm text-muted-foreground">
            {state === "invalid" ? (lang === "ar" ? "الرابط غير صالح أو انتهت صلاحيته. اطلب رابط استعادة جديدًا." : "The link is invalid or expired. Request a new recovery link.") : state === "error" ? (lang === "ar" ? "تعذر التحقق من الرابط. تحقق من الاتصال وحاول مرة أخرى." : "Unable to verify the link. Check your connection and try again.") : state === "uncertain" ? (lang === "ar" ? "لم يتأكد تغيير كلمة المرور. جرّب الدخول بالكلمة الجديدة أو اطلب رابطًا جديدًا." : "Password change could not be confirmed. Try signing in with the new password or request a new link.") : (
            lang === "ar" ? "جارٍ التحقق من الرابط..." : "Verifying link..."
            )}
          </p>
          {state === "error" ? <Button onClick={() => { setState("checking"); setVerification(value => value + 1); }}>{lang === "ar" ? "إعادة المحاولة" : "Retry"}</Button> : null}
          {state !== "checking" ? <Button variant="ghost" onClick={() => nav("/auth")}>{t("backToSignIn")}</Button> : null}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!updated ? <><div className="space-y-2">
              <Label htmlFor="np">{t("newPassword")}</Label>
              {/* P4: deliberately no minLength -- a native constraint would swallow the localized toast. */}
              <Input id="np" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">{lang === "ar" ? "8 أحرف على الأقل." : "At least 8 characters."}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp">{t("confirmPassword")}</Label>
              <Input id="cp" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            </div></> : <p role="status">{t("passwordUpdated")}</p>}
            <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
              {updated && !loading ? (lang === "ar" ? "تسجيل الخروج" : "Sign out") : t("resetPassword")}
            </Button>
            <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={() => nav("/auth")}>
              {t("backToSignIn")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
