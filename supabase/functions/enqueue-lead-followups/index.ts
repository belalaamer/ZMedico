import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./_shared/cors.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("SEND_REMINDER_CRON_SECRET");
  if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const allowed = (!!cronSecret && auth === `Bearer ${cronSecret}`) || auth === `Bearer ${serviceKey}`;
  if (!allowed) return json({ error: "Unauthorized" }, 401);

  const client = createClient(url, serviceKey);
  let body: { branch_id?: string; horizon_hours?: number } = {};
  try { body = await req.json(); } catch { /* empty body is valid */ }

  const horizonHours = Math.max(1, Math.min(Number(body.horizon_hours ?? 24), 168));
  const horizon = new Date(Date.now() + horizonHours * 60 * 60 * 1000).toISOString();
  let query = client
    .from("leads")
    .select("id,branch_id,assigned_to,next_followup_at,full_name,phone")
    .not("next_followup_at", "is", null)
    .lte("next_followup_at", horizon)
    .is("deleted_at", null)
    .limit(500);
  if (body.branch_id) query = query.eq("branch_id", body.branch_id);

  const { data: leads, error: leadsError } = await query;
  if (leadsError) return json({ error: leadsError.message }, 500);

  let enqueued = 0;
  let skipped = 0;
  const errors: Array<{ lead_id: string; error: string }> = [];

  // Avoid turning the normal idempotent case into a PostgreSQL 23505 error
  // on every scheduled run. Prefetch matching pending calls first, while
  // keeping the unique-index error handling below as the race-condition guard.
  const existingKeys = new Set<string>();
  const leadRows = leads ?? [];
  const leadIds = leadRows.map((lead) => lead.id);
  if (leadIds.length) {
    const { data: existing, error: existingError } = await client
      .from("lead_followups")
      .select("lead_id,due_at,channel")
      .in("lead_id", leadIds)
      .eq("status", "pending")
      .eq("channel", "call");
    if (!existingError) {
      for (const row of existing ?? []) {
        existingKeys.add(`${row.lead_id}|${row.due_at}|${row.channel}`);
      }
    }
  }

  for (const lead of leadRows) {
    const dueAt = lead.next_followup_at as string;
    const dedupeKey = `${lead.id}|${dueAt}|call`;
    if (existingKeys.has(dedupeKey)) {
      skipped += 1;
      continue;
    }

    const { error } = await client.from("lead_followups").insert({
      lead_id: lead.id,
      branch_id: lead.branch_id,
      assigned_to: lead.assigned_to,
      due_at: dueAt,
      channel: "call",
      status: "pending",
      source_rule: "lead_next_followup",
      notes: `Automatic follow-up for ${lead.full_name}`,
    });
    if (!error) {
      existingKeys.add(dedupeKey);
      enqueued += 1;
      continue;
    }
    if (error.code === "23505") {
      skipped += 1;
      continue;
    }
    errors.push({ lead_id: lead.id, error: error.message });
  }

  return json({ horizon, inspected: leads?.length ?? 0, enqueued, skipped, errors });
});
