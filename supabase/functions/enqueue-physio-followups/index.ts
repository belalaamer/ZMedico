import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./_shared/cors.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dateAtNineUtc(date: string): string {
  return `${date}T09:00:00.000Z`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("SEND_REMINDER_CRON_SECRET");
  if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const allowed =
    (!!cronSecret && auth === `Bearer ${cronSecret}`) ||
    auth === `Bearer ${serviceKey}`;
  if (!allowed) return json({ error: "Unauthorized" }, 401);

  const client = createClient(url, serviceKey);
  let body: { branch_id?: string } = {};
  try { body = await req.json(); } catch { /* empty body is valid */ }

  let settingsQuery = client
    .from("notification_settings")
    .select("branch_id,reminder_channel,send_follow_up_reminder,whatsapp_enabled,sms_enabled,whatsapp_provider,whatsapp_api_url,sms_provider,sms_api_url")
    .eq("send_follow_up_reminder", true);
  if (body.branch_id) settingsQuery = settingsQuery.eq("branch_id", body.branch_id);
  const { data: settings, error: settingsError } = await settingsQuery;
  if (settingsError) return json({ error: settingsError.message }, 500);

  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let enqueued = 0;
  let skipped = 0;
  const branches: Array<{ branch_id: string; enqueued: number; skipped: number; reason?: string }> = [];

  for (const setting of settings ?? []) {
    const branchId = setting.branch_id as string;
    const channel = (setting.reminder_channel ?? "whatsapp") as "whatsapp" | "sms" | "email" | "push";
    const channelReady =
      channel === "whatsapp" ? setting.whatsapp_enabled === true && (!!setting.whatsapp_provider || !!setting.whatsapp_api_url) :
      channel === "sms" ? setting.sms_enabled === true && (!!setting.sms_provider || !!setting.sms_api_url) :
      channel === "push";
    if (!channelReady) {
      branches.push({ branch_id: branchId, enqueued: 0, skipped: 0, reason: `channel_not_ready:${channel}` });
      continue;
    }

    const { data: cases, error: casesError } = await client
      .from("physio_cases")
      .select("id,patient_id,branch_id,followup_due_date,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,phone)")
      .eq("branch_id", branchId)
      .eq("status", "active")
      .eq("followup_enabled", true)
      .not("followup_due_date", "is", null)
      .lte("followup_due_date", horizon)
      .is("deleted_at", null)
      .limit(500);
    if (casesError) {
      branches.push({ branch_id: branchId, enqueued: 0, skipped: 0, reason: casesError.message });
      continue;
    }

    let branchEnqueued = 0;
    let branchSkipped = 0;
    for (const item of cases ?? []) {
      const dueDate = item.followup_due_date as string;
      const scheduled = dueDate < today ? new Date().toISOString() : dateAtNineUtc(dueDate);
      const patient = (item as any).patients ?? {};
      const nameEn = [patient.first_name_en, patient.last_name_en].filter(Boolean).join(" ").trim() || "patient";
      const nameAr = [patient.first_name_ar, patient.last_name_ar].filter(Boolean).join(" ").trim() || nameEn;
      const payload = {
        physio_case_id: item.id,
        followup_due_date: dueDate,
        patient_name: nameEn,
        patient_name_ar: nameAr,
      };
      const { error } = await client.from("reminders").insert({
        patient_id: item.patient_id,
        branch_id: branchId,
        reminder_type: channel,
        scheduled_time: scheduled,
        message_en: `Hello ${nameEn}, this is a reminder to follow up on your physical therapy plan.`,
        message_ar: `مرحبًا ${nameAr}، هذا تذكير بموعد متابعة خطة العلاج الطبيعي.`,
        status: "pending",
        event_type: "physio_followup",
        template_key: "physio_followup",
        payload,
        destination_phone: patient.phone ?? null,
        destination_channel: channel,
      });
      if (error) {
        if (error.code === "23505") branchSkipped++;
        else branchSkipped++;
      } else {
        branchEnqueued++;
      }
    }
    enqueued += branchEnqueued;
    skipped += branchSkipped;
    branches.push({ branch_id: branchId, enqueued: branchEnqueued, skipped: branchSkipped });
  }

  return json({ today, enqueued, skipped, branches });
});
