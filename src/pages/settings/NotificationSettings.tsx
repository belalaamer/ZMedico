import { useEffect, useState } from "react";
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
  });
  useEffect(() => {
    if (!branchId) return;
    supabase.from("notification_settings").select("*").eq("branch_id", branchId).maybeSingle()
      .then(({ data }) => { if (data) setF({ ...f, ...data }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);
  const save = async () => {
    if (!branchId) return toast.error(t("branch"));
    const { error } = await supabase.from("notification_settings").upsert({ ...f, branch_id: branchId }, { onConflict: "branch_id" });
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
  };
  const Toggle = ({ k, label }: any) => (<div className="flex items-center justify-between rounded-lg border p-3"><Label>{label}</Label><Switch checked={!!f[k]} onCheckedChange={v => setF({ ...f, [k]: v })} /></div>);
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
        <Card className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Toggle k="send_appointment_reminders" label={t("sendAppointmentReminders")} />
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
          <div><Label>{t("whatsappBusinessNumber")}</Label><Input value={f.whatsapp_business_number ?? ""} onChange={e => setF({ ...f, whatsapp_business_number: e.target.value })} /></div>
          <div className="sm:col-span-2 flex justify-end"><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></div>
        </Card>
      </div>
    </SettingsLayout>
  );
}