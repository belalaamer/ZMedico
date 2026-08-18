import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function NotificationSettings() {
  const { t, lang } = useI18n();
  const { branches, currentBranchId } = useBranch();
  const [branchId, setBranchId] = useState(currentBranchId ?? "");
  const [f, setF] = useState<any>({
    send_appointment_reminders: true, reminder_channel: "email",
    send_appointment_confirmation: true, send_appointment_cancellation: true,
    send_invoice_notification: true, send_payment_receipt: true,
    send_birthday_greeting: false, birthday_discount_percentage: 0,
    send_follow_up_reminder: true, follow_up_days_after: 7,
    email_sender_name: "", email_sender_address: "", sms_sender_id: "", whatsapp_business_number: "",
    whatsapp_api_key: "", whatsapp_api_url: "", sms_api_key: "", sms_api_url: "",
    sms_enabled: false, whatsapp_enabled: false,
    sms_provider: "custom", smsmisr_username: "", smsmisr_password: "", smsmisr_sender_token: "",
    smsmisr_environment: 2, smsmisr_language: 1,
  });
  useEffect(() => {
    if (!branchId) return;
    // Reads go through the safe view — the base table's secret columns
    // (whatsapp_api_key, sms_api_key, twilio_auth_token) are unreadable to the
    // browser client at the DB level (column-level GRANT). Writes still target
    // the base table via upsert below.
    (supabase as any)
      .from("safe_notification_settings")
      .select("*")
      .eq("branch_id", branchId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setF((prev: any) => ({
          ...prev,
          ...data,
          whatsapp_api_key: "",
          sms_api_key: "",
          smsmisr_username: "",
          smsmisr_password: "",
          smsmisr_sender_token: "",
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);
  const save = async () => {
    if (!branchId) return toast.error(t("branch"));
    // Only write API key fields if the admin entered a new value; otherwise leave the stored secret intact.
    const payload: any = { ...f, branch_id: branchId };
    if (!payload.whatsapp_api_key) delete payload.whatsapp_api_key;
    if (!payload.sms_api_key) delete payload.sms_api_key;
    if (!payload.smsmisr_username) delete payload.smsmisr_username;
    if (!payload.smsmisr_password) delete payload.smsmisr_password;
    if (!payload.smsmisr_sender_token) delete payload.smsmisr_sender_token;
    const { error } = await (supabase as any).rpc("upsert_notification_settings", {
      p_branch_id: branchId,
      p_settings: payload,
    });
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
  };
  const Toggle = ({ k, label }: any) => (<div className="flex items-center justify-between rounded-lg border p-3"><Label>{label}</Label><Switch checked={!!f[k]} onCheckedChange={v => setF({ ...f, [k]: v })} /></div>);
  const channel = f.reminder_channel;
  const smsProvider = f.sms_provider ?? "custom";
  const setSmsProvider = (provider: string) => setF({
    ...f,
    sms_provider: provider,
    sms_api_url: provider === "smsmisr" ? "https://smsmisr.com/api/SMS/" : f.sms_api_url,
  });
  const channelReady = channel === "push"
    ? true
    : channel === "sms"
      ? f.sms_enabled === true && (!!f.sms_provider || !!f.sms_api_url)
      : channel === "whatsapp"
        ? f.whatsapp_enabled === true && (!!f.whatsapp_provider || !!f.whatsapp_api_url)
        : false;
  const readinessText = channelReady
    ? (lang === "ar" ? "القناة المختارة جاهزة للجدولة، بشرط وجود رصيد/حساب فعال لدى مزود الخدمة." : "The selected channel is ready to queue messages, provided the provider account has balance and is active.")
    : channel === "email"
      ? (lang === "ar" ? "البريد الإلكتروني غير موصل بمزود إرسال فعلي في النسخة الحالية؛ لن تصل الرسالة بمجرد اختيار Email." : "Email is not connected to a real delivery provider in the current build; selecting Email alone will not deliver messages.")
      : (lang === "ar" ? "القناة غير جاهزة: فعّلها وأدخل Provider URL/المفاتيح ثم احفظ الإعدادات." : "The channel is not ready: enable it, enter the provider URL/credentials, then save the settings.");
  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold">{t("notificationSettings")}</h1>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-56"><SelectValue placeholder={t("branch")} /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Card className={`p-4 flex items-start gap-3 ${channelReady ? "border-success/40 bg-success/5" : "border-warning/50 bg-warning/5"}`}>
          {channelReady ? <CheckCircle2 className="size-5 text-success mt-0.5 shrink-0" /> : <AlertTriangle className="size-5 text-warning mt-0.5 shrink-0" />}
          <div className="text-sm">
            <div className="font-semibold">{lang === "ar" ? "حالة إرسال التذكيرات" : "Reminder delivery status"}</div>
            <div className="text-muted-foreground mt-1">{readinessText}</div>
            <div className="text-xs text-muted-foreground mt-2">{lang === "ar" ? "الجدولة الخلفية تعمل كل 15 دقيقة للتذكيرات المستحقة، والمتابعات العلاجية تُنشأ يوميًا للحالات التي فعّلت المتابعة." : "The background scheduler runs every 15 minutes for due reminders, and physiotherapy follow-ups are enqueued daily for cases with follow-up enabled."}</div>
          </div>
        </Card>
        <Card className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Toggle k="send_appointment_reminders" label={t("sendAppointmentReminders")} />
          <Toggle k="sms_enabled" label={lang === "ar" ? "تفعيل إرسال SMS" : "Enable SMS delivery"} />
          <Toggle k="whatsapp_enabled" label={lang === "ar" ? "تفعيل إرسال WhatsApp" : "Enable WhatsApp delivery"} />
          <div><Label>{t("reminderChannel")}</Label>
            <Select value={f.reminder_channel} onValueChange={v => setF({ ...f, reminder_channel: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["email","sms","whatsapp","push"].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Toggle k="send_appointment_confirmation" label="Send appointment confirmation" />
          <Toggle k="send_appointment_cancellation" label="Send appointment cancellation" />
          <Toggle k="send_invoice_notification" label="Send invoice notification" />
          <Toggle k="send_payment_receipt" label="Send payment receipt" />
          <Toggle k="send_birthday_greeting" label={t("sendBirthdayGreeting")} />
          <div><Label>{t("birthdayDiscountPercentage")}</Label><Input type="number" step="0.01" value={f.birthday_discount_percentage} onChange={e => setF({ ...f, birthday_discount_percentage: +e.target.value })} /></div>
          <Toggle k="send_follow_up_reminder" label={t("sendFollowUpReminder")} />
          <div><Label>{t("followUpDaysAfter")}</Label><Input type="number" value={f.follow_up_days_after} onChange={e => setF({ ...f, follow_up_days_after: +e.target.value })} /></div>
          <div><Label>{t("emailSenderName")}</Label><Input value={f.email_sender_name ?? ""} onChange={e => setF({ ...f, email_sender_name: e.target.value })} /></div>
          <div><Label>{t("emailSenderAddress")}</Label><Input value={f.email_sender_address ?? ""} onChange={e => setF({ ...f, email_sender_address: e.target.value })} /></div>
          <div><Label>{t("smsSenderId")}</Label><Input value={f.sms_sender_id ?? ""} onChange={e => setF({ ...f, sms_sender_id: e.target.value })} /></div>
          <div>
            <Label>{lang === "ar" ? "مزود SMS" : "SMS Provider"}</Label>
            <Select value={smsProvider} onValueChange={setSmsProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="messagebird">MessageBird</SelectItem>
                <SelectItem value="smsmisr">SMS Misr</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>{t("whatsappBusinessNumber")}</Label><Input value={f.whatsapp_business_number ?? ""} onChange={e => setF({ ...f, whatsapp_business_number: e.target.value })} /></div>
          <div><Label>{t("whatsappApiUrl")}</Label><Input value={f.whatsapp_api_url ?? ""} onChange={e => setF({ ...f, whatsapp_api_url: e.target.value })} placeholder="https://..." /></div>
          <div><Label>{t("whatsappApiKey")}</Label><Input type="password" autoComplete="new-password" placeholder="••••••••  (leave blank to keep current)" value={f.whatsapp_api_key ?? ""} onChange={e => setF({ ...f, whatsapp_api_key: e.target.value })} /></div>
          <div><Label>{t("smsApiUrl")}</Label><Input value={f.sms_api_url ?? ""} onChange={e => setF({ ...f, sms_api_url: e.target.value })} placeholder="https://..." /></div>
          <div><Label>{t("smsApiKey")}</Label><Input type="password" autoComplete="new-password" placeholder="••••••••  (leave blank to keep current)" value={f.sms_api_key ?? ""} onChange={e => setF({ ...f, sms_api_key: e.target.value })} /></div>
          {smsProvider === "smsmisr" && <>
            <div><Label>{lang === "ar" ? "SMS Misr Username" : "SMS Misr Username"}</Label><Input autoComplete="off" placeholder={lang === "ar" ? "اتركه فارغًا للإبقاء على المحفوظ" : "Leave blank to keep saved value"} value={f.smsmisr_username ?? ""} onChange={e => setF({ ...f, smsmisr_username: e.target.value })} /></div>
            <div><Label>{lang === "ar" ? "SMS Misr Password" : "SMS Misr Password"}</Label><Input type="password" autoComplete="new-password" placeholder="••••••••  (leave blank to keep current)" value={f.smsmisr_password ?? ""} onChange={e => setF({ ...f, smsmisr_password: e.target.value })} /></div>
            <div><Label>{lang === "ar" ? "Sender Token التجريبي" : "Test Sender Token"}</Label><Input value={f.smsmisr_sender_token ?? ""} onChange={e => setF({ ...f, smsmisr_sender_token: e.target.value })} /></div>
            <div><Label>{lang === "ar" ? "بيئة SMS Misr" : "SMS Misr Environment"}</Label>
              <Select value={String(f.smsmisr_environment ?? 2)} onValueChange={v => setF({ ...f, smsmisr_environment: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="2">Test (2)</SelectItem><SelectItem value="1">Live (1)</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>{lang === "ar" ? "لغة الرسالة" : "Message Language"}</Label>
              <Select value={String(f.smsmisr_language ?? 1)} onValueChange={v => setF({ ...f, smsmisr_language: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">English</SelectItem><SelectItem value="2">Arabic</SelectItem><SelectItem value="3">Unicode</SelectItem></SelectContent>
              </Select>
            </div>
          </>}
          <div className="sm:col-span-2 flex justify-end"><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></div>
        </Card>
      </div>
    </SettingsLayout>
  );
}