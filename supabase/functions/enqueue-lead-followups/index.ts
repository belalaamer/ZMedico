import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

const LEAD_PAGE_LIMIT = 500;

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
  const rawBody = await req.text();
  if (rawBody.trim().length > 0) {
    // A malformed body used to fall back to {} , which means "every branch". A typo in
    // branch_id therefore widened the job's scope instead of failing it.
    try { body = JSON.parse(rawBody); } catch {
      return json({ error: "Request body is not valid JSON" }, 400);
    }
  }

  const rawHorizon = Number(body.horizon_hours ?? 24);
  if (!Number.isFinite(rawHorizon)) {
    return json({ error: "horizon_hours must be a number" }, 400);
  }
  const horizonHours = Math.max(1, Math.min(rawHorizon, 168));
  const horizon = new Date(Date.now() + horizonHours * 60 * 60 * 1000).toISOString();
  const buildLeadQuery = () => {
    let query = client
      .from("leads")
      .select("id,branch_id,assigned_to,next_followup_at,full_name,phone")
      .not("next_followup_at", "is", null)
      .lte("next_followup_at", horizon)
      .is("deleted_at", null)
      // Without an explicit order, a page over the cap is an arbitrary subset, so the
      // leads left out of one run can be left out of every run.
      .order("next_followup_at", { ascending: true })
      .limit(LEAD_PAGE_LIMIT);
    if (body.branch_id) query = query.eq("branch_id", body.branch_id);
    return query;
  };

  const { data: leads, error: leadsError } = await withTransientRetry(buildLeadQuery);
  if (leadsError) return json({ error: leadsError.message }, 500);

  let enqueued = 0;
  let skipped = 0;
  const errors: Array<{ lead_id: string; error: string }> = [];

  // Avoid turning the normal idempotent case into a PostgreSQL 23505 error
  // on every scheduled run. Prefetch matching calls first, while
  // keeping the unique-index error handling below as the race-condition guard.
  const existingKeys = new Set<string>();
  const leadRows = leads ?? [];
  const leadIds = leadRows.map((lead) => lead.id);
  if (leadIds.length) {
    // No status filter: lead_followups_pending_unique_idx only covers 'pending', so a
    // completed or cancelled task stops protecting its (lead_id, due_at, channel). If the
    // prefetch also looked only at pending rows, a follow-up a human finished or cancelled
    // would be re-enqueued by the next daily run forever, with the same due date.
    const { data: existing, error: existingError } = await withTransientRetry(() =>
      client
        .from("lead_followups")
        .select("lead_id,due_at,channel")
        .in("lead_id", leadIds)
        .eq("channel", "call")
    );
    if (existingError) {
      // An unreadable dedupe set is not an empty dedupe set. Treating it as empty makes
      // every lead look never-enqueued and turns one rejected read into a full re-insert
      // pass, still answered with HTTP 200.
      return json({ error: `dedupe_lookup_failed: ${existingError.message}` }, 500);
    }
    for (const row of existing ?? []) {
      existingKeys.add(`${row.lead_id}|${row.due_at}|${row.channel}`);
    }
  }

  for (const lead of leadRows) {
    const dueAt = lead.next_followup_at as string;
    const dedupeKey = `${lead.id}|${dueAt}|call`;
    if (existingKeys.has(dedupeKey)) {
      skipped += 1;
      continue;
    }

    const { error } = await withTransientRetry(() =>
      client.from("lead_followups").insert({
        lead_id: lead.id,
        branch_id: lead.branch_id,
        assigned_to: lead.assigned_to,
        due_at: dueAt,
        channel: "call",
        status: "pending",
        source_rule: "lead_next_followup",
        notes: `Automatic follow-up for ${lead.full_name}`,
      })
    );
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

  return json(
    {
      horizon,
      inspected: leadRows.length,
      truncated: leadRows.length === LEAD_PAGE_LIMIT,
      enqueued,
      skipped,
      errors,
    },
    errors.length > 0 ? 500 : 200,
  );
});
