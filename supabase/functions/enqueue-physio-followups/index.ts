import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./_shared/cors.ts";

// ZMED-287: some Supabase router nodes carry a clock behind this function's own
// API key and reject it with "JWT issued at future". The rejection is node-local,
// so the same call a moment later usually lands on a healthy node. This job runs
// once a day, so an unretired rejection would lose the whole day's cohort while
// still reporting a successful run.
const TRANSIENT_CALL_ERROR =
  /issued at future|could not connect|connection refused|ECONNRESET|ETIMEDOUT|timed out|temporarily unavailable|service unavailable|bad gateway/i;

type TransientResult = { error?: { message?: string } | null };

function isTransientCallError(error: TransientResult["error"]): boolean {
  return TRANSIENT_CALL_ERROR.test(String(error?.message ?? ""));
}

async function withTransientRetry<T extends TransientResult>(
  call: () => PromiseLike<T>,
  attempts = 3,
): Promise<T> {
  let last = await call();
  for (let attempt = 1; attempt < attempts; attempt++) {
    if (!last.error || !isTransientCallError(last.error)) return last;
    await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    last = await call();
  }
  return last;
}

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

  // Built as a factory so a retry issues a fresh request rather than re-awaiting a
  // settled builder.
  const buildSettingsQuery = () => {
    let settingsQuery = client
      .from("notification_settings")
      .select("branch_id,reminder_channel,send_follow_up_reminder,whatsapp_enabled,sms_enabled,whatsapp_provider,whatsapp_api_url,sms_provider,sms_api_url")
      .eq("send_follow_up_reminder", true);
    if (body.branch_id) settingsQuery = settingsQuery.eq("branch_id", body.branch_id);
    return settingsQuery;
  };
  const { data: settings, error: settingsError } = await withTransientRetry(buildSettingsQuery);
  if (settingsError) return json({ error: settingsError.message }, 500);

  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let enqueued = 0;
  let skipped = 0;
  let noConsent = 0;
  let failures = 0;
  const branches: Array<{ branch_id: string; enqueued: number; skipped: number; no_consent?: number; truncated?: boolean; reason?: string }> = [];

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

    const CASE_PAGE_LIMIT = 500;
    const { data: cases, error: casesError } = await withTransientRetry(() =>
      client
        .from("physio_cases")
        .select("id,patient_id,branch_id,followup_due_date,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,phone,whatsapp_opt_in)")
        .eq("branch_id", branchId)
        .eq("status", "active")
        .eq("followup_enabled", true)
        .not("followup_due_date", "is", null)
        .lte("followup_due_date", horizon)
        .is("deleted_at", null)
        .limit(CASE_PAGE_LIMIT)
    );
    if (casesError) {
      // A rejected read is a failure of this run, not a per-branch skip: without the
      // counter the response would be 200 with the whole cohort missing.
      failures++;
      branches.push({ branch_id: branchId, enqueued: 0, skipped: 0, reason: `lookup_failed:cases: ${casesError.message}` });
      continue;
    }
    // The read is capped, so a full page means the rest of the branch was not seen.
    // Reported rather than silently dropped, because the dropped cases are patients
    // who never get their follow-up message.
    const truncated = (cases?.length ?? 0) === CASE_PAGE_LIMIT;

    let branchEnqueued = 0;
    let branchSkipped = 0;
    let branchNoConsent = 0;
    for (const item of cases ?? []) {
      const dueDate = item.followup_due_date as string;
      const scheduled = dueDate < today ? new Date().toISOString() : dateAtNineUtc(dueDate);
      const patient = (item as any).patients ?? {};
      // patients.whatsapp_opt_in is NOT NULL DEFAULT false, so WhatsApp requires an
      // explicit opt-in, as the DB-side enqueue RPCs enforce (20260826040000:139).
      if (channel === "whatsapp" && patient.whatsapp_opt_in !== true) {
        branchNoConsent++;
        continue;
      }
      const nameEn = [patient.first_name_en, patient.last_name_en].filter(Boolean).join(" ").trim() || "patient";
      const nameAr = [patient.first_name_ar, patient.last_name_ar].filter(Boolean).join(" ").trim() || nameEn;
      const payload = {
        physio_case_id: item.id,
        followup_due_date: dueDate,
        patient_name: nameEn,
        patient_name_ar: nameAr,
      };
      // Retrying is safe because reminders_physio_followup_due_uniq keys on
      // payload->>'physio_case_id' / followup_due_date / reminder_type, all set below:
      // if the first attempt reached Postgres but its response was rejected by the
      // clock-skewed node, the retry arrives as a 23505 duplicate instead of queuing
      // the patient a second message.
      const { error } = await withTransientRetry(() =>
        client.from("reminders").insert({
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
        })
      );
      if (error) {
        // Only a unique violation is an expected skip. Anything else - a CHECK
        // violation such as an event_type the live constraint rejects - must surface,
        // otherwise a permanently dead enqueue path reports success forever.
        if (error.code === "23505") branchSkipped++;
        else failures++;
      } else {
        branchEnqueued++;
      }
    }
    enqueued += branchEnqueued;
    skipped += branchSkipped;
    noConsent += branchNoConsent;
    branches.push({ branch_id: branchId, enqueued: branchEnqueued, skipped: branchSkipped, no_consent: branchNoConsent, ...(truncated ? { truncated: true } : {}) });
  }

  return json({ today, enqueued, skipped, no_consent: noConsent, failures, branches }, failures > 0 ? 500 : 200);
});
