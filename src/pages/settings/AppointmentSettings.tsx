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

type BookingResource = {
  id?: string;
  branch_id?: string;
  name_en: string;
  name_ar: string;
  resource_type: "room" | "equipment" | "provider";
  capacity: number;
  is_active: boolean;
  display_order: number;
};

const resourceTable = supabase as unknown as {
  from: (table: string) => any;
};

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
  const [resources, setResources] = useState<BookingResource[]>([]);
  const [newResource, setNewResource] = useState<BookingResource>({
    name_en: "", name_ar: "", resource_type: "room", capacity: 1, is_active: true, display_order: 0,
  });
  const [resourcesLoading, setResourcesLoading] = useState(false);

  useEffect(() => {
    if (!branchId) return;
    supabase.from("appointment_settings").select("*").eq("branch_id", branchId).maybeSingle()
      .then(({ data }) => { if (data) setF((current: any) => ({ ...current, ...data })); });
    void loadResources(branchId);
  }, [branchId]);

  const loadResources = async (selectedBranchId = branchId) => {
    if (!selectedBranchId) { setResources([]); return; }
    setResourcesLoading(true);
    const { data, error } = await resourceTable.from("booking_resources")
      .select("id,branch_id,name_en,name_ar,resource_type,capacity,is_active,display_order")
      .eq("branch_id", selectedBranchId)
      .order("display_order", { ascending: true })
      .order("name_en", { ascending: true });
    setResourcesLoading(false);
    if (error) { toast.error(error.message); return; }
    setResources((data ?? []) as BookingResource[]);
  };

  const save = async () => {
    if (!branchId) return toast.error(t("branch"));
    const { error } = await supabase.from("appointment_settings").upsert({ ...f, branch_id: branchId }, { onConflict: "branch_id" });
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
  };

  const saveResource = async (resource: BookingResource) => {
    if (!branchId) return toast.error(t("branch"));
    const nameEn = resource.name_en.trim();
    const nameAr = resource.name_ar.trim();
    if (!nameEn || !nameAr) return toast.error(lang === "ar" ? "اكتب اسم الغرفة بالعربية والإنجليزية" : "Enter the room name in Arabic and English");
    const capacity = Math.max(1, Math.min(100, Number(resource.capacity) || 1));
    const { error } = await resourceTable.from("booking_resources").upsert({
      ...resource, id: resource.id, branch_id: branchId, name_en: nameEn, name_ar: nameAr, capacity,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حفظ المورد" : "Resource saved");
    await loadResources();
  };

  const addResource = async () => {
    await saveResource({ ...newResource, display_order: resources.length });
    setNewResource({ name_en: "", name_ar: "", resource_type: "room", capacity: 1, is_active: true, display_order: resources.length + 1 });
  };

  const deleteResource = async (resource: BookingResource) => {
    if (!resource.id) return;
    const { error } = await resourceTable.from("booking_resources").delete().eq("id", resource.id).eq("branch_id", branchId);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حذف المورد" : "Resource removed");
    await loadResources();
  };

  const updateResource = (id: string, patch: Partial<BookingResource>) => {
    setResources((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
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
            <CardTitle>{lang === "ar" ? "الغرف والموارد وسعة الحجز" : "Rooms, resources & booking capacity"}</CardTitle>
            <CardDescription>
              {lang === "ar"
                ? "أضف كل غرفة مرة واحدة. كل حجز يستهلك خانة واحدة من سعة الغرفة، ويمكن حجز نفس الوقت أكثر من مرة حتى تمتلئ الغرف المتاحة."
                : "Add each room once. Every booking consumes one capacity unit, so the same time can be booked again until all eligible rooms are full."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/20 p-4 md:grid-cols-[1fr_1fr_150px_120px_auto] md:items-end">
              <div><Label>{lang === "ar" ? "اسم الغرفة بالإنجليزية" : "Room name in English"}</Label><Input value={newResource.name_en} onChange={(e) => setNewResource({ ...newResource, name_en: e.target.value })} placeholder="Room 1" /></div>
              <div><Label>{lang === "ar" ? "اسم الغرفة بالعربية" : "Room name in Arabic"}</Label><Input value={newResource.name_ar} onChange={(e) => setNewResource({ ...newResource, name_ar: e.target.value })} placeholder="الغرفة 1" /></div>
              <div><Label>{lang === "ar" ? "السعة" : "Capacity"}</Label><Input type="number" min={1} max={100} value={newResource.capacity} onChange={(e) => setNewResource({ ...newResource, capacity: +e.target.value })} /></div>
              <div><Label>{lang === "ar" ? "النوع" : "Type"}</Label><Select value={newResource.resource_type} onValueChange={(value) => setNewResource({ ...newResource, resource_type: value as BookingResource["resource_type"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="room">{lang === "ar" ? "غرفة" : "Room"}</SelectItem><SelectItem value="equipment">{lang === "ar" ? "جهاز" : "Equipment"}</SelectItem><SelectItem value="provider">{lang === "ar" ? "مقدم خدمة" : "Provider"}</SelectItem></SelectContent></Select></div>
              <Button onClick={addResource} disabled={!branchId || !newResource.name_en.trim() || !newResource.name_ar.trim()}>{lang === "ar" ? "إضافة" : "Add"}</Button>
            </div>

            {resourcesLoading ? <p className="text-sm text-muted-foreground">{lang === "ar" ? "جارٍ تحميل الموارد…" : "Loading resources…"}</p> : null}
            {!resourcesLoading && !resources.length ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">{lang === "ar" ? "لم تتم إضافة غرف بعد. إلى أن تضيف موارد، سيستمر النظام في استخدام سعة الفرع العامة." : "No resources yet. Until you add them, the system will keep using the branch-wide capacity setting."}</p> : null}
            <div className="space-y-3">
              {resources.map((resource) => (
                <div key={resource.id} className="grid grid-cols-1 gap-3 rounded-lg border p-4 md:grid-cols-[1fr_1fr_150px_120px_auto_auto] md:items-end">
                  <div><Label>{lang === "ar" ? "الإنجليزية" : "English"}</Label><Input value={resource.name_en} onChange={(e) => updateResource(resource.id!, { name_en: e.target.value })} /></div>
                  <div><Label>{lang === "ar" ? "العربية" : "Arabic"}</Label><Input value={resource.name_ar} onChange={(e) => updateResource(resource.id!, { name_ar: e.target.value })} /></div>
                  <div><Label>{lang === "ar" ? "السعة" : "Capacity"}</Label><Input type="number" min={1} max={100} value={resource.capacity} onChange={(e) => updateResource(resource.id!, { capacity: +e.target.value })} /></div>
                  <div><Label>{lang === "ar" ? "نشطة" : "Active"}</Label><div className="flex h-10 items-center"><Switch checked={resource.is_active} onCheckedChange={(value) => updateResource(resource.id!, { is_active: value })} /></div></div>
                  <Button variant="outline" onClick={() => saveResource(resource)}>{t("save")}</Button>
                  <Button variant="ghost" className="text-destructive" onClick={() => deleteResource(resource)}>{lang === "ar" ? "حذف" : "Remove"}</Button>
                </div>
              ))}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {lang === "ar"
                ? "مثال: إذا أضفت 3 غرف بسعة 1، يمكن قبول 3 مرضى في نفس الوقت للخدمة نفسها، ثم يغلق الموعد تلقائيًا عند امتلاء الغرف. لخدمة جماعية، اجعل سعة الغرفة 4 مثلًا، فيصبح الحد 12 مريضًا عبر 3 غرف."
                : "Example: 3 rooms with capacity 1 allow 3 patients at the same time for the same service. For a group service, capacity 4 per room gives up to 12 concurrent patients across 3 rooms."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "الوقت وهيكل الفترات" : "Time & Slot Architecture"}</CardTitle>
            <CardDescription>{lang === "ar" ? "طول الفترة، الفواصل، وسعة الحجز الاحتياطية عند عدم استخدام موارد" : "Slot length, buffers, and fallback capacity when no resources are configured."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><Label>{t("slotDuration")}</Label><Input type="number" min={5} value={f.slot_duration_minutes} onChange={e => setF({ ...f, slot_duration_minutes: +e.target.value })} /></div>
              <div><Label>{t("bufferMinutes")}</Label><Input type="number" min={0} value={f.buffer_minutes} onChange={e => setF({ ...f, buffer_minutes: +e.target.value })} /></div>
              <div><Label>{t("maxAppointmentsPerSlot")}</Label><Input type="number" min={1} value={f.max_appointments_per_slot} onChange={e => setF({ ...f, max_appointments_per_slot: +e.target.value })} /></div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{lang === "ar" ? "بعد إضافة غرفة واحدة على الأقل، لن يعتمد الحجز العام على هذا الرقم، بل سيحسب السعة الفعلية للغرف النشطة." : "Once at least one room is added, public booking uses active room capacity instead of this fallback number."}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "قواعد الحجز والإلغاء" : "Booking & Cancellation Rules"}</CardTitle>
            <CardDescription>{lang === "ar" ? "حدود الحجز المسبق ومهل الإلغاء" : "Advance booking windows and cancellation deadlines."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><Label>{t("cancellationDeadlineHours")}</Label><Input type="number" min={0} value={f.cancellation_deadline_hours} onChange={e => setF({ ...f, cancellation_deadline_hours: +e.target.value })} /></div>
              <div><Label>{t("maxFutureBookingDays")}</Label><Input type="number" min={1} value={f.max_future_booking_days} onChange={e => setF({ ...f, max_future_booking_days: +e.target.value })} /></div>
              <div><Label>{t("minAdvanceBookingHours")}</Label><Input type="number" min={0} value={f.min_advance_booking_hours} onChange={e => setF({ ...f, min_advance_booking_hours: +e.target.value })} /></div>
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
              <div className="rounded-lg border p-3 space-y-2"><Label>{t("reminderHoursBefore")}</Label><Input value={(f.reminder_hours_before ?? []).join(",")} onChange={e => setF({ ...f, reminder_hours_before: e.target.value.split(",").map(s => +s.trim()).filter(Boolean) })} placeholder="24, 2" /><p className="text-xs text-muted-foreground">{lang === "ar" ? "قيم مفصولة بفواصل" : "Comma-separated hours"}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}
