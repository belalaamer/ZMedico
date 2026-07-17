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

type Form = {
  whatsapp_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_provider: "twilio" | "meta" | "custom";
  sms_provider: "twilio" | "messagebird" | "custom";
  // Meta
  meta_phone_number_id: string;
  whatsapp_api_key: string; // also Meta access token
  // Twilio
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_from_whatsapp: string;
  twilio_from_sms: string;
  // Custom / Generic
  whatsapp_api_url: string;
  sms_api_key: string;
  sms_api_url: string;
  whatsapp_business_number: string;
  sms_sender_id: string;
  reminder_hours_before: number[];
};

const empty: Form = {
  whatsapp_enabled: false, sms_enabled: false,
  whatsapp_provider: "meta", sms_provider: "twilio",
  meta_phone_number_id: "", whatsapp_api_key: "",
  twilio_account_sid: "", twilio_auth_token: "", twilio_from_whatsapp: "", twilio_from_sms: "",
  whatsapp_api_url: "", sms_api_key: "", sms_api_url: "",
  whatsapp_business_number: "", sms_sender_id: "",
  reminder_hours_before: [24, 2],
};

export default function RemindersSettings() {
  const { t, lang } = useI18n();
  const { branches, currentBranchId } = useBranch();
  const [branchId, setBranchId] = useState(currentBranchId ?? "");
  const [f, setF] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!branchId) return;
    (async () => {
      // Read via the safe view — secret credentials are unreadable to the
      // browser at the DB layer (column-level GRANT on the base table).
      const { data: ns } = await (supabase as any).from("safe_notification_settings")
        .select("whatsapp_enabled,sms_enabled,whatsapp_provider,sms_provider,meta_phone_number_id,twilio_account_sid,twilio_from_whatsapp,twilio_from_sms,whatsapp_api_url,sms_api_url,whatsapp_business_number,sms_sender_id")
        .eq("branch_id", branchId).maybeSingle();
      const { data: appt } = await supabase.from("appointment_settings")
        .select("reminder_hours_before").eq("branch_id", branchId).maybeSingle();
      setF({
        ...empty,
        ...(ns ?? {}),
        // never read secrets from server; keep blank placeholders
        whatsapp_api_key: "", twilio_auth_token: "", sms_api_key: "",
        reminder_hours_before: (appt as any)?.reminder_hours_before ?? [24, 2],
      } as Form);
    })();
  }, [branchId]);

  const save = async () => {
    if (!branchId) return toast.error(t("branch"));
    setSaving(true);
    try {
      const payload: any = {
        branch_id: branchId,
        whatsapp_enabled: f.whatsapp_enabled,
        sms_enabled: f.sms_enabled,
        whatsapp_provider: f.whatsapp_provider,
        sms_provider: f.sms_provider,
        meta_phone_number_id: f.meta_phone_number_id || null,
        twilio_account_sid: f.twilio_account_sid || null,
        twilio_from_whatsapp: f.twilio_from_whatsapp || null,
        twilio_from_sms: f.twilio_from_sms || null,
        whatsapp_api_url: f.whatsapp_api_url || null,
        sms_api_url: f.sms_api_url || null,
        whatsapp_business_number: f.whatsapp_business_number || null,
        sms_sender_id: f.sms_sender_id || null,
      };
      // Only write secrets if user typed a new value
      if (f.whatsapp_api_key) payload.whatsapp_api_key = f.whatsapp_api_key;
      if (f.twilio_auth_token) payload.twilio_auth_token = f.twilio_auth_token;
      if (f.sms_api_key) payload.sms_api_key = f.sms_api_key;

      const { error } = await supabase.from("notification_settings")
        .upsert(payload, { onConflict: "branch_id" });
      if (error) throw error;

      const hours = (f.reminder_hours_before ?? []).filter(n => Number.isFinite(n) && n > 0);
      if (hours.length) {
        await supabase.from("appointment_settings")
          .upsert({ branch_id: branchId, reminder_hours_before: hours } as any, { onConflict: "branch_id" });
      }
      toast.success(t("saved"));
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally { setSaving(false); }
  };

  const sendTest = async () => {
    if (!branchId) return toast.error(t("branch"));
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-reminder", {
        body: { branch_id: branchId, due_only: false },
      });
      if (error) throw error;
      toast.success(`${data?.sent ?? 0} sent / ${data?.failed ?? 0} failed`);
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally { setTesting(false); }
  };

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold">{lang === "ar" ? "التذكيرات التلقائية" : "Automatic Reminders"}</h1>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-56"><SelectValue placeholder={t("branch")} /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <Card className="p-5 space-y-5">
          <h2 className="font-semibold">WhatsApp</h2>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>{lang === "ar" ? "تفعيل WhatsApp" : "Enable WhatsApp"}</Label>
            <Switch checked={f.whatsapp_enabled} onCheckedChange={v => setF({ ...f, whatsapp_enabled: v })} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>{lang === "ar" ? "مزود الخدمة" : "Provider"}</Label>
              <Select value={f.whatsapp_provider} onValueChange={(v: any) => setF({ ...f, whatsapp_provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta">Meta WhatsApp Cloud API</SelectItem>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="custom">{lang === "ar" ? "مخصص (HTTP)" : "Custom HTTP"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{lang === "ar" ? "رقم WhatsApp التجاري" : "Business Number"}</Label>
              <Input value={f.whatsapp_business_number} onChange={e => setF({ ...f, whatsapp_business_number: e.target.value })} placeholder="+201234567890" />
            </div>

            {f.whatsapp_provider === "meta" && (<>
              <div>
                <Label>Phone Number ID (Meta)</Label>
                <Input value={f.meta_phone_number_id} onChange={e => setF({ ...f, meta_phone_number_id: e.target.value })} />
              </div>
              <div>
                <Label>Access Token (Meta)</Label>
                <Input type="password" autoComplete="new-password" placeholder="•••••• (leave blank to keep)"
                  value={f.whatsapp_api_key} onChange={e => setF({ ...f, whatsapp_api_key: e.target.value })} />
              </div>
            </>)}

            {f.whatsapp_provider === "twilio" && (<>
              <div>
                <Label>Twilio Account SID</Label>
                <Input value={f.twilio_account_sid} onChange={e => setF({ ...f, twilio_account_sid: e.target.value })} />
              </div>
              <div>
                <Label>Twilio Auth Token</Label>
                <Input type="password" autoComplete="new-password" placeholder="•••••• (leave blank to keep)"
                  value={f.twilio_auth_token} onChange={e => setF({ ...f, twilio_auth_token: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Twilio WhatsApp From</Label>
                <Input value={f.twilio_from_whatsapp} onChange={e => setF({ ...f, twilio_from_whatsapp: e.target.value })} placeholder="whatsapp:+14155238886" />
              </div>
            </>)}

            {f.whatsapp_provider === "custom" && (<>
              <div>
                <Label>API URL</Label>
                <Input value={f.whatsapp_api_url} onChange={e => setF({ ...f, whatsapp_api_url: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <Label>API Key</Label>
                <Input type="password" autoComplete="new-password" placeholder="•••••• (leave blank to keep)"
                  value={f.whatsapp_api_key} onChange={e => setF({ ...f, whatsapp_api_key: e.target.value })} />
              </div>
            </>)}
          </div>
        </Card>

        <Card className="p-5 space-y-5">
          <h2 className="font-semibold">SMS</h2>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>{lang === "ar" ? "تفعيل SMS" : "Enable SMS"}</Label>
            <Switch checked={f.sms_enabled} onCheckedChange={v => setF({ ...f, sms_enabled: v })} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>{lang === "ar" ? "مزود الخدمة" : "Provider"}</Label>
              <Select value={f.sms_provider} onValueChange={(v: any) => setF({ ...f, sms_provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="messagebird">MessageBird</SelectItem>
                  <SelectItem value="custom">{lang === "ar" ? "مخصص (HTTP)" : "Custom HTTP"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{lang === "ar" ? "معرف المرسل" : "Sender ID"}</Label>
              <Input value={f.sms_sender_id} onChange={e => setF({ ...f, sms_sender_id: e.target.value })} />
            </div>

            {f.sms_provider === "twilio" && (<>
              <div>
                <Label>Twilio Account SID</Label>
                <Input value={f.twilio_account_sid} onChange={e => setF({ ...f, twilio_account_sid: e.target.value })} />
              </div>
              <div>
                <Label>Twilio Auth Token</Label>
                <Input type="password" autoComplete="new-password" placeholder="•••••• (leave blank to keep)"
                  value={f.twilio_auth_token} onChange={e => setF({ ...f, twilio_auth_token: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Twilio SMS From</Label>
                <Input value={f.twilio_from_sms} onChange={e => setF({ ...f, twilio_from_sms: e.target.value })} placeholder="+12025550123" />
              </div>
            </>)}

            {(f.sms_provider === "messagebird" || f.sms_provider === "custom") && (<>
              <div>
                <Label>API URL</Label>
                <Input value={f.sms_api_url} onChange={e => setF({ ...f, sms_api_url: e.target.value })}
                  placeholder={f.sms_provider === "messagebird" ? "https://rest.messagebird.com/messages" : "https://..."} />
              </div>
              <div>
                <Label>API Key</Label>
                <Input type="password" autoComplete="new-password" placeholder="•••••• (leave blank to keep)"
                  value={f.sms_api_key} onChange={e => setF({ ...f, sms_api_key: e.target.value })} />
              </div>
            </>)}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">{lang === "ar" ? "توقيت التذكيرات" : "Reminder timing"}</h2>
          <Label>{t("reminderHoursBefore")} ({lang === "ar" ? "افصل بفواصل" : "comma separated"})</Label>
          <Input value={(f.reminder_hours_before ?? []).join(",")}
            onChange={e => setF({ ...f, reminder_hours_before: e.target.value.split(",").map(s => +s.trim()).filter(n => Number.isFinite(n) && n > 0) })}
            placeholder="24, 2" />
          <p className="text-xs text-muted-foreground">{lang === "ar" ? "مثال: 24, 2 يعني تذكيرين قبل الموعد بـ 24 ساعة وساعتين" : "Example: 24, 2 sends two reminders 24h and 2h before the appointment"}</p>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={sendTest} disabled={testing}>{testing ? "..." : (lang === "ar" ? "إرسال التذكيرات المستحقة الآن" : "Send due reminders now")}</Button>
          <Button className="gradient-primary text-primary-foreground" onClick={save} disabled={saving}>{saving ? "..." : t("save")}</Button>
        </div>
      </div>
    </SettingsLayout>
  );
}