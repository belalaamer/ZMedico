import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function corsPreflight() { return new Response("ok", { headers: corsHeaders }); }
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Action = "get" | "save" | "test" | "sync" | "disconnect";
type Input = {
  action?: Action;
  branch_id?: string;
  connection_id?: string;
  ad_account_id?: string;
  business_id?: string | null;
  currency?: string;
  timezone?: string;
  api_version?: string;
  access_token?: string;
};

type Connection = {
  id: string;
  branch_id: string;
  provider: string;
  ad_account_id: string;
  business_id: string | null;
  currency: string;
  timezone: string;
  api_version: string;
  token_ciphertext: string | null;
  token_iv: string | null;
  status: string;
  last_tested_at: string | null;
  last_successful_sync_at: string | null;
  last_attempted_sync_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
};

type MetaInsight = {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string | number;
  impressions?: string | number;
  reach?: string | number;
  clicks?: string | number;
  actions?: unknown;
  action_values?: unknown;
};

const encoder = new TextEncoder();

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[\x00-\x1f\x7f]+/g, " ").slice(0, 200);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(): Promise<CryptoKey> {
  // Prefer a dedicated project secret. The Supabase service-role key is a
  // server-only fallback so the first tenant setup does not fail before the
  // dedicated secret is provisioned; it is never returned to the client.
  const secret = Deno.env.get("META_ADS_ENCRYPTION_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || secret.length < 16) throw new Error("Meta encryption secret is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptToken(token: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(token));
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

async function decryptToken(ciphertext: string, iv: string): Promise<string> {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await encryptionKey(), fromBase64(ciphertext));
  return new TextDecoder().decode(decrypted);
}

function publicConnection(connection: Connection) {
  return {
    id: connection.id,
    branch_id: connection.branch_id,
    provider: connection.provider,
    ad_account_id: connection.ad_account_id,
    business_id: connection.business_id,
    currency: connection.currency,
    timezone: connection.timezone,
    api_version: connection.api_version,
    status: connection.status,
    token_configured: Boolean(connection.token_ciphertext && connection.token_iv),
    last_tested_at: connection.last_tested_at,
    last_successful_sync_at: connection.last_successful_sync_at,
    last_attempted_sync_at: connection.last_attempted_sync_at,
    last_error_code: connection.last_error_code,
    last_error_message: connection.last_error_message,
  };
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
  const allowed = (roles ?? []).some((row) => row.role === "admin" || row.role === "system_owner");
  if (!allowed) throw new Error("Meta Ads connection requires admin access");
  return { userClient, adminClient: createClient(supabaseUrl, serviceRoleKey), userId: authData.user.id };
}

async function requireBranchAccess(userClient: SupabaseClient, branchId: string) {
  const { data, error } = await userClient.rpc("user_has_branch_access", { _branch: branchId });
  if (error || data !== true) throw new Error("Branch access denied");
}

async function getConnection(adminClient: SupabaseClient, input: Input): Promise<Connection> {
  if (input.connection_id) {
    const { data, error } = await adminClient.from("meta_ads_connections").select("id,branch_id,provider,ad_account_id,business_id,currency,timezone,api_version,token_ciphertext,token_iv,status,last_tested_at,last_successful_sync_at,last_attempted_sync_at,last_error_code,last_error_message").eq("id", input.connection_id).limit(1).maybeSingle();
    if (error || !data) throw new Error("Meta Ads connection not found");
    return data as Connection;
  }
  if (!input.branch_id) throw new Error("branch_id is required");
  const { data, error } = await adminClient.from("meta_ads_connections").select("id,branch_id,provider,ad_account_id,business_id,currency,timezone,api_version,token_ciphertext,token_iv,status,last_tested_at,last_successful_sync_at,last_attempted_sync_at,last_error_code,last_error_message").eq("branch_id", input.branch_id).eq("provider", "meta_ads").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) throw new Error("Meta Ads connection not found");
  return data as Connection;
}

async function testMetaConnection(connection: Connection, token: string) {
  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(connection.api_version)}/act_${encodeURIComponent(connection.ad_account_id.replace(/^act_/, ""))}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("fields", "campaign_id,campaign_name,date_start,date_stop,spend");
  url.searchParams.set("date_preset", "last_3d");
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({})) as { error?: { code?: number; message?: string }; data?: unknown[] };
  if (!response.ok || body.error) {
    const code = body.error?.code ? String(body.error.code) : `HTTP_${response.status}`;
    throw new Error(`${code}: ${errorMessage(body.error?.message ?? "Meta connection failed")}`);
  }
  return { rows: Array.isArray(body.data) ? body.data.length : 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const input = await req.json() as Input;
    const action = input.action ?? "get";
    const { userClient, adminClient, userId } = await requireAdmin(req);
    const branchId = input.branch_id;
    if (!branchId && !input.connection_id) throw new Error("branch_id or connection_id is required");
    const connectionForAccess = input.connection_id ? await getConnection(adminClient, input) : null;
    await requireBranchAccess(userClient, branchId ?? connectionForAccess!.branch_id);

    if (action === "get") {
      const connection = connectionForAccess ?? await getConnection(adminClient, input);
      return jsonResponse({ connection: publicConnection(connection) });
    }

    if (action === "save") {
      if (!branchId) throw new Error("branch_id is required");
      if (!input.ad_account_id || !/^act_?\d+$/.test(input.ad_account_id)) throw new Error("A valid Meta Ad Account ID is required");
      if (!input.access_token || input.access_token.length < 20) throw new Error("A valid Meta access token is required");
      const encrypted = await encryptToken(input.access_token.trim());
      const normalizedAccount = `act_${input.ad_account_id.replace(/^act_/, "")}`;
      const payload = {
        branch_id: branchId,
        provider: "meta_ads",
        ad_account_id: normalizedAccount,
        business_id: input.business_id?.trim() || null,
        currency: input.currency?.trim().toUpperCase() || "EGP",
        timezone: input.timezone?.trim() || "Africa/Cairo",
        api_version: input.api_version?.trim() || "v20.0",
        token_ciphertext: encrypted.ciphertext,
        token_iv: encrypted.iv,
        token_fingerprint: await crypto.subtle.digest("SHA-256", encoder.encode(input.access_token.trim())).then((bytes) => toBase64(new Uint8Array(bytes)).slice(0, 16)),
        status: "configured",
        last_error_code: null,
        last_error_message: null,
        updated_by: userId,
      };
      const { data, error } = await adminClient.from("meta_ads_connections").upsert(payload, { onConflict: "branch_id,provider,ad_account_id" }).select("id,branch_id,provider,ad_account_id,business_id,currency,timezone,api_version,token_ciphertext,token_iv,status,last_tested_at,last_successful_sync_at,last_attempted_sync_at,last_error_code,last_error_message").single();
      if (error || !data) throw new Error(errorMessage(error?.message ?? "Unable to save Meta connection"));
      return jsonResponse({ connection: publicConnection(data as Connection) });
    }

    const connection = connectionForAccess ?? await getConnection(adminClient, input);
    if (action === "test") {
      if (!connection.token_ciphertext || !connection.token_iv) throw new Error("No Meta token is configured");
      const token = await decryptToken(connection.token_ciphertext, connection.token_iv);
      const testedAt = new Date().toISOString();
      try {
        const result = await testMetaConnection(connection, token);
        await adminClient.from("meta_ads_connections").update({ status: "connected", last_tested_at: testedAt, last_error_code: null, last_error_message: null, updated_by: userId }).eq("id", connection.id);
        return jsonResponse({ ok: true, rows: result.rows, connection: { ...publicConnection(connection), status: "connected", last_tested_at: testedAt, last_error_code: null, last_error_message: null } });
      } catch (error) {
        const message = errorMessage(error);
        await adminClient.from("meta_ads_connections").update({ status: message.startsWith("190") || message.includes("190") ? "needs_reauth" : "error", last_tested_at: testedAt, last_error_code: message.split(":")[0], last_error_message: message, updated_by: userId }).eq("id", connection.id);
        throw new Error(message);
      }
    }

    if (action === "disconnect") {
      const { error } = await adminClient.from("meta_ads_connections").update({ status: "disconnected", token_ciphertext: null, token_iv: null, token_fingerprint: null, updated_by: userId }).eq("id", connection.id);
      if (error) throw new Error(errorMessage(error.message));
      return jsonResponse({ ok: true });
    }

    throw new Error("Unsupported action");
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
});
