// Enqueue win-back reminders for inactive patients.
// Auth: shared cron secret OR service role key.
// Body: { branch_id?: string } (optional, otherwise all branches with winback_enabled)

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function render(body: string, vars: Record<string, string>): string {
  let out = body ?? "";
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v ?? "");
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("SEND_REMINDER_CRON_SECRET");
  const auth = req.headers.get("Authorization") ?? "";
  const isCron =
    (!!cronSecret && auth === `Bearer ${cronSecret}`) ||
    (!!SERVICE_KEY && auth === `Bearer ${SERVICE_KEY}`);
  if (!isCron) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: { branch_id?: string } = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  // Fetch branches with win-back enabled. Built as a factory so a retry issues a
  // fresh request rather than re-awaiting a settled builder.
  const buildSettingsQuery = () => {
    let bq = supabase
      .from("notification_settings")
      .select("branch_id, winback_enabled, winback_inactive_days")
      .eq("winback_enabled", true);
    if (body.branch_id) bq = bq.eq("branch_id", body.branch_id);
    return bq;
  };
  const { data: settings, error: sErr } = await withTransientRetry(buildSettingsQuery);
  if (sErr) {
    return new Response(JSON.stringify({ error: sErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let enqueued = 0;
  let skippedNoConsent = 0;
  let alreadyEnqueued = 0;
  let failed = false;
  const branchResults: Array<{ branch_id: string; enqueued: number; skipped_no_consent?: number; already_enqueued?: number; errors?: number; reason?: string }> = [];

  for (const s of (settings ?? [])) {
    const branch_id = (s as any).branch_id as string;
    const inactiveDays = Math.max(1, (s as any).winback_inactive_days ?? 120);

    // Active win-back templates for this branch. A rejected read must not be
    // reported as "this branch has no template": that is a skip, not a failure,
    // and it keeps the run at HTTP 200 while the whole cohort is lost.
    const { data: tpls, error: tplErr } = await withTransientRetry(() =>
      supabase
        .from("communication_templates")
        .select("channel, body_en, body_ar, enabled")
        .eq("branch_id", branch_id)
        .eq("event_type", "win_back")
        .eq("enabled", true)
    );
    if (tplErr) {
      failed = true;
      branchResults.push({ branch_id, enqueued: 0, reason: `lookup_failed:templates: ${tplErr.message}` });
      continue;
    }
    if (!tpls || tpls.length === 0) {
      branchResults.push({ branch_id, enqueued: 0, reason: "no_template" });
      continue;
    }

    const cutoff = new Date(Date.now() - inactiveDays * 86400_000).toISOString();

    // Patients in branch
    const { data: patients, error: patErr } = await withTransientRetry(() =>
      supabase
        .from("patients")
        .select("id, first_name_en, last_name_en, first_name_ar, last_name_ar, phone, whatsapp_opt_in")
        .eq("branch_id", branch_id)
        .is("deleted_at", null)
    );
    if (patErr) {
      failed = true;
      branchResults.push({ branch_id, enqueued: 0, reason: `lookup_failed:patients: ${patErr.message}` });
      continue;
    }
    if (!patients || patients.length === 0) {
      branchResults.push({ branch_id, enqueued: 0, reason: "no_patients" });
      continue;
    }

    // Most-recent appointment per patient. An aborted read here would leave the
    // map empty, and the filter below treats "no last appointment" as inactive —
    // so a transient rejection would enqueue the *entire* branch, not skip it.
    const ids = patients.map((p: any) => p.id);
    const { data: appts, error: apptErr } = await withTransientRetry(() =>
      supabase
        .from("appointments")
        .select("patient_id, scheduled_at")
        .in("patient_id", ids)
        .order("scheduled_at", { ascending: false })
    );
    if (apptErr) {
      failed = true;
      branchResults.push({ branch_id, enqueued: 0, reason: `lookup_failed:appointments: ${apptErr.message}` });
      continue;
    }
    const lastByPatient = new Map<string, string>();
    for (const a of (appts ?? [])) {
      const pid = (a as any).patient_id as string;
      if (!lastByPatient.has(pid)) lastByPatient.set(pid, (a as any).scheduled_at as string);
    }

    const inactivePatients = patients.filter((p: any) => {
      const last = lastByPatient.get(p.id);
      return !last || last < cutoff;
    });

    let branchEnqueued = 0;
    let branchErrors = 0;
    let branchSkippedNoConsent = 0;
    let branchAlreadyEnqueued = 0;
    // reminders_winback_monthly_channel_uniq is UNIQUE (patient_id, winback_month,
    // reminder_type) WHERE event_type = 'win_back'. A btree unique treats NULL as
    // distinct, so leaving winback_month unset made that index unable to fire: this
    // job runs daily, so every inactive patient was re-enqueued once a day, all month,
    // while the run reported 200. The bucket is the 1st of the current month.
    const winbackMonth = `${new Date().toISOString().slice(0, 7)}-01`;
    for (const p of inactivePatients) {
      const name_en = [p.first_name_en, p.last_name_en].filter(Boolean).join(" ").trim();
      const name_ar = [p.first_name_ar, p.last_name_ar].filter(Boolean).join(" ").trim();
      const payload = {
        patient_name: name_en || name_ar,
        patient_name_ar: name_ar || name_en,
      };

      for (const tpl of tpls) {
        const channel = (tpl as any).channel as string;
        // patients.whatsapp_opt_in is NOT NULL DEFAULT false, so WhatsApp needs an
        // explicit opt-in. Same invariant the DB-side enqueue RPCs apply
        // (20260826040000:139, :257, :318); win_back was the only mass producer missing it.
        if (channel === "whatsapp" && (p as any).whatsapp_opt_in !== true) {
          branchSkippedNoConsent++;
          continue;
        }
        const row = {
          patient_id: p.id,
          branch_id,
          reminder_type: channel,
          scheduled_time: new Date().toISOString(),
          message_en: render((tpl as any).body_en, payload),
          message_ar: render((tpl as any).body_ar, payload),
          status: "pending",
          event_type: "win_back",
          winback_month: winbackMonth,
          template_key: `win_back:${channel}`,
          payload,
          destination_phone: (p as any).phone ?? null,
          destination_channel: channel,
        };
        // Retrying an insert is only safe because winback_month above makes
        // reminders_winback_monthly_channel_uniq live: if the first attempt reached
        // Postgres but its response was rejected by the clock-skewed node, the retry
        // is refused as a duplicate instead of queuing the patient a second message.
        const { error } = await withTransientRetry(
          () => supabase.from("reminders").insert(row),
        );
        // A unique violation means this patient was already enqueued this month.
        // Anything else must surface, or a structurally broken enqueue reports success
        // forever - the failure mode that hid the physio follow-ups for two months.
        if (!error) branchEnqueued++;
        else if (error.code !== "23505") { branchErrors++; failed = true; }
        else branchAlreadyEnqueued++;
      }
    }
    enqueued += branchEnqueued;
    skippedNoConsent += branchSkippedNoConsent;
    alreadyEnqueued += branchAlreadyEnqueued;
    branchResults.push({
      branch_id,
      enqueued: branchEnqueued,
      skipped_no_consent: branchSkippedNoConsent,
      already_enqueued: branchAlreadyEnqueued,
      errors: branchErrors,
      ...(branchErrors > 0 ? { reason: `insert_failed:${branchErrors}` } : {}),
    });
  }

  return new Response(JSON.stringify({ enqueued, skipped_no_consent: skippedNoConsent, already_enqueued: alreadyEnqueued, branches: branchResults }), {
    status: failed ? 500 : 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
