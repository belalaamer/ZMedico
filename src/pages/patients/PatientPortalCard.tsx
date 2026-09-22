import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PortalAccount = {
  id: string;
  status: string;
  must_change_password: boolean;
  auth_user_id: string;
  invited_at: string | null;
};

type Credentials = { username?: string | null; email: string; password: string };

// RBAC-10 fix: this card is the only place in the product where staff can
// see whether a patient already has a portal login and manage it after the
// one-time creation popup (in the Patients list "add patient" dialog)
// closes. Before this existed, a successfully-created portal account
// (patient-portal-invite already worked correctly) was permanently
// invisible afterward -- there was no RLS policy allowing a client read of
// patient_portal_accounts at all, and no UI anywhere on the patient profile
// despite the creation toast claiming "you can retry from the patient
// profile."
export default function PatientPortalCard({ patientId, patientEmail }: { patientId: string; patientEmail: string | null }) {
  const { lang } = useI18n();
  const [account, setAccount] = useState<PortalAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("patient_portal_accounts")
      .select("id,status,must_change_password,auth_user_id,invited_at")
      .eq("patient_id", patientId)
      .maybeSingle();
    setAccount((data as PortalAccount | null) ?? null);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [patientId]);

  const createLogin = async () => {
    if (!patientEmail) {
      toast.error(lang === "ar" ? "أضف بريدًا إلكترونيًا للمريض أولًا من زر تعديل." : "Add a patient email first via Edit.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("patient-portal-invite", {
      body: { patient_id: patientId, auto_credentials: true },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? (lang === "ar" ? "تعذر إنشاء دخول البوابة" : "Could not create the portal login"));
      return;
    }
    if ((data as any)?.credentials) {
      const c = (data as any).credentials;
      setCredentials({ username: c.username ?? null, email: c.email, password: c.password });
      toast.success(lang === "ar" ? "تم إنشاء بيانات الدخول" : "Login credentials created");
    } else {
      toast.success(lang === "ar" ? "تم تفعيل البوابة" : "Portal enabled");
    }
    await load();
  };

  const resetPassword = async () => {
    if (!account?.auth_user_id) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("patient-portal-reset-password", {
      body: { patient_id: patientId },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? (lang === "ar" ? "تعذر إعادة تعيين كلمة المرور" : "Could not reset the password"));
      return;
    }
    const creds = (data as any)?.credentials;
    if (!creds?.password) {
      toast.error(lang === "ar" ? "تعذر إنشاء بيانات الدخول الجديدة" : "Could not create new credentials");
      return;
    }
    setCredentials({
      username: creds.username ?? null,
      email: creds.email ?? patientEmail ?? "",
      password: creds.password,
    });
    toast.success(lang === "ar" ? "تم توليد كلمة مرور جديدة" : "New password generated");
  };

  return (
    <Card className="p-6 shadow-card space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <h3 className="font-semibold">{lang === "ar" ? "بوابة المريض" : "Patient portal"}</h3>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{lang === "ar" ? "جارٍ التحميل…" : "Loading…"}</p>
      ) : account ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{lang === "ar" ? "الحالة" : "Status"}</span>
            <Badge variant={account.status === "active" ? "default" : "secondary"} className="capitalize">{account.status}</Badge>
            {account.must_change_password && (
              <Badge variant="outline">{lang === "ar" ? "يجب تغيير كلمة المرور عند أول دخول" : "Must change password on first login"}</Badge>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => void resetPassword()} disabled={busy}>
            <RefreshCw className="me-2 size-4" />{lang === "ar" ? "إعادة تعيين كلمة المرور" : "Reset password"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{lang === "ar" ? "لا يوجد حساب بوابة لهذا المريض بعد." : "This patient has no portal account yet."}</p>
          <Button size="sm" onClick={() => void createLogin()} disabled={busy || !patientEmail}>
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
