export interface Env {
  ASSETS: Fetcher;
}

const DOMAIN_FUNCTION_URL = "https://rqcmnfzfytyyicelvifk.supabase.co/functions/v1/manage-custom-domain";
const DOMAIN_GATEWAY_PATH = "/api/domains";
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
    const isHtmlRequest = request.method === "GET" && (pathname === "/" || !pathname.includes("."));
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
