import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { enumLabel } from "@/lib/enumLabels";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { portalMutationFailure } from "@/lib/portalMutationFailure";
import { toast } from "sonner";

type PortalAccount = {
  id: string;
  status: string;
  portal_enabled: boolean;
  must_change_password: boolean;
  auth_user_id: string;
  invited_at: string | null;
};

type Credentials = { username?: string | null; email: string; password: string };
type Props = { patientId: string; patientEmail: string | null };

export default function PatientPortalCard(props: Props) {
  const { user } = useAuth();
  // Remount before rendering another patient's/staff member's credentials.
  return <PortalAccountCard key={JSON.stringify([props.patientId, user?.id ?? null])} {...props} />;
}

function readCredentials(value: unknown): Credentials | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.password !== "string" || !record.password || typeof record.email !== "string" || !record.email) return null;
  return { password: record.password, email: record.email, username: typeof record.username === "string" ? record.username : null };
}

function PortalAccountCard({ patientId, patientEmail }: Props) {
  const { lang } = useI18n();
  const [account, setAccount] = useState<PortalAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const alive = useRef(false);
  const readSequence = useRef(0);
  const submitting = useRef(false);

  const load = useCallback(async () => {
    const sequence = ++readSequence.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const { data, error } = await supabase.from("patient_portal_accounts")
        .select("id,status,portal_enabled,must_change_password,auth_user_id,invited_at")
        .eq("patient_id", patientId).maybeSingle();
      if (!alive.current || sequence !== readSequence.current) return;
      if (error) throw error;
      setAccount(data);
    } catch {
      if (!alive.current || sequence !== readSequence.current) return;
      setAccount(null); setLoadFailed(true);
    } finally {
      if (alive.current && sequence === readSequence.current) setLoading(false);
    }
  }, [patientId]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; readSequence.current += 1; };
  }, [load]);

  const mutate = async (reset: boolean) => {
    if (submitting.current || loading || loadFailed) return;
    if (reset && (!account?.auth_user_id || !account.portal_enabled || account.status !== "active")) return;
    if (!reset && !patientEmail) {
      toast.error(lang === "ar" ? "أضف بريدًا إلكترونيًا للمريض أولًا من زر تعديل." : "Add a patient email first via Edit.");
      return;
    }
    submitting.current = true; setBusy(true); setCredentials(null);
    try {
      const { data, error } = await supabase.functions.invoke(reset ? "patient-portal-reset-password" : "patient-portal-invite", {
        body: reset ? { patient_id: patientId } : { patient_id: patientId, auto_credentials: true },
      });
      if (!alive.current) return;
      if (error || data?.error || data?.success !== true) {
        const f = await portalMutationFailure(error, data?.error, lang, {
          en: "The operation could not be confirmed. Refresh the account status before retrying; the password may have changed.",
          ar: "لم يتأكد إكمال العملية. حدّث حالة الحساب قبل إعادة المحاولة؛ ربما تغيرت كلمة المرور.",
        });
        if (!alive.current) return;
        if (f.description) toast.error(f.title, { description: f.description });
        else toast.error(f.title);
        await load();
        return;
      }
      const nextCredentials = readCredentials(data.credentials);
      if (nextCredentials) {
        setCredentials(nextCredentials);
        toast.success(reset
          ? (lang === "ar" ? "تم توليد كلمة مرور جديدة" : "New password generated")
          : (lang === "ar" ? "تم إنشاء بيانات الدخول" : "Login credentials created"));
      } else if (!reset && data.already_enabled === true) {
        toast.success(lang === "ar" ? "حساب البوابة موجود بالفعل" : "Portal account already exists");
      } else {
        throw new Error("Missing credentials");
      }
      await load();
    } catch {
      if (alive.current) toast.error(lang === "ar"
        ? "لم يتأكد إكمال العملية. حدّث حالة الحساب قبل إعادة المحاولة؛ ربما تغيرت كلمة المرور."
        : "The operation could not be confirmed. Refresh the account status before retrying; the password may have changed.");
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Card className="p-6 shadow-card space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <h3 className="font-semibold">{lang === "ar" ? "بوابة المريض" : "Patient portal"}</h3>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{lang === "ar" ? "جارٍ التحميل…" : "Loading…"}</p>
      ) : loadFailed ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm">{lang === "ar" ? "تعذر تحميل حالة حساب البوابة." : "Could not load the portal account status."}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>{lang === "ar" ? "إعادة المحاولة" : "Retry"}</Button>
        </div>
      ) : account ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{lang === "ar" ? "الحالة" : "Status"}</span>
            <Badge variant={account.status === "active" ? "default" : "secondary"}>{enumLabel("portal_account_status", account.status, lang)}</Badge>
            {account.must_change_password && (
              <Badge variant="outline">{lang === "ar" ? "يجب تغيير كلمة المرور عند أول دخول" : "Must change password on first login"}</Badge>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => void mutate(true)} disabled={busy || !account.portal_enabled || account.status !== "active"}>
            <RefreshCw className="me-2 size-4" />{lang === "ar" ? "إعادة تعيين كلمة المرور" : "Reset password"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{lang === "ar" ? "لا يوجد حساب بوابة لهذا المريض بعد." : "This patient has no portal account yet."}</p>
          <Button size="sm" onClick={() => void mutate(false)} disabled={busy || !patientEmail}>
            <ShieldCheck className="me-2 size-4" />{lang === "ar" ? "إنشاء دخول البوابة" : "Create portal login"}
          </Button>
          {!patientEmail && (
            <p className="text-xs text-amber-600">{lang === "ar" ? "أضف بريدًا إلكترونيًا للمريض أولًا." : "Add a patient email first."}</p>
          )}
        </div>
      )}

      <Dialog open={!!credentials} onOpenChange={(open) => !open && setCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "بيانات دخول بوابة المريض" : "Patient portal credentials"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {lang === "ar"
                ? "هذه البيانات مؤقتة ولن تظهر مرة أخرى بعد إغلاق هذه النافذة. سلّمها للمريض بطريقة آمنة."
                : "These credentials are temporary and will not be shown again after closing this dialog. Share them securely."}
            </p>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="font-medium break-all">{credentials?.email}</div>
            </div>
            {credentials?.username && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Username</div>
                <div className="font-medium">{credentials.username}</div>
              </div>
            )}
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">{lang === "ar" ? "كلمة مرور مؤقتة" : "Temporary password"}</div>
              <div className="font-mono font-medium break-all">{credentials?.password}</div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => credentials && navigator.clipboard.writeText(`${credentials.username ? `Username: ${credentials.username}\n` : ""}Password: ${credentials.password}`)}
            >
              <Copy className="me-2 size-4" />{lang === "ar" ? "نسخ بيانات الدخول" : "Copy credentials"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
