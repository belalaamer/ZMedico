export interface Env {
  ASSETS: Fetcher;
  EMAIL: SendEmail;
  EMAIL_FROM: string;
}

const DOMAIN_FUNCTION_URL = "https://rqcmnfzfytyyicelvifk.supabase.co/functions/v1/manage-custom-domain";
const SUPABASE_REST_URL = "https://rqcmnfzfytyyicelvifk.supabase.co/rest/v1/rpc/resolve_active_tenant_domain";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Vu3oi0N4hmxPzTsScwrwFA_Wt3-CUyU";
const PROVIDER_SUBDOMAIN_SUFFIX = "belalaamer.com";
const DOMAIN_GATEWAY_PATH = "/api/domains";
const PATIENT_PORTAL_EMAIL_PATH = "/api/patient-portal-email";
const SUPABASE_AUTH_USER_URL = "https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1/user";
const SUPABASE_PATIENT_CONTEXT_URL = "https://rqcmnfzfytyyicelvifk.supabase.co/rest/v1/rpc/patient_portal_send_context";
const SUPABASE_EMAIL_TEMPLATE_URL = "https://rqcmnfzfytyyicelvifk.supabase.co/rest/v1/email_templates";
const PROVIDER_SUBDOMAIN_HEALTH_PATH = "/_zmedico/provisioning-check";
const MAX_GATEWAY_BODY_BYTES = 32 * 1024;
const DEFAULT_ORIGIN = "https://zmedico2.belalaamer.workers.dev";

type PortalEmailInput = {
  patient_id?: unknown;
  temporary_password?: unknown;
  username?: unknown;
  language?: unknown;
};

type PortalSendContext = {
  allowed?: boolean;
  email?: string | null;
  patient_name?: string | null;
  patient_name_ar?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
};

type PortalEmailTemplate = {
  subject_en?: string | null;
  subject_ar?: string | null;
  body_en?: string | null;
  body_ar?: string | null;
};

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

function jsonResponse(body: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...Object.fromEntries(gatewayHeaders(request)), "Content-Type": "application/json" } });
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key: string) => values[key] ?? "");
}

async function fetchJson<T>(url: string, token: string, init?: RequestInit): Promise<{ response: Response; data: T | null }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => null) as T | null;
  return { response, data };
}

async function sendPatientPortalEmail(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: gatewayHeaders(request) });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, request);
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401, request);
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401, request);

  let body: PortalEmailInput;
  try { body = await request.json() as PortalEmailInput; } catch { return jsonResponse({ error: "Invalid JSON" }, 400, request); }
  const patientId = typeof body.patient_id === "string" ? body.patient_id : "";
  const temporaryPassword = typeof body.temporary_password === "string" ? body.temporary_password : "";
  const username = typeof body.username === "string" ? body.username : "";
  const language = body.language === "en" ? "en" : "ar";
  if (!/^[0-9a-f-]{36}$/i.test(patientId) || !username || temporaryPassword.length < 8 || temporaryPassword.length > 256) {
    return jsonResponse({ error: "Invalid portal email request" }, 400, request);
  }

  const userResult = await fetchJson<{ id?: string }>(SUPABASE_AUTH_USER_URL, token);
  if (!userResult.response.ok || !userResult.data?.id) return jsonResponse({ error: "Unauthorized" }, 401, request);
  const contextResult = await fetchJson<PortalSendContext>(SUPABASE_PATIENT_CONTEXT_URL, token, { method: "POST", body: JSON.stringify({ p_patient_id: patientId }) });
  if (!contextResult.response.ok || !contextResult.data?.allowed || !contextResult.data.email) return jsonResponse({ error: "Forbidden" }, 403, request);

  const templateUrl = `${SUPABASE_EMAIL_TEMPLATE_URL}?template_key=eq.patient_portal_credentials&is_active=eq.true&select=subject_en,subject_ar,body_en,body_ar&limit=1`;
  const templateResult = await fetchJson<PortalEmailTemplate[]>(templateUrl, token);
  const template = templateResult.data?.[0];
  if (!template) return jsonResponse({ error: "Patient portal email template is not configured" }, 503, request);

  const origin = new URL(request.url).origin;
  const supportContact = [contextResult.data.support_email, contextResult.data.support_phone].filter(Boolean).join(" / ") || (language === "ar" ? "تواصل مع العيادة" : "Contact the clinic");
  const values = {
    patient_name: contextResult.data.patient_name ?? "Patient",
    patient_name_ar: contextResult.data.patient_name_ar ?? contextResult.data.patient_name ?? "المريض",
    patient_portal_username: username,
    patient_portal_password: temporaryPassword,
    patient_portal_url: `${origin}/patient-portal/login`,
    support_contact: supportContact,
  };
  const subject = renderTemplate((language === "ar" ? template.subject_ar : template.subject_en) ?? "Patient Portal access", values);
  const text = renderTemplate((language === "ar" ? template.body_ar : template.body_en) ?? "", values);
  const html = `<div dir="${language === "ar" ? "rtl" : "ltr"}" style="font-family:Arial,sans-serif;white-space:pre-line">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;

  try {
    await env.EMAIL.send({ to: contextResult.data.email, from: env.EMAIL_FROM, subject, text, html });
    return jsonResponse({ success: true, accepted: true }, 200, request);
  } catch {
    return jsonResponse({ error: "Email provider rejected the message" }, 502, request);
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
    if (url.pathname === PATIENT_PORTAL_EMAIL_PATH) return sendPatientPortalEmail(request, env);

    const pathname = url.pathname;
    const hostname = url.hostname.toLowerCase();
    if (request.method === "GET" && pathname === PROVIDER_SUBDOMAIN_HEALTH_PATH && isProviderSubdomainHost(hostname)) {
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const isHtmlRequest = request.method === "GET" && (pathname === "/" || pathname === "/index.html" || !pathname.includes("."));
    const providerSubdomain = isProviderSubdomainHost(hostname);
    if (isHtmlRequest && providerSubdomain) {
      const active = await hasActiveTenantDomain(hostname);
      if (!active) return new Response("Tenant subdomain is not active", { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      // A tenant-owned hostname is an application portal, not the public
      // marketing site. Redirect the browser so React Router also sees /auth.
      if (pathname === "/" || pathname === "/index.html") {
        const loginUrl = new URL(request.url);
        loginUrl.pathname = "/auth";
        loginUrl.search = "";
        return Response.redirect(loginUrl.toString(), 302);
      }
    }
    if (isHtmlRequest) {
      url.searchParams.set("__zmedico_build", "whitelabel-20260825");
    }
    const assetRequest = isHtmlRequest ? new Request(url, request) : request;
    const response = await env.ASSETS.fetch(assetRequest);
    const contentType = response.headers.get("content-type") ?? "";
    const isJavaScriptRequest = /\.(?:m?js)$/.test(pathname);

    // Never serve the SPA shell for a missing JavaScript module. A stale HTML
    // document must fail with a clear 404 instead of trying to evaluate
    // index.html as JavaScript and producing a misleading dynamic-import error.
    if (isJavaScriptRequest && (response.status === 404 || contentType.includes("text/html"))) {
      return new Response("JavaScript asset not found", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=UTF-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (isHtmlRequest || (isJavaScriptRequest && !contentType)) {
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
