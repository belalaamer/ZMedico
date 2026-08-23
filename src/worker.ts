export interface Env {
  ASSETS: Fetcher;
}

const DOMAIN_FUNCTION_URL = "https://rqcmnfzfytyyicelvifk.supabase.co/functions/v1/manage-custom-domain";
const SUPABASE_REST_URL = "https://rqcmnfzfytyyicelvifk.supabase.co/rest/v1/rpc/resolve_active_tenant_domain";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Vu3oi0N4hmxPzTsScwrwFA_Wt3-CUyU";
const PROVIDER_SUBDOMAIN_SUFFIX = "belalaamer.com";
const DOMAIN_GATEWAY_PATH = "/api/domains";
const PROVIDER_SUBDOMAIN_HEALTH_PATH = "/_zmedico/provisioning-check";
const MAX_GATEWAY_BODY_BYTES = 32 * 1024;
const DEFAULT_ORIGIN = "https://zmedico2.belalaamer.workers.dev";

function gatewayHeaders(request: Request): Headers {
  const origin = request.headers.get("Origin");
  const headers = new Headers({
    "Access-Control-Allow-Origin": origin === DEFAULT_ORIGIN ? origin : DEFAULT_ORIGIN,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  return headers;
}

function isProviderSubdomainHost(hostname: string): boolean {
  const suffix = `.${PROVIDER_SUBDOMAIN_SUFFIX}`;
  if (!hostname.endsWith(suffix)) return false;
  const slug = hostname.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug);
}

async function hasActiveTenantDomain(hostname: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(SUPABASE_REST_URL, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ _hostname: hostname }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const payload = await response.json() as unknown;
    return Array.isArray(payload) && payload.length > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function proxyDomainRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: gatewayHeaders(request) });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...Object.fromEntries(gatewayHeaders(request)), "Content-Type": "application/json" } });

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_GATEWAY_BODY_BYTES) return new Response(JSON.stringify({ error: "Request body is too large" }), { status: 413, headers: { ...Object.fromEntries(gatewayHeaders(request)), "Content-Type": "application/json" } });

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_GATEWAY_BODY_BYTES) return new Response(JSON.stringify({ error: "Request body is too large" }), { status: 413, headers: { ...Object.fromEntries(gatewayHeaders(request)), "Content-Type": "application/json" } });

  const forwardedHeaders = new Headers({
    Authorization: request.headers.get("Authorization") ?? "",
    apikey: request.headers.get("apikey") ?? "",
    "Content-Type": "application/json",
  });
  for (const name of ["x-client-info", "x-idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) forwardedHeaders.set(name, value);
  }

  const upstream = await fetch(DOMAIN_FUNCTION_URL, { method: "POST", headers: forwardedHeaders, body });
  const responseHeaders = gatewayHeaders(request);
  responseHeaders.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === DOMAIN_GATEWAY_PATH) return proxyDomainRequest(request);

    const pathname = url.pathname;
    const hostname = url.hostname.toLowerCase();
    if (request.method === "GET" && pathname === PROVIDER_SUBDOMAIN_HEALTH_PATH && isProviderSubdomainHost(hostname)) {
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const isHtmlRequest = request.method === "GET" && (pathname === "/" || pathname === "/index.html" || !pathname.includes("."));
    if (isHtmlRequest && isProviderSubdomainHost(hostname)) {
      const active = await hasActiveTenantDomain(hostname);
      if (!active) return new Response("Tenant subdomain is not active", { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (isHtmlRequest) {
      url.searchParams.set("__zmedico_build", "deb1ea4");
    }
    const assetRequest = isHtmlRequest ? new Request(url, request) : request;
    const response = await env.ASSETS.fetch(assetRequest);
    const contentType = response.headers.get("content-type");

    if (isHtmlRequest || (/\.(?:m?js)$/.test(pathname) && !contentType)) {
      const headers = new Headers(response.headers);
      if (isHtmlRequest) {
        headers.set("cache-control", "no-store, max-age=0");
      } else {
        headers.set("content-type", "text/javascript; charset=UTF-8");
      }
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    return response;
  },
};
