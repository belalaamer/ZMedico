import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "list" | "create" | "status" | "disable" | "remove";
type Input = {
  action?: Action;
  tenant_id?: string;
  default_branch_id?: string;
  domain_id?: string;
  hostname?: string;
  validation_method?: "txt" | "http" | "email" | "prevalidation";
};

type DomainRow = {
  id: string;
  tenant_id: string;
  hostname: string;
  normalized_hostname: string;
  default_branch_id: string | null;
  status: string;
  validation_method: string;
  validation_records: unknown;
  cname_target: string | null;
  cloudflare_hostname_id: string | null;
  hostname_status: string | null;
  ssl_status: string | null;
  is_enabled: boolean;
  verified_at: string | null;
  provider_error_code: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
};

type CloudflareHostname = {
  id?: string;
  hostname?: string;
  status?: string;
  ssl?: { status?: string; method?: string; type?: string; validation_records?: unknown[] };
  ownership_verification?: { type?: string; name?: string; value?: string };
  ownership_verification_http?: { http_url?: string; http_body?: string };
  errors?: Array<{ code?: number; message?: string }>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[\x00-\x1f\x7f]+/g, " ").slice(0, 240);
}

function normalizeHostname(value: string): string {
  const candidate = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!candidate || candidate.length > 253 || candidate.includes("/") || candidate.includes("@")) {
    throw new Error("Enter a valid hostname, for example clinic.example.com");
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(candidate)) {
    throw new Error("Enter a valid hostname, for example clinic.example.com");
  }
  return candidate;
}

function safeProviderError(body: CloudflareHostname | null): string | null {
  const first = body?.errors?.[0];
  if (!first) return null;
  return first.code ? `CF_${first.code}` : "CLOUDFLARE_ERROR";
}

function validationRecords(body: CloudflareHostname): unknown[] {
  const records: unknown[] = [];
  if (body.ownership_verification?.name && body.ownership_verification.value) {
    records.push({
      type: body.ownership_verification.type ?? "txt",
      name: body.ownership_verification.name,
      value: body.ownership_verification.value,
      purpose: "ownership",
    });
  }
  if (body.ownership_verification_http?.http_url && body.ownership_verification_http.http_body) {
    records.push({
      type: "http",
      url: body.ownership_verification_http.http_url,
      value: body.ownership_verification_http.http_body,
      purpose: "ownership",
    });
  }
  for (const record of body.ssl?.validation_records ?? []) {
    if (record && typeof record === "object") records.push(record);
  }
  return records;
}

function publicDomain(row: DomainRow) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    hostname: row.hostname,
    default_branch_id: row.default_branch_id,
    status: row.status,
    validation_method: row.validation_method,
    validation_records: Array.isArray(row.validation_records) ? row.validation_records : [],
    cname_target: row.cname_target,
    cloudflare_hostname_id: row.cloudflare_hostname_id,
    hostname_status: row.hostname_status,
    ssl_status: row.ssl_status,
    is_enabled: row.is_enabled,
    verified_at: row.verified_at,
    last_checked_at: row.last_checked_at,
    last_error: row.last_error,
    created_at: row.created_at,
  };
}

async function requireSystemOwner(req: Request): Promise<{ userId: string; db: SupabaseClient }> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication required");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase function secrets are not configured");
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("Authentication required");
  const { data: allowed, error: roleError } = await userClient.rpc("has_role", { _user_id: data.user.id, _role: "system_owner" });
  if (roleError || allowed !== true) throw new Error("Custom Domains require System Owner access");
  return { userId: data.user.id, db: createClient(supabaseUrl, serviceRoleKey) };
}

function providerConfig() {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  const zoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
  const cnameTarget = Deno.env.get("CLOUDFLARE_SAAS_CNAME_TARGET");
  if (!token || !zoneId || !cnameTarget) throw new Error("Cloudflare domain integration is not configured");
  return { token, zoneId, cnameTarget };
}

async function cloudflareRequest(path: string, init?: RequestInit): Promise<CloudflareHostname> {
  const { token } = providerConfig();
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as { success?: boolean; result?: CloudflareHostname; errors?: CloudflareHostname["errors"] };
  if (!response.ok || body.success === false) {
    const code = body.errors?.[0]?.code ? `CF_${body.errors[0].code}` : `HTTP_${response.status}`;
    const error = new Error(code);
    (error as Error & { providerCode?: string }).providerCode = code;
    throw error;
  }
  return body.result ?? {};
}

async function findDomain(db: SupabaseClient, input: Input): Promise<DomainRow> {
  if (!input.domain_id) throw new Error("domain_id is required");
  const { data, error } = await db.from("tenant_domains").select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,created_at").eq("id", input.domain_id).limit(1).maybeSingle();
  if (error || !data) throw new Error("Custom domain not found");
  return data as DomainRow;
}

async function assertTenantBranch(db: SupabaseClient, tenantId: string, branchId: string | undefined) {
  if (!tenantId) throw new Error("tenant_id is required");
  if (branchId) {
    const { data, error } = await db.from("branches").select("id").eq("id", branchId).eq("tenant_id", tenantId).limit(1).maybeSingle();
    if (error || !data) throw new Error("The selected branch does not belong to this tenant");
  }
}

async function refreshDomain(db: SupabaseClient, row: DomainRow, userId: string) {
  if (!row.cloudflare_hostname_id) throw new Error("This domain has not been provisioned with Cloudflare yet");
  const result = await cloudflareRequest(`/zones/${encodeURIComponent(providerConfig().zoneId)}/custom_hostnames/${encodeURIComponent(row.cloudflare_hostname_id)}`);
  const hostnameStatus = result.status ?? null;
  const sslStatus = result.ssl?.status ?? null;
  const active = row.is_enabled && hostnameStatus === "active" && sslStatus === "active";
  const checkedAt = new Date().toISOString();
  const records = validationRecords(result);
  const { data, error } = await db.from("tenant_domains").update({
    status: active ? "active" : (row.is_enabled ? "pending" : "disabled"),
    hostname_status: hostnameStatus,
    ssl_status: sslStatus,
    validation_records: records,
    cname_target: providerConfig().cnameTarget,
    verified_at: active ? checkedAt : null,
    provider_error_code: safeProviderError(result),
    last_checked_at: checkedAt,
    last_error: null,
    operation: "status",
    updated_by: userId,
  }).eq("id", row.id).select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,created_at").single();
  if (error || !data) throw new Error("Unable to save Cloudflare domain status");
  return data as DomainRow;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const input = await req.json() as Input;
    const action = input.action ?? "list";
    const { userId, db } = await requireSystemOwner(req);

    if (action === "list") {
      if (!input.tenant_id) throw new Error("tenant_id is required");
      const { data, error } = await db.from("tenant_domains").select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,created_at").eq("tenant_id", input.tenant_id).order("created_at", { ascending: false });
      if (error) throw new Error("Unable to load custom domains");
      return json({ domains: (data ?? []).map((row) => publicDomain(row as DomainRow)) });
    }

    if (action === "create") {
      if (!input.tenant_id) throw new Error("tenant_id is required");
      const hostname = normalizeHostname(input.hostname ?? "");
      await assertTenantBranch(db, input.tenant_id, input.default_branch_id);
      const { data: existing } = await db.from("tenant_domains").select("id,status").eq("normalized_hostname", hostname).limit(1).maybeSingle();
      if (existing) throw new Error("This hostname is already registered");
      const { cnameTarget, zoneId } = providerConfig();
      const payload: Record<string, unknown> = {
        hostname,
        ssl: { method: input.validation_method === "http" ? "http" : "txt", type: "dv", settings: { min_tls_version: "1.2" } },
      };
      const provider = await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/custom_hostnames`, { method: "POST", body: JSON.stringify(payload) });
      if (!provider.id) throw new Error("Cloudflare did not return a hostname id");
      const { data, error } = await db.from("tenant_domains").insert({
        tenant_id: input.tenant_id,
        hostname,
        normalized_hostname: hostname,
        default_branch_id: input.default_branch_id ?? null,
        status: provider.status === "active" && provider.ssl?.status === "active" ? "active" : "pending",
        validation_method: input.validation_method === "http" ? "http" : "txt",
        validation_records: validationRecords(provider),
        cname_target: cnameTarget,
        cloudflare_hostname_id: provider.id,
        hostname_status: provider.status ?? null,
        ssl_status: provider.ssl?.status ?? null,
        is_enabled: true,
        verified_at: provider.status === "active" && provider.ssl?.status === "active" ? new Date().toISOString() : null,
        provider_error_code: safeProviderError(provider),
        operation: "create",
        created_by: userId,
        updated_by: userId,
      }).select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,created_at").single();
      if (error || !data) {
        // Best effort cleanup avoids leaving an orphaned provider hostname after a DB failure.
        await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(provider.id)}`, { method: "DELETE" }).catch(() => undefined);
        throw new Error("Unable to save the custom domain");
      }
      return json({ domain: publicDomain(data as DomainRow) });
    }

    const row = await findDomain(db, input);
    if (action === "status") return json({ domain: publicDomain(await refreshDomain(db, row, userId)) });

    if (action === "disable") {
      const { data, error } = await db.from("tenant_domains").update({ is_enabled: false, status: "disabled", operation: "disable", updated_by: userId }).eq("id", row.id).select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,created_at").single();
      if (error || !data) throw new Error("Unable to disable this custom domain");
      return json({ domain: publicDomain(data as DomainRow) });
    }

    if (action === "remove") {
      const { zoneId } = providerConfig();
      if (row.cloudflare_hostname_id) await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(row.cloudflare_hostname_id)}`, { method: "DELETE" });
      const { error } = await db.from("tenant_domains").delete().eq("id", row.id);
      if (error) throw new Error("Unable to remove this custom domain from ZMedico");
      return json({ ok: true, domain_id: row.id });
    }

    throw new Error("Unsupported action");
  } catch (error) {
    const message = cleanError(error);
    const status = message === "Authentication required" || message.includes("access") || message.includes("require") ? 403 : 400;
    return json({ error: message }, status);
  }
});
