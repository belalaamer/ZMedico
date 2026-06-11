// Enqueue win-back reminders for inactive patients.
// Auth: shared cron secret OR service role key.
// Body: { branch_id?: string } (optional, otherwise all branches with winback_enabled)

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  // Fetch branches with win-back enabled
  let bq = supabase
    .from("notification_settings")
    .select("branch_id, winback_enabled, winback_inactive_days")
    .eq("winback_enabled", true);
  if (body.branch_id) bq = bq.eq("branch_id", body.branch_id);
  const { data: settings, error: sErr } = await bq;
  if (sErr) {
    return new Response(JSON.stringify({ error: sErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let enqueued = 0;
  const branchResults: Array<{ branch_id: string; enqueued: number; reason?: string }> = [];

  for (const s of (settings ?? [])) {
    const branch_id = (s as any).branch_id as string;
    const inactiveDays = Math.max(1, (s as any).winback_inactive_days ?? 120);

    // Active win-back templates for this branch
    const { data: tpls } = await supabase
      .from("communication_templates")
      .select("channel, body_en, body_ar, enabled")
      .eq("branch_id", branch_id)
      .eq("event_type", "win_back")
      .eq("enabled", true);
    if (!tpls || tpls.length === 0) {
      branchResults.push({ branch_id, enqueued: 0, reason: "no_template" });
      continue;
    }

    const cutoff = new Date(Date.now() - inactiveDays * 86400_000).toISOString();

    // Patients in branch
    const { data: patients } = await supabase
      .from("patients")
      .select("id, first_name_en, last_name_en, first_name_ar, last_name_ar, phone")
      .eq("branch_id", branch_id)
      .is("deleted_at", null);

    if (!patients || patients.length === 0) {
      branchResults.push({ branch_id, enqueued: 0, reason: "no_patients" });
      continue;
    }

    // Most-recent appointment per patient
    const ids = patients.map((p: any) => p.id);
    const { data: appts } = await supabase
      .from("appointments")
      .select("patient_id, scheduled_at")
      .in("patient_id", ids)
      .order("scheduled_at", { ascending: false });
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
    for (const p of inactivePatients) {
      const name_en = [p.first_name_en, p.last_name_en].filter(Boolean).join(" ").trim();
      const name_ar = [p.first_name_ar, p.last_name_ar].filter(Boolean).join(" ").trim();
      const payload = {
        patient_name: name_en || name_ar,
        patient_name_ar: name_ar || name_en,
      };

      for (const tpl of tpls) {
        const channel = (tpl as any).channel as string;
        const row = {
          patient_id: p.id,
          branch_id,
          reminder_type: channel,
          scheduled_time: new Date().toISOString(),
          message_en: render((tpl as any).body_en, payload),
          message_ar: render((tpl as any).body_ar, payload),
          status: "pending",
          event_type: "win_back",
          template_key: `win_back:${channel}`,
          payload,
          destination_phone: (p as any).phone ?? null,
          destination_channel: channel,
        };
        const { error } = await supabase.from("reminders").insert(row);
        // Ignore unique-violation (already enqueued this month)
        if (!error) branchEnqueued++;
      }
    }
    enqueued += branchEnqueued;
    branchResults.push({ branch_id, enqueued: branchEnqueued });
  }

  return new Response(JSON.stringify({ enqueued, branches: branchResults }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});