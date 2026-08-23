import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_ORIGIN = "https://zmedico2.belalaamer.workers.dev";
const PROVIDER_SUBDOMAIN_SUFFIX = (Deno.env.get("CUSTOM_DOMAIN_SUBDOMAIN_SUFFIX") ?? "belalaamer.com").trim().toLowerCase();
const MAX_BODY_BYTES = 32 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Math.max(1, Number(Deno.env.get("CUSTOM_DOMAIN_RL_PER_MIN") ?? "20"));
const rateBuckets = new Map<string, number[]>();

function allowedOrigins(): Set<string> {
  return new Set(
    `${DEFAULT_ORIGIN},${Deno.env.get("CUSTOM_DOMAIN_ALLOWED_ORIGINS") ?? ""}`
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function corsHeaders(req?: Request) {
  const origin = req?.headers.get("Origin") ?? DEFAULT_ORIGIN;
  const allowOrigin = allowedOrigins().has(origin) ? origin : DEFAULT_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function assertAllowedOrigin(req: Request) {
  const origin = req.headers.get("Origin");
  if (origin && !allowedOrigins().has(origin)) throw new Error("Origin is not allowed");
}

function isRateLimited(actorId: string, action: string): boolean {
  const key = `${actorId}:${action}`;
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return false;
}

type Action = "list" | "create" | "create_subdomain" | "status" | "disable" | "remove";
type Input = {
  action?: Action;
  tenant_id?: string;
  default_branch_id?: string;
  domain_id?: string;
  hostname?: string;
  subdomain_slug?: string;
  validation_method?: "txt" | "http" | "email" | "prevalidation";
  idempotency_key?: string;
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
  provisioning_mode: string;
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

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
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

function normalizeSubdomainSlug(value: string): string {
  const candidate = value.trim().toLowerCase();
  if (!candidate || candidate.length > 63 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(candidate)) {
    throw new Error("Enter a valid subdomain slug, for example blitz-physio");
  }
  if (!PROVIDER_SUBDOMAIN_SUFFIX || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(PROVIDER_SUBDOMAIN_SUFFIX)) {
    throw new Error("Provider subdomain configuration is invalid");
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
    provisioning_mode: row.provisioning_mode,
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
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
  const { data, error } = await db.from("tenant_domains").select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").eq("id", input.domain_id).limit(1).maybeSingle();
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

async function writeAudit(db: SupabaseClient, action: string, row: Partial<DomainRow>, userId: string, oldValues: Record<string, unknown> | null, newValues: Record<string, unknown> | null) {
  if (!row.id) return;
  await db.rpc("_audit_write", {
    p_entity_type: "tenant_domain",
    p_entity_id: row.id,
    p_action: action,
    p_old: oldValues,
    p_new: newValues,
    p_branch_id: row.default_branch_id ?? null,
    p_fallback: userId,
  }).then(({ error }) => {
    if (error) console.warn("[custom-domain] audit write failed", error.code ?? "unknown");
  });
}

async function refreshDomain(db: SupabaseClient, row: DomainRow, userId: string) {
  if (row.provisioning_mode === "provider_subdomain") {
    let reachable = false;
    if (row.is_enabled) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const response = await fetch(`https://${row.hostname}/_zmedico/provisioning-check`, {
          method: "GET",
          redirect: "manual",
          headers: { Accept: "text/plain" },
          signal: controller.signal,
        });
        reachable = response.status === 204;
      } catch {
        reachable = false;
      } finally {
        clearTimeout(timeout);
      }
    }
    const checkedAt = new Date().toISOString();
    const active = row.is_enabled && reachable;
    const { data, error } = await db.from("tenant_domains").update({
      status: active ? "active" : (row.is_enabled ? "pending" : "disabled"),
      hostname_status: active ? "active" : "pending",
      ssl_status: active ? "active" : "pending",
      verified_at: active ? (row.verified_at ?? checkedAt) : null,
      last_checked_at: checkedAt,
      last_error: active ? null : (row.is_enabled ? "Provider subdomain is not reachable over HTTPS yet" : null),
      operation: "status",
      updated_by: userId,
    }).eq("id", row.id).select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").single();
    if (error || !data) throw new Error("Unable to save subdomain status");
    const updated = data as DomainRow;
    await writeAudit(db, "provider_subdomain_status", updated, userId, { status: row.status }, { status: updated.status, hostname_status: updated.hostname_status, ssl_status: updated.ssl_status });
    return updated;
  }
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
  }).eq("id", row.id).select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").single();
  if (error || !data) throw new Error("Unable to save Cloudflare domain status");
  const updated = data as DomainRow;
  await writeAudit(db, "custom_domain_status", updated, userId, { status: row.status, hostname_status: row.hostname_status, ssl_status: row.ssl_status }, { status: updated.status, hostname_status: updated.hostname_status, ssl_status: updated.ssl_status });
  return updated;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);
  try {
    assertAllowedOrigin(req);
    const contentLength = Number(req.headers.get("Content-Length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) throw new Error("Request body is too large");
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) throw new Error("Request body is too large");
    const input = JSON.parse(rawBody) as Input;
    const action = input.action ?? "list";
    const { userId, db } = await requireSystemOwner(req);
    const durableLimit = action === "create" || action === "create_subdomain" ? 5 : 20;
    const { data: durableAllowed, error: durableRateError } = await db.rpc("consume_custom_domain_rate_limit", { _actor_id: userId, _action: action, _limit: durableLimit });
    if (durableRateError) console.warn("[custom-domain] durable rate limit unavailable", durableRateError.code ?? "unknown");
    if (durableAllowed === false || isRateLimited(userId, action)) return json({ error: "Too many domain requests; try again later" }, 429, req);

    if (action === "list") {
      if (!input.tenant_id) throw new Error("tenant_id is required");
      const { data, error } = await db.from("tenant_domains").select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").eq("tenant_id", input.tenant_id).order("created_at", { ascending: false });
      if (error) throw new Error("Unable to load custom domains");
      return json({ domains: (data ?? []).map((row) => publicDomain(row as DomainRow)) }, 200, req);
    }

    if (action === "create_subdomain") {
      if (!input.tenant_id) throw new Error("tenant_id is required");
      const slug = normalizeSubdomainSlug(input.subdomain_slug ?? input.hostname ?? "");
      const hostname = `${slug}.${PROVIDER_SUBDOMAIN_SUFFIX}`;
      const idempotencyKey = (input.idempotency_key ?? req.headers.get("X-Idempotency-Key") ?? "").trim();
      if (idempotencyKey && (idempotencyKey.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(idempotencyKey))) throw new Error("Invalid idempotency key");
      await assertTenantBranch(db, input.tenant_id, input.default_branch_id);
      if (idempotencyKey) {
        const { data: replay } = await db.from("tenant_domains").select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").eq("tenant_id", input.tenant_id).eq("idempotency_key", idempotencyKey).limit(1).maybeSingle();
        if (replay) {
          if (replay.normalized_hostname !== hostname) throw new Error("Idempotency key was already used for another hostname");
          return json({ domain: publicDomain(replay as DomainRow), replayed: true }, 200, req);
        }
      }
      const { data: existing } = await db.from("tenant_domains").select("id,status").eq("normalized_hostname", hostname).limit(1).maybeSingle();
      if (existing) throw new Error("This subdomain is already registered");
      const now = new Date().toISOString();
      const { data, error } = await db.from("tenant_domains").insert({
        tenant_id: input.tenant_id,
        hostname,
        normalized_hostname: hostname,
        default_branch_id: input.default_branch_id ?? null,
        status: "pending",
        validation_method: "prevalidation",
        validation_records: [],
        cname_target: null,
        cloudflare_hostname_id: null,
        hostname_status: "pending",
        ssl_status: "pending",
        is_enabled: true,
        verified_at: null,
        provider_error_code: null,
        provisioning_mode: "provider_subdomain",
        operation: "create_subdomain",
        created_by: userId,
        updated_by: userId,
        idempotency_key: idempotencyKey || null,
        request_fingerprint: hostname,
      }).select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").single();
      if (error || !data) {
        if (error?.code === "23505" && idempotencyKey) {
          const { data: replay } = await db.from("tenant_domains").select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").eq("tenant_id", input.tenant_id).eq("idempotency_key", idempotencyKey).limit(1).maybeSingle();
          if (replay) return json({ domain: publicDomain(replay as DomainRow), replayed: true }, 200, req);
        }
        throw new Error("Unable to save the provider subdomain");
      }
      await writeAudit(db, "provider_subdomain_created", data as DomainRow, userId, null, { hostname, status: "pending" });
      return json({ domain: publicDomain(data as DomainRow), subdomain_suffix: PROVIDER_SUBDOMAIN_SUFFIX }, 200, req);
    }

    if (action === "create") {
      if (!input.tenant_id) throw new Error("tenant_id is required");
      const hostname = normalizeHostname(input.hostname ?? "");
      const idempotencyKey = (input.idempotency_key ?? req.headers.get("X-Idempotency-Key") ?? "").trim();
      if (idempotencyKey && (idempotencyKey.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(idempotencyKey))) throw new Error("Invalid idempotency key");
      await assertTenantBranch(db, input.tenant_id, input.default_branch_id);
      if (idempotencyKey) {
        const { data: replay } = await db.from("tenant_domains").select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").eq("tenant_id", input.tenant_id).eq("idempotency_key", idempotencyKey).limit(1).maybeSingle();
        if (replay) {
          if (replay.normalized_hostname !== hostname) throw new Error("Idempotency key was already used for another hostname");
          return json({ domain: publicDomain(replay as DomainRow), replayed: true }, 200, req);
        }
      }
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
        idempotency_key: idempotencyKey || null,
        request_fingerprint: hostname,
      }).select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").single();
      if (error || !data) {
        if (error?.code === "23505" && idempotencyKey) {
          const { data: replay } = await db.from("tenant_domains").select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").eq("tenant_id", input.tenant_id).eq("idempotency_key", idempotencyKey).limit(1).maybeSingle();
          if (replay) {
            await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(provider.id)}`, { method: "DELETE" }).catch(() => undefined);
            return json({ domain: publicDomain(replay as DomainRow), replayed: true }, 200, req);
          }
        }
        // Best effort cleanup avoids leaving an orphaned provider hostname after a DB failure.
        await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(provider.id)}`, { method: "DELETE" }).catch(() => undefined);
        throw new Error("Unable to save the custom domain");
      }
      await writeAudit(db, "custom_domain_created", data as DomainRow, userId, null, { hostname, status: (data as DomainRow).status });
      return json({ domain: publicDomain(data as DomainRow) }, 200, req);
    }

    const row = await findDomain(db, input);
    if (action === "status") return json({ domain: publicDomain(await refreshDomain(db, row, userId)) }, 200, req);

    if (action === "disable") {
      const { data, error } = await db.from("tenant_domains").update({ is_enabled: false, status: "disabled", operation: "disable", updated_by: userId }).eq("id", row.id).select("id,tenant_id,hostname,normalized_hostname,default_branch_id,status,validation_method,validation_records,cname_target,cloudflare_hostname_id,hostname_status,ssl_status,is_enabled,verified_at,provider_error_code,last_checked_at,last_error,provisioning_mode,created_at").single();
      if (error || !data) throw new Error("Unable to disable this custom domain");
      await writeAudit(db, "custom_domain_disabled", data as DomainRow, userId, { status: row.status, is_enabled: row.is_enabled }, { status: "disabled", is_enabled: false });
      return json({ domain: publicDomain(data as DomainRow) }, 200, req);
    }

    if (action === "remove") {
      if (row.provisioning_mode === "custom_hostname" && row.cloudflare_hostname_id) {
        const { zoneId } = providerConfig();
        await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(row.cloudflare_hostname_id)}`, { method: "DELETE" });
      }
      const { error } = await db.from("tenant_domains").delete().eq("id", row.id);
      if (error) throw new Error("Unable to remove this custom domain from ZMedico");
      await writeAudit(db, "custom_domain_removed", row, userId, { hostname: row.hostname, status: row.status }, null);
      return json({ ok: true, domain_id: row.id }, 200, req);
    }

    throw new Error("Unsupported action");
  } catch (error) {
    const message = cleanError(error);
    const status = message === "Authentication required" || message.includes("access") || message.includes("require") ? 403 : 400;
    return json({ error: message }, status, req);
  }
});
