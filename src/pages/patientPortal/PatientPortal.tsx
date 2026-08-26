import { useEffect, useState } from "react";
import { CalendarDays, Clock3, FileText, LogOut, Mail, Phone, ShieldCheck, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PortalData = {
  patient: { id: string; patient_code: number | null; first_name_en: string; last_name_en: string | null; first_name_ar: string | null; last_name_ar: string | null; name_language: string | null; phone: string | null; email: string | null; dob: string | null; gender: string | null };
  clinic: { name_en: string; name_ar: string; support_email: string | null; support_phone: string | null; complaint_instructions_en: string | null; complaint_instructions_ar: string | null };
  appointments: Array<{ id: string; scheduled_at: string; status: string; service_name_en: string | null; service_name_ar: string | null; doctor_name_en: string | null; doctor_name_ar: string | null; room: string | null }>;
  invoices: Array<{ id: string; invoice_number: string | null; invoice_date: string; status: string; total: number | null; paid_amount: number | null; balance: number | null }>;
  physio_cases: Array<{ id: string; diagnosis: string | null; treatment_goal: string | null; status: string; start_date: string; expected_sessions: number; followup_enabled: boolean; followup_due_date: string | null }>;
  sessions: Array<{ id: string; case_id: string; session_number: number; session_date: string; attendance: string; pain_level: number | null; symptom_change: string | null; interventions: string | null; home_exercise: string | null; next_recommendation: string | null; next_review_plan: string | null }>;
};

function patientName(p: PortalData["patient"], lang: "ar" | "en") {
  return lang === "ar"
    ? [p.first_name_ar || p.first_name_en, p.last_name_ar || p.last_name_en].filter(Boolean).join(" ")
    : [p.first_name_en || p.first_name_ar, p.last_name_en || p.last_name_ar].filter(Boolean).join(" ");
}
function date(value: string | null, lang: "ar" | "en") { return value ? new Date(value).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-EG", { year: "numeric", month: "long", day: "numeric" }) : "—"; }
function dateTime(value: string, lang: "ar" | "en") { return new Date(value).toLocaleString(lang === "ar" ? "ar-EG" : "en-EG", { dateStyle: "medium", timeStyle: "short" }); }
function labelStatus(value: string, lang: "ar" | "en") {
  const labels: Record<string, [string, string]> = { scheduled: ["مطلوب تأكيده", "Scheduled"], confirmed: ["مؤكد", "Confirmed"], completed: ["مكتمل", "Completed"], cancelled: ["ملغي", "Cancelled"], in_progress: ["جارٍ", "In progress"], done: ["تمت", "Done"], missed: ["لم يحضر", "Missed"] };
  return labels[value]?.[lang === "ar" ? 0 : 1] || value;
}

export default function PatientPortal() {
  const { lang, setLang } = useI18n();
  const { user, signOut } = useAuth();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: snapshot, error }, { data: profile }] = await Promise.all([
        supabase.rpc("patient_portal_snapshot"),
        user?.id ? supabase.from("profiles").select("username").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!active) return;
      if (error) { toast.error(lang === "ar" ? "لا يمكن الوصول إلى بوابة المريض بهذا الحساب" : "This account cannot access the patient portal"); setLoading(false); return; }
      setData(snapshot as unknown as PortalData);
      setUsername(profile?.username ?? "");
      setLoading(false);
    })();
    return () => { active = false; };
  }, [lang]);

  const logout = async () => { await signOut(); window.location.assign("/auth"); };
  const saveUsername = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(value)) { toast.error(lang === "ar" ? "استخدم 3–32 حرفًا إنجليزيًا أو أرقامًا أو نقطة أو شرطة" : "Use 3–32 letters, numbers, dot, underscore, or hyphen"); return; }
    setUsernameSaving(true);
    const { data: result, error } = await supabase.rpc("patient_portal_set_username", { p_username: value });
    setUsernameSaving(false);
    if (error || !(result as any)?.username) { toast.error(lang === "ar" ? "اسم المستخدم مستخدم بالفعل أو غير صالح" : "Username is already in use or invalid"); return; }
    setUsername(value);
    toast.success(lang === "ar" ? "تم حفظ اسم المستخدم" : "Username saved");
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) { toast.error(lang === "ar" ? "كلمة المرور يجب ألا تقل عن 8 أحرف" : "Password must be at least 8 characters"); return; }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) { toast.error(error.message); return; }
    setNewPassword("");
    toast.success(lang === "ar" ? "تم حفظ كلمة المرور" : "Password saved");
  };
  if (loading) return <main className="min-h-dvh grid place-items-center text-muted-foreground">…</main>;
  if (!data) return <main className="min-h-dvh grid place-items-center p-6"><Card className="max-w-md p-6 text-center"><ShieldCheck className="mx-auto mb-3 size-8 text-primary" /><h1 className="text-xl font-bold">{lang === "ar" ? "بوابة المريض غير متاحة" : "Patient portal unavailable"}</h1><p className="mt-2 text-sm text-muted-foreground">{lang === "ar" ? "استخدم رابط الدعوة أو تواصل مع العيادة لتفعيل الوصول." : "Use your invitation link or contact the clinic to activate access."}</p></Card></main>;

  const upcoming = data.appointments.filter((item) => !["cancelled", "completed"].includes(item.status));
  const supportEmail = data.clinic.support_email;
  const supportPhone = data.clinic.support_phone;
  const complaintText = lang === "ar" ? data.clinic.complaint_instructions_ar : data.clinic.complaint_instructions_en;

  return <main className="min-h-dvh bg-muted/30 px-4 py-6 md:px-8" dir={lang === "ar" ? "rtl" : "ltr"}>
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-start justify-between gap-4 rounded-2xl border bg-background p-5 shadow-sm">
        <div><p className="text-sm font-semibold text-primary">{lang === "ar" ? data.clinic.name_ar : data.clinic.name_en}</p><h1 className="mt-1 text-2xl font-black">{lang === "ar" ? `مرحبًا ${patientName(data.patient, lang)}` : `Welcome, ${patientName(data.patient, lang)}`}</h1><p className="mt-1 text-sm text-muted-foreground">{lang === "ar" ? "ملفك الصحي ومواعيدك في مكان واحد" : "Your health information and appointments in one place"}</p></div>
        <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "English" : "العربية"}</Button><Button variant="ghost" size="icon" onClick={logout} aria-label={lang === "ar" ? "تسجيل الخروج" : "Sign out"}><LogOut className="size-4" /></Button></div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><p className="text-xs text-muted-foreground">{lang === "ar" ? "اسم المريض" : "Patient name"}</p><p className="mt-1 text-lg font-bold">{patientName(data.patient, lang)}</p>{data.patient.patient_code ? <p className="mt-1 text-xs text-muted-foreground">#{data.patient.patient_code}</p> : null}</Card>
        <Card className="p-5"><p className="text-xs text-muted-foreground">{lang === "ar" ? "المواعيد القادمة" : "Upcoming appointments"}</p><p className="mt-1 text-3xl font-black text-primary">{upcoming.length}</p></Card>
        <Card className="p-5"><p className="text-xs text-muted-foreground">{lang === "ar" ? "جلسات العلاج" : "Treatment sessions"}</p><p className="mt-1 text-3xl font-black text-primary">{data.sessions.length}</p></Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden"><div className="border-b p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><CalendarDays className="size-5 text-primary" />{lang === "ar" ? "المواعيد" : "Appointments"}</h2></div><div className="divide-y">{data.appointments.length ? data.appointments.map((item) => <div key={item.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{lang === "ar" ? item.service_name_ar || item.service_name_en : item.service_name_en || item.service_name_ar}</p><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><Clock3 className="size-3.5" />{dateTime(item.scheduled_at, lang)}</p></div><Badge variant="outline">{labelStatus(item.status, lang)}</Badge></div>{item.doctor_name_en || item.doctor_name_ar ? <p className="mt-2 text-sm text-muted-foreground">{lang === "ar" ? item.doctor_name_ar || item.doctor_name_en : item.doctor_name_en || item.doctor_name_ar}</p> : null}</div>) : <p className="p-6 text-center text-sm text-muted-foreground">{lang === "ar" ? "لا توجد مواعيد مسجلة" : "No appointments recorded"}</p>}</div></Card>

          <Card className="overflow-hidden"><div className="border-b p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><Activity className="size-5 text-primary" />{lang === "ar" ? "الجلسات وما تم تنفيذُه" : "Sessions and what was done"}</h2></div><div className="divide-y">{data.sessions.length ? data.sessions.map((item) => <div key={item.id} className="space-y-2 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{lang === "ar" ? `الجلسة رقم ${item.session_number}` : `Session ${item.session_number}`} · {date(item.session_date, lang)}</p><Badge variant="outline">{labelStatus(item.attendance, lang)}</Badge></div>{item.interventions ? <p className="text-sm"><strong>{lang === "ar" ? "ما تم تنفيذه: " : "What was done: "}</strong>{item.interventions}</p> : null}{item.symptom_change ? <p className="text-sm"><strong>{lang === "ar" ? "التغير الملحوظ: " : "Progress: "}</strong>{item.symptom_change}</p> : null}{item.home_exercise ? <p className="rounded-md bg-primary/5 p-3 text-sm"><strong>{lang === "ar" ? "تمرين منزلي: " : "Home exercise: "}</strong>{item.home_exercise}</p> : null}{item.next_recommendation ? <p className="text-sm text-muted-foreground"><strong>{lang === "ar" ? "التوصية التالية: " : "Next recommendation: "}</strong>{item.next_recommendation}</p> : null}</div>) : <p className="p-6 text-center text-sm text-muted-foreground">{lang === "ar" ? "لا توجد جلسات مسجلة" : "No sessions recorded"}</p>}</div></Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><FileText className="size-5 text-primary" />{lang === "ar" ? "الخطة والمتابعة" : "Treatment plan & follow-up"}</h2><div className="mt-4 space-y-4">{data.physio_cases.length ? data.physio_cases.map((item) => <div key={item.id} className="border-b pb-4 last:border-0 last:pb-0"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{item.diagnosis || (lang === "ar" ? "خطة علاج" : "Treatment plan")}</p><Badge variant="outline">{labelStatus(item.status, lang)}</Badge></div>{item.treatment_goal ? <p className="mt-2 text-sm text-muted-foreground">{item.treatment_goal}</p> : null}<p className="mt-2 text-xs text-muted-foreground">{lang === "ar" ? `عدد الجلسات المتوقع: ${item.expected_sessions}` : `Expected sessions: ${item.expected_sessions}`}</p>{item.followup_enabled && item.followup_due_date ? <p className="mt-2 text-sm text-primary">{lang === "ar" ? `موعد المتابعة: ${date(item.followup_due_date, lang)}` : `Follow-up due: ${date(item.followup_due_date, lang)}`}</p> : null}</div>) : <p className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد خطة علاج مسجلة" : "No treatment plan recorded"}</p>}</div></Card>

          <Card className="p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><FileText className="size-5 text-primary" />{lang === "ar" ? "الفواتير والرصيد" : "Invoices & balance"}</h2><div className="mt-4 space-y-3">{data.invoices.length ? data.invoices.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b pb-3 last:border-0"><div><p className="text-sm font-semibold">{item.invoice_number || item.id.slice(0, 8)}</p><p className="text-xs text-muted-foreground">{date(item.invoice_date, lang)}</p></div><div className="text-end"><p className="text-sm font-medium">{Number(item.total ?? 0).toLocaleString()} </p><p className="text-xs text-muted-foreground">{lang === "ar" ? `متبقي: ${Number(item.balance ?? 0).toLocaleString()}` : `Balance: ${Number(item.balance ?? 0).toLocaleString()}`}</p></div></div>) : <p className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد فواتير" : "No invoices"}</p>}</div></Card>

          <Card className="border-primary/20 bg-primary/5 p-5"><h2 className="font-bold">{lang === "ar" ? "الشكاوى والتواصل" : "Complaints & contact"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{complaintText || (lang === "ar" ? "للاستفسارات أو الشكاوى تواصل مع العيادة عبر إحدى القنوات التالية." : "For questions or complaints, contact the clinic through one of the channels below.")}</p><div className="mt-4 flex flex-wrap gap-2">{supportEmail ? <Button asChild variant="outline" size="sm"><a href={`mailto:${supportEmail}`}><Mail className="me-2 size-4" />{supportEmail}</a></Button> : null}{supportPhone ? <Button asChild variant="outline" size="sm"><a href={`tel:${supportPhone}`}><Phone className="me-2 size-4" />{supportPhone}</a></Button> : null}{!supportEmail && !supportPhone ? <p className="text-xs text-muted-foreground">{lang === "ar" ? "لم تضبط العيادة قنوات التواصل بعد." : "The clinic has not configured contact channels yet."}</p> : null}</div></Card>
        </div>
      </div>
      <Card className="border-primary/20 bg-background p-5">
        <h2 className="font-bold">{lang === "ar" ? "اسم المستخدم" : "Username"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{lang === "ar" ? "اختياري. يمكنك استخدامه بدل البريد الإلكتروني عند الدخول." : "Optional. You can use it instead of your email when signing in."}</p>
        <form onSubmit={saveUsername} className="mt-3 flex flex-col gap-3 sm:flex-row"><input type="text" value={username} onChange={(event) => setUsername(event.target.value.replace(/\s/g, "").toLowerCase())} minLength={3} maxLength={32} pattern="[a-z0-9][a-z0-9._-]{2,31}" placeholder="patient.name" className="h-10 flex-1 rounded-md border bg-background px-3 text-sm" autoComplete="username" /><Button type="submit" disabled={usernameSaving}>{usernameSaving ? "…" : (lang === "ar" ? "حفظ الاسم" : "Save username")}</Button></form>
      </Card>
      <Card className="border-primary/20 bg-background p-5">
        <h2 className="font-bold">{lang === "ar" ? "تأمين الحساب" : "Secure your account"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{lang === "ar" ? "بعد فتح رابط الدعوة، يمكنك تعيين كلمة مرور خاصة بك لاستخدام البريد الإلكتروني في الدخول لاحقًا." : "After opening your invitation link, set a personal password to sign in with your email next time."}</p>
        <form onSubmit={savePassword} className="mt-3 flex flex-col gap-3 sm:flex-row"><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} placeholder={lang === "ar" ? "كلمة مرور جديدة" : "New password"} className="h-10 flex-1 rounded-md border bg-background px-3 text-sm" autoComplete="new-password" /><Button type="submit" disabled={passwordSaving || newPassword.length < 8}>{passwordSaving ? "…" : (lang === "ar" ? "حفظ كلمة المرور" : "Save password")}</Button></form>
      </Card>
      <p className="text-center text-xs text-muted-foreground">{lang === "ar" ? "هذه البوابة للعرض فقط. لا تحتوي على أدوات تعديل أو حذف للسجلات الطبية." : "This portal is read-only. It does not provide tools to edit or delete medical records."}</p>
      <p className="text-center text-xs text-muted-foreground">{user?.email}</p>
    </div>
  </main>;
}
