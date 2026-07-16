import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AppointmentSettings() {
  const { t, lang } = useI18n();
  const { branches, currentBranchId } = useBranch();
  const [branchId, setBranchId] = useState(currentBranchId ?? "");
  const [f, setF] = useState<any>({
    slot_duration_minutes: 30, buffer_minutes: 0, max_appointments_per_slot: 1,
    allow_online_booking: true, require_confirmation: false,
    cancellation_deadline_hours: 24, reminder_hours_before: [24, 2],
    max_future_booking_days: 30, min_advance_booking_hours: 1,
  });

  useEffect(() => {
    if (!branchId) return;
    supabase.from("appointment_settings").select("*").eq("branch_id", branchId).maybeSingle()
      .then(({ data }) => { if (data) setF({ ...f, ...data }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const save = async () => {
    if (!branchId) return toast.error(t("branch"));
    const { error } = await supabase.from("appointment_settings").upsert({ ...f, branch_id: branchId }, { onConflict: "branch_id" });
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
  };

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3 sticky top-0 z-20 bg-background/80 backdrop-blur-md py-3 -mx-1 px-1 border-b">
          <h1 className="text-2xl font-bold">{t("appointmentSettings")}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-56"><SelectValue placeholder={t("branch")} /></SelectTrigger>
              <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "الوقت وهيكل الفترات" : "Time & Slot Architecture"}</CardTitle>
            <CardDescription>{lang === "ar" ? "طول الفترة، الفواصل، وسعة الحجز لكل فترة" : "Slot length, buffers, and capacity per slot."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><Label>{t("slotDuration")}</Label><Input type="number" value={f.slot_duration_minutes} onChange={e => setF({ ...f, slot_duration_minutes: +e.target.value })} /></div>
              <div><Label>{t("bufferMinutes")}</Label><Input type="number" value={f.buffer_minutes} onChange={e => setF({ ...f, buffer_minutes: +e.target.value })} /></div>
              <div><Label>{t("maxAppointmentsPerSlot")}</Label><Input type="number" value={f.max_appointments_per_slot} onChange={e => setF({ ...f, max_appointments_per_slot: +e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "قواعد الحجز والإلغاء" : "Booking & Cancellation Rules"}</CardTitle>
            <CardDescription>{lang === "ar" ? "حدود الحجز المسبق ومهل الإلغاء" : "Advance booking windows and cancellation deadlines."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><Label>{t("cancellationDeadlineHours")}</Label><Input type="number" value={f.cancellation_deadline_hours} onChange={e => setF({ ...f, cancellation_deadline_hours: +e.target.value })} /></div>
              <div><Label>{t("maxFutureBookingDays")}</Label><Input type="number" value={f.max_future_booking_days} onChange={e => setF({ ...f, max_future_booking_days: +e.target.value })} /></div>
              <div><Label>{t("minAdvanceBookingHours")}</Label><Input type="number" value={f.min_advance_booking_hours} onChange={e => setF({ ...f, min_advance_booking_hours: +e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "الحجز الإلكتروني والتنبيهات" : "Online Booking & Notifications"}</CardTitle>
            <CardDescription>{lang === "ar" ? "التحكم في الحجز الذاتي وإعدادات التذكير" : "Self-service booking controls and reminder cadence."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3"><Label>{t("allowOnlineBooking")}</Label><Switch checked={!!f.allow_online_booking} onCheckedChange={v => setF({ ...f, allow_online_booking: v })} /></div>
              <div className="flex items-center justify-between rounded-lg border p-3"><Label>{t("requireConfirmation")}</Label><Switch checked={!!f.require_confirmation} onCheckedChange={v => setF({ ...f, require_confirmation: v })} /></div>
              <div className="rounded-lg border p-3 space-y-2">
                <Label>{t("reminderHoursBefore")}</Label>
                <Input value={(f.reminder_hours_before ?? []).join(",")} onChange={e => setF({ ...f, reminder_hours_before: e.target.value.split(",").map(s => +s.trim()).filter(Boolean) })} placeholder="24, 2" />
                <p className="text-xs text-muted-foreground">{lang === "ar" ? "قيم مفصولة بفواصل" : "Comma-separated hours"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}