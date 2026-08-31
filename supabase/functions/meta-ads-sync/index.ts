// meta-ads-sync — pulls campaign spend (daily insights) and Lead Ads form
// submissions from the Meta Marketing API into ZMedico's own tables.
//
// Mirrors the auth + token-encryption conventions of meta-ads-connection:
// admin/system_owner JWT + branch access, AES-GCM token at rest, Graph v20.0.
// Nothing is ever written back to Meta by this function.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Input = { action?: "sync"; branch_id?: string; days?: number };

type Connection = {
  id: string;
  branch_id: string;
  ad_account_id: string;
  currency: string;
  api_version: string;
  token_ciphertext: string | null;
  token_iv: string | null;
};

const encoder = new TextEncoder();

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[\x00-\x1f\x7f]+/g, " ").slice(0, 200);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("META_ADS_ENCRYPTION_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || secret.length < 16) throw new Error("Meta encryption secret is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptToken(ciphertext: string, iv: string): Promise<string> {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await encryptionKey(), fromBase64(ciphertext));
  return new TextDecoder().decode(decrypted);
}

async function requireAdmin(req: Request): Promise<{ userClient: SupabaseClient; adminClient: SupabaseClient; userId: string }> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication required");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase function secrets are not configured");
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new Error("Authentication required");
  const { data: roles, error: roleError } = await userClient.from("user_roles").select("role").eq("user_id", authData.user.id).limit(10);
  if (roleError) throw new Error("Unable to verify permissions");
  const allowed = (roles ?? []).some((row) => row.role === "admin" || row.role === "system_owner" || row.role === "manager");
  if (!allowed) throw new Error("Meta Ads sync requires admin or manager access");
  return { userClient, adminClient: createClient(supabaseUrl, serviceRoleKey), userId: authData.user.id };
}

async function requireBranchAccess(userClient: SupabaseClient, branchId: string) {
  const { data, error } = await userClient.rpc("user_has_branch_access", { _branch: branchId });
  if (error || data !== true) throw new Error("Branch access denied");
}

async function graphGet(url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: { code?: number; message?: string } };
  if (!response.ok || body.error) {
    const code = body.error?.code ? String(body.error.code) : `HTTP_${response.status}`;
    throw new Error(`${code}: ${errorMessage(body.error?.message ?? "Meta API request failed")}`);
  }
  return body;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type FieldDatum = { name?: string; values?: unknown[] };

function leadField(fieldData: FieldDatum[], names: string[]): string | null {
  for (const name of names) {
    const entry = fieldData.find((f) => (f.name ?? "").toLowerCase() === name);
    const value = entry?.values?.[0];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const input = await req.json() as Input;
    if ((input.action ?? "sync") !== "sync") throw new Error("Unsupported action");
    if (!input.branch_id) throw new Error("branch_id is required");
    const { userClient, adminClient, userId } = await requireAdmin(req);
    await requireBranchAccess(userClient, input.branch_id);

    const { data: conn, error: connError } = await adminClient
      .from("meta_ads_connections")
      .select("id,branch_id,ad_account_id,currency,api_version,token_ciphertext,token_iv")
      .eq("branch_id", input.branch_id)
      .eq("provider", "meta_ads")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (connError || !conn) throw new Error("Meta Ads connection not found for this branch");
    const connection = conn as Connection;
    if (!connection.token_ciphertext || !connection.token_iv) throw new Error("No Meta token is configured");
    const token = await decryptToken(connection.token_ciphertext, connection.token_iv);

    const days = Math.min(Math.max(Number(input.days) || 28, 1), 90);
    const until = new Date();
    const since = new Date(until.getTime() - days * 86_400_000);
    const apiVersion = connection.api_version || "v20.0";
    const account = `act_${connection.ad_account_id.replace(/^act_/, "")}`;
    const startedAt = new Date().toISOString();

    // ---------- Part 1: daily campaign spend -> lead_campaign_spend ----------
    let spendRows = 0;
    let totalSpend = 0;
    {
      const url = new URL(`https://graph.facebook.com/${apiVersion}/${account}/insights`);
      url.searchParams.set("level", "campaign");
      url.searchParams.set("fields", "campaign_id,campaign_name,date_start,date_stop,spend,impressions,reach,clicks,actions");
      url.searchParams.set("time_increment", "1");
      url.searchParams.set("time_range", JSON.stringify({ since: isoDate(since), until: isoDate(until) }));
      url.searchParams.set("limit", "500");
      url.searchParams.set("access_token", token);
      const body = await graphGet(url);
      const rows = Array.isArray(body.data) ? body.data as Record<string, unknown>[] : [];
      const upserts = rows.map((row) => {
        const actions = Array.isArray(row.actions) ? row.actions as { action_type?: string; value?: string }[] : [];
        const actionValue = (type: string) => {
          const hit = actions.find((a) => a.action_type === type);
          return hit ? Number(hit.value ?? 0) : null;
        };
        const spend = Number(row.spend ?? 0);
        totalSpend += spend;
        return {
          branch_id: connection.branch_id,
          provider: "meta_ads",
          ad_account_id: account,
          campaign_id: String(row.campaign_id ?? ""),
          campaign_name: String(row.campaign_name ?? ""),
          source: "meta_api",
          report_date: String(row.date_start ?? isoDate(until)),
          date_start: String(row.date_start ?? isoDate(until)),
          date_stop: String(row.date_stop ?? row.date_start ?? isoDate(until)),
          currency: connection.currency || "EGP",
          spend,
          impressions: Number(row.impressions ?? 0),
          reach: Number(row.reach ?? 0),
          clicks: Number(row.clicks ?? 0),
          link_clicks: actionValue("link_click"),
          leads_reported: actionValue("lead") ?? actionValue("leadgen_grouped"),
          actions: actions.length ? actions : null,
          is_active: true,
          is_estimated: false,
          last_synced_at: startedAt,
          source_updated_at: startedAt,
        };
      }).filter((row) => row.campaign_id);
      if (upserts.length) {
        const { error } = await adminClient
          .from("lead_campaign_spend")
          .upsert(upserts, { onConflict: "provider,ad_account_id,campaign_id,report_date,currency" });
        if (error) throw new Error(`spend_upsert: ${errorMessage(error.message)}`);
        spendRows = upserts.length;
      }
    }

    // ---------- Part 2: Lead Ads form submissions -> leads ----------
    // Requires the token to hold leads_retrieval (plus page access). If the
    // token lacks it, we report the spend part as synced and surface the
    // leads error explicitly instead of failing the whole run.
    let leadsSeen = 0;
    let leadsInserted = 0;
    let leadsError: string | null = null;
    try {
      const { data: stage } = await adminClient
        .from("lead_pipeline_stages")
        .select("id")
        .eq("slug", "new-lead")
        .is("branch_id", null)
        .limit(1)
        .maybeSingle();
      const stageId = (stage as { id?: string } | null)?.id ?? null;

      let nextUrl: URL | null = new URL(`https://graph.facebook.com/${apiVersion}/${account}/ads`);
      nextUrl.searchParams.set("fields", `id,name,campaign_id,adset_name,campaign{name},leads.limit(50){id,created_time,field_data}`);
      nextUrl.searchParams.set("limit", "100");
      nextUrl.searchParams.set("access_token", token);
      let pages = 0;
      while (nextUrl && pages < 3) {
        pages += 1;
        const body = await graphGet(nextUrl);
        const ads = Array.isArray(body.data) ? body.data as Record<string, unknown>[] : [];
        for (const ad of ads) {
          const leadsEdge = (ad.leads as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
          for (const lead of leadsEdge) {
            leadsSeen += 1;
            const metaLeadId = String(lead.id ?? "");
            if (!metaLeadId) continue;
            const fieldData = Array.isArray(lead.field_data) ? lead.field_data as FieldDatum[] : [];
            const fullName = leadField(fieldData, ["full_name", "name", "الاسم", "الاسم_الكامل"]) ??
              [leadField(fieldData, ["first_name"]), leadField(fieldData, ["last_name"])].filter(Boolean).join(" ").trim();
            const phone = leadField(fieldData, ["phone_number", "phone", "رقم_الهاتف", "الهاتف"]) ?? "unknown";
            const campaignName = (ad.campaign as { name?: string } | undefined)?.name ?? null;
            const row = {
              branch_id: connection.branch_id,
              full_name: fullName || "Meta lead",
              phone,
              phone_normalized: phone.replace(/[^0-9]/g, "") || "unknown",
              source: "meta_lead_ad",
              platform: "facebook",
              campaign_id: ad.campaign_id ? String(ad.campaign_id) : null,
              campaign_name: campaignName,
              ad_set: (ad.adset_name as string | undefined) ?? null,
              ad_name: (ad.name as string | undefined) ?? null,
              stage_id: stageId,
              lead_score: 60,
              last_activity_at: new Date().toISOString(),
              meta_lead_id: metaLeadId,
              utm_parameters: {
                meta_lead_id: metaLeadId,
                lead_created_time: lead.created_time ?? null,
                email: leadField(fieldData, ["email", "البريد_الإلكتروني"]),
              },
            };
            const { error, data: inserted } = await adminClient
              .from("leads")
              .upsert(row, { onConflict: "meta_lead_id", ignoreDuplicates: true })
              .select("id");
            if (error) throw new Error(`lead_insert: ${errorMessage(error.message)}`);
            if (Array.isArray(inserted) && inserted.length) leadsInserted += 1;
          }
        }
        const paging = body.paging as { next?: string } | undefined;
        nextUrl = paging?.next ? new URL(paging.next) : null;
      }
    } catch (error) {
      leadsError = errorMessage(error);
    }

    const finishedAt = new Date().toISOString();
    await adminClient.from("meta_ads_sync_runs").insert({
      connection_id: connection.id,
      requested_start: isoDate(since),
      requested_stop: isoDate(until),
      api_version: apiVersion,
      status: leadsError ? "partial" : "success",
      rows_received: spendRows + leadsSeen,
      rows_inserted: leadsInserted,
      rows_updated: spendRows,
      rows_rejected: 0,
      pages_read: 1,
      total_spend: totalSpend,
      currency_set: connection.currency || "EGP",
      error_code: leadsError ? leadsError.split(":")[0] : null,
      error_message: leadsError,
      started_at: startedAt,
      finished_at: finishedAt,
    });
    await adminClient.from("meta_ads_connections").update({
      status: "connected",
      last_attempted_sync_at: finishedAt,
      last_successful_sync_at: finishedAt,
      last_error_code: leadsError ? leadsError.split(":")[0] : null,
      last_error_message: leadsError,
      updated_by: userId,
    }).eq("id", connection.id);

    return jsonResponse({
      ok: true,
      days,
      spend_rows: spendRows,
      total_spend: totalSpend,
      leads_seen: leadsSeen,
      leads_inserted: leadsInserted,
      leads_error: leadsError,
    });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
});
