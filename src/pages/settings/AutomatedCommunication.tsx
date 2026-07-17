import { useEffect, useMemo, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

type EventType = "booking_confirmation" | "appointment_reminder" | "win_back";
type Channel = "whatsapp" | "sms" | "email";

type Tpl = {
  id?: string;
  branch_id: string;
  event_type: EventType;
  channel: Channel;
  enabled: boolean;
  body_en: string;
  body_ar: string;
  hours_before: number | null;
  _isNew?: boolean;
  _delete?: boolean;
};

const EVENTS: EventType[] = ["booking_confirmation", "appointment_reminder", "win_back"];

export default function AutomatedCommunication() {
  const { t, lang } = useI18n();
  const { branches, currentBranchId } = useBranch();
  const [branchId, setBranchId] = useState(currentBranchId ?? "");
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [winbackEnabled, setWinbackEnabled] = useState(false);
  const [winbackDays, setWinbackDays] = useState<number>(120);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!branchId) return;
    (async () => {
      const [{ data: tpls }, { data: ns }] = await Promise.all([
        supabase.from("communication_templates").select("*").eq("branch_id", branchId),
        // Read via the safe view — secret credentials are DB-blocked for browser clients.
        (supabase as any).from("safe_notification_settings")
          .select("winback_enabled,winback_inactive_days").eq("branch_id", branchId).maybeSingle(),
      ]);
      setTemplates((tpls ?? []) as Tpl[]);
      setWinbackEnabled(!!(ns as any)?.winback_enabled);
      setWinbackDays((ns as any)?.winback_inactive_days ?? 120);
    })();
  }, [branchId]);

  const byEvent = useMemo(() => {
    const map: Record<EventType, Tpl[]> = {
      booking_confirmation: [], appointment_reminder: [], win_back: [],
    };
    for (const t of templates) if (!t._delete) map[t.event_type].push(t);
    return map;
  }, [templates]);

  const addRow = (event_type: EventType) => {
    setTemplates(prev => [...prev, {
      branch_id: branchId,
      event_type,
      channel: "whatsapp",
      enabled: true,
      body_en: "",
      body_ar: "",
      hours_before: event_type === "appointment_reminder" ? 24 : null,
      _isNew: true,
    }]);
  };

  const updateRow = (row: Tpl, patch: Partial<Tpl>) => {
    setTemplates(prev => prev.map(r => r === row ? { ...r, ...patch } : r));
  };

  const removeRow = (row: Tpl) => {
    setTemplates(prev => row._isNew
      ? prev.filter(r => r !== row)
      : prev.map(r => r === row ? { ...r, _delete: true } : r));
  };

  const save = async () => {
    if (!branchId) return toast.error(t("branch"));
    setSaving(true);
    try {
      // Validate
      for (const r of templates) {
        if (r._delete) continue;
        if (r.event_type === "appointment_reminder" && (!r.hours_before || r.hours_before <= 0)) {
          throw new Error(t("hoursBefore"));
        }
      }

      // Deletes
      const deletes = templates.filter(r => r._delete && r.id).map(r => r.id!);
      if (deletes.length) {
        const { error } = await supabase.from("communication_templates").delete().in("id", deletes);
        if (error) throw error;
      }

      // Upserts (insert new and update existing)
      const toUpsert = templates.filter(r => !r._delete).map(r => ({
        ...(r.id ? { id: r.id } : {}),
        branch_id: branchId,
        event_type: r.event_type,
        channel: r.channel,
        enabled: r.enabled,
        body_en: r.body_en,
        body_ar: r.body_ar,
        hours_before: r.event_type === "appointment_reminder" ? r.hours_before : null,
      }));
      if (toUpsert.length) {
        const { error } = await supabase.from("communication_templates").upsert(toUpsert as any);
        if (error) throw error;
      }

      const { error: nsErr } = await supabase.from("notification_settings").upsert(
        { branch_id: branchId, winback_enabled: winbackEnabled, winback_inactive_days: winbackDays } as any,
        { onConflict: "branch_id" }
      );
      if (nsErr) throw nsErr;

      toast.success(t("templateSavedToast"));

      // Reload
      const { data: tpls } = await supabase.from("communication_templates")
        .select("*").eq("branch_id", branchId);
      setTemplates((tpls ?? []) as Tpl[]);
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally { setSaving(false); }
  };

  const eventLabel = (ev: EventType) =>
    ev === "booking_confirmation" ? t("eventBookingConfirmation")
    : ev === "appointment_reminder" ? t("eventAppointmentReminder")
    : t("eventWinBack");

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t("automatedComm")}</h1>
            <p className="text-sm text-muted-foreground">{t("autoCommSubtitle")}</p>
          </div>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-56"><SelectValue placeholder={t("branch")} /></SelectTrigger>
            <SelectContent>
              {branches.map(b => (
                <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">{t("placeholdersHint")}</p>

        {EVENTS.map(ev => (
          <Card key={ev} className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{eventLabel(ev)}</h2>
              <Button size="sm" variant="outline" onClick={() => addRow(ev)} disabled={!branchId}>
                <Plus className="size-4 mr-1" />{t("addTemplate")}
              </Button>
            </div>

            {ev === "win_back" && (
              <div className="grid sm:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label>{t("winbackEnabled")}</Label>
                  <Switch checked={winbackEnabled} onCheckedChange={setWinbackEnabled} />
                </div>
                <div>
                  <Label>{t("winbackInactiveDays")}</Label>
                  <Input type="number" min={1} value={winbackDays}
                    onChange={e => setWinbackDays(Math.max(1, +e.target.value || 1))} />
                </div>
              </div>
            )}

            <div className="space-y-3">
              {byEvent[ev].length === 0 && (
                <p className="text-sm text-muted-foreground">—</p>
              )}
              {byEvent[ev].map((row, i) => (
                <div key={(row.id ?? "new") + i} className="rounded-lg border p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[140px]">
                      <Label className="text-xs">{t("channel")}</Label>
                      <Select value={row.channel} onValueChange={(v: Channel) => updateRow(row, { channel: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {ev === "appointment_reminder" && (
                      <div className="min-w-[140px]">
                        <Label className="text-xs">{t("hoursBefore")}</Label>
                        <Input type="number" min={1} value={row.hours_before ?? ""}
                          onChange={e => updateRow(row, { hours_before: +e.target.value || 0 })} />
                      </div>
                    )}
                    <div className="flex items-center gap-2 ml-auto">
                      <Label className="text-xs">{t("enabled")}</Label>
                      <Switch checked={row.enabled} onCheckedChange={v => updateRow(row, { enabled: v })} />
                      <Button size="icon" variant="ghost" onClick={() => removeRow(row)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{t("bodyEn")}</Label>
                      <Textarea rows={3} value={row.body_en}
                        onChange={e => updateRow(row, { body_en: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">{t("bodyAr")}</Label>
                      <Textarea rows={3} value={row.body_ar} dir="rtl"
                        onChange={e => updateRow(row, { body_ar: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}

        <div className="flex justify-end">
          <Button className="gradient-primary text-primary-foreground" onClick={save} disabled={saving || !branchId}>
            {saving ? "..." : t("saveTemplates")}
          </Button>
        </div>
      </div>
    </SettingsLayout>
  );
}