// Send a single reminder (or all due pending reminders) via the branch's
// configured WhatsApp / SMS / email / push provider.
//
// Body shapes:
//   { reminder_id: "<uuid>" }                 -> send a specific reminder
//   { branch_id?: "<uuid>", due_only?: true } -> send all pending reminders
//
// Provider config is read from public.notification_settings for the
// reminder's branch. Sending uses generic HTTP POST so most providers
// (Twilio-compatible, MessageBird, custom gateways, WhatsApp Cloud API)
// can be wired by setting the right URL + key.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, corsPreflight, jsonResponse } from "../_shared/cors.ts";

// Sprint 1 hardening: bulk-abuse protection. Cap the number of reminders
// processed per invocation (configurable via SEND_REMINDER_MAX_BATCH, default
// 200). Requests that would exceed the cap are rejected with 413 so callers
// must page explicitly rather than silently truncating.
const DEFAULT_MAX_BATCH = 200;
function maxBatchSize(): number {
  const raw = Deno.env.get("SEND_REMINDER_MAX_BATCH");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_BATCH;
}

// Per-admin rate-limit hook. Kept as a small in-memory token bucket so the
// function stays self-contained; swap for a durable store when scale demands.
// Cron and service-role calls bypass this by design.
const RL_WINDOW_MS = 60_000;
const RL_MAX = Number(Deno.env.get("SEND_REMINDER_RL_PER_MIN") ?? "10");
const rlBuckets = new Map<string, number[]>();
function rateLimit(actorId: string): boolean {
  if (!Number.isFinite(RL_MAX) || RL_MAX <= 0) return true;
  const now = Date.now();
  const hits = (rlBuckets.get(actorId) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (hits.length >= RL_MAX) return false;
  hits.push(now);
  rlBuckets.set(actorId, hits);
  return true;
}

type Reminder = {
  id: string;
  branch_id: string | null;
  patient_id: string | null;
  reminder_type: "sms" | "whatsapp" | "email" | "push";
  message_en: string;
  message_ar: string;
  scheduled_time: string;
  status: string;
};

type NotifySettings = {
  whatsapp_api_key: string | null;
  whatsapp_api_url: string | null;
  whatsapp_business_number: string | null;
  sms_api_key: string | null;
  sms_api_url: string | null;
  sms_sender_id: string | null;
  email_sender_address: string | null;
  email_sender_name: string | null;
  whatsapp_enabled?: boolean;
  sms_enabled?: boolean;
  whatsapp_provider?: "twilio" | "meta" | "custom" | null;
  sms_provider?: "twilio" | "messagebird" | "smsmisr" | "custom" | null;
  smsmisr_username?: string | null;
  smsmisr_password?: string | null;
  smsmisr_sender_token?: string | null;
  smsmisr_environment?: number | null;
  smsmisr_language?: number | null;
  meta_phone_number_id?: string | null;
  twilio_account_sid?: string | null;
  twilio_auth_token?: string | null;
  twilio_from_whatsapp?: string | null;
  twilio_from_sms?: string | null;
};

// SSRF guard: only allow https URLs to public hostnames.
// Blocks private/link-local/loopback ranges to prevent probing internal
// cloud metadata or internal services via admin-controlled provider URLs.
function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  // IPv6 loopback / link-local / unique-local
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  // IPv4 dotted quad
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. AWS IMDS
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

function validateProviderUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, error: "Invalid provider URL" }; }
  if (u.protocol !== "https:") return { ok: false, error: "Provider URL must use https" };
  if (!u.hostname || isPrivateHostname(u.hostname)) {
    return { ok: false, error: "Provider URL host is not allowed" };
  }
  return { ok: true, url: u };
}

function normalizeEgyptianMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

function sanitizeProviderError(text: string): string {
  // Limit exfiltration surface: truncate and strip control chars.
  const cleaned = text.replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  return cleaned.length > 200 ? cleaned.slice(0, 200) + "…" : cleaned;
}

async function sendOne(
  reminder: Reminder,
  patientPhone: string | null,
  patientEmail: string | null,
  cfg: NotifySettings | null,
): Promise<{ ok: boolean; error?: string }> {
  const message = reminder.message_en || reminder.message_ar;

  if (reminder.reminder_type === "whatsapp" || reminder.reminder_type === "sms") {
    if (!patientPhone) return { ok: false, error: "Patient has no phone" };
    const isWa = reminder.reminder_type === "whatsapp";
    if (isWa && cfg?.whatsapp_enabled === false) return { ok: false, error: "WhatsApp disabled" };
    if (!isWa && cfg?.sms_enabled === false) return { ok: false, error: "SMS disabled" };
    const provider = isWa ? cfg?.whatsapp_provider : cfg?.sms_provider;

    // Twilio (REST API) — works for both SMS and WhatsApp
    if (provider === "twilio") {
      const sid = cfg?.twilio_account_sid;
      const token = cfg?.twilio_auth_token;
      const from = isWa ? cfg?.twilio_from_whatsapp : cfg?.twilio_from_sms;
      if (!sid || !token || !from) return { ok: false, error: "Twilio not configured" };
      const to = isWa ? `whatsapp:${patientPhone}` : patientPhone;
      const fromAddr = isWa
        ? (from.startsWith("whatsapp:") ? from : `whatsapp:${from}`)
        : from;
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
          method: "POST",
          headers: {
            "Authorization": "Basic " + btoa(`${sid}:${token}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: fromAddr, Body: message }).toString(),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return { ok: false, error: `Twilio ${res.status}: ${sanitizeProviderError(body)}` };
        }
        return { ok: true };
      } catch {
        return { ok: false, error: "Twilio request failed" };
      }
    }

    // Meta WhatsApp Cloud API
    if (isWa && provider === "meta") {
      const phoneId = cfg?.meta_phone_number_id;
      const token = cfg?.whatsapp_api_key;
      if (!phoneId || !token) return { ok: false, error: "Meta WhatsApp not configured" };
      try {
        const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: patientPhone.replace(/^\+/, ""),
            type: "text",
            text: { body: message },
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return { ok: false, error: `Meta ${res.status}: ${sanitizeProviderError(body)}` };
        }
        return { ok: true };
      } catch {
        return { ok: false, error: "Meta request failed" };
      }
    }

    // SMS Misr Egypt gateway. It returns HTTP 200 for several application-level
    // errors, so code 1901 must be checked explicitly before marking sent.
    if (!isWa && provider === "smsmisr") {
      const username = cfg?.smsmisr_username;
      const password = cfg?.smsmisr_password;
      const sender = cfg?.smsmisr_sender_token || cfg?.sms_sender_id;
      const environment = cfg?.smsmisr_environment === 1 ? 1 : 2;
      const language = [1, 2, 3].includes(Number(cfg?.smsmisr_language))
        ? Number(cfg?.smsmisr_language)
        : 1;
      if (!username || !password || !sender) {
        return { ok: false, error: "SMS Misr not configured" };
      }
      const rawUrl = cfg?.sms_api_url || "https://smsmisr.com/api/SMS/";
      const v = validateProviderUrl(rawUrl);
      if (!v.ok) return { ok: false, error: "SMS Misr provider URL rejected" };
      const mobile = normalizeEgyptianMobile(patientPhone);
      if (!/^20(?:10|11|12|15)\d{8}$/.test(mobile)) {
        return { ok: false, error: "Invalid Egyptian mobile number" };
      }
      try {
        const res = await fetch(v.url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            environment: String(environment),
            username,
            password,
            sender,
            mobile,
            language: String(language),
            message,
          }).toString(),
        });
        const rawBody = await res.text().catch(() => "");
        if (!res.ok) {
          return { ok: false, error: `SMS Misr HTTP ${res.status}: ${sanitizeProviderError(rawBody)}` };
        }
        let parsed: any = null;
        try { parsed = JSON.parse(rawBody); } catch { /* provider may return plain text */ }
        const code = String(parsed?.code ?? "");
        if (code !== "1901") {
          return { ok: false, error: `SMS Misr ${code || "unknown response"}: ${sanitizeProviderError(rawBody)}` };
        }
        return { ok: true };
      } catch {
        return { ok: false, error: "SMS Misr request failed" };
      }
    }

    // Fallback: custom HTTP gateway (existing behavior)
    const url = isWa ? cfg?.whatsapp_api_url : cfg?.sms_api_url;
    const key = isWa ? cfg?.whatsapp_api_key : cfg?.sms_api_key;
    if (!url || !key) return { ok: false, error: `${isWa ? "WhatsApp" : "SMS"} provider not configured` };

    const v = validateProviderUrl(url);
    if (!v.ok) return { ok: false, error: `${isWa ? "WhatsApp" : "SMS"} provider URL rejected` };

    try {
      const res = await fetch(v.url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({
          to: patientPhone,
          from: isWa ? cfg?.whatsapp_business_number : cfg?.sms_sender_id,
          message,
          text: message,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `Provider error ${res.status}${body ? `: ${sanitizeProviderError(body)}` : ""}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "Provider request failed" };
    }
  }

  if (reminder.reminder_type === "email") {
    if (!patientEmail) return { ok: false, error: "Patient has no email" };
    // No email transport is wired in this Worker yet. Never report success
    // without an actual provider response; the UI should show the setup gap.
    return { ok: false, error: "Email delivery provider not configured" };
  }

  // push: in-app only, mark sent
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflight();
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Authenticate caller. Accept either a logged-in user JWT (from the app)
  // or a shared cron secret (for scheduled invocations).
  const authHeader = req.headers.get("Authorization") ?? "";
  const cronSecret = Deno.env.get("SEND_REMINDER_CRON_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isCron =
    (!!cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (!!serviceKey && authHeader === `Bearer ${serviceKey}`);

  let callerIsAdmin = false;
  let actorId: string | null = null;
  if (!isCron) {
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    // Check admin role for bulk operations
    const userId = claimsData.claims.sub as string;
    actorId = userId;
    const adminCheck = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await adminCheck
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    callerIsAdmin = !!roleRow;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { reminder_id?: string; branch_id?: string; due_only?: boolean } = {};
  try { body = await req.json(); } catch { /* allow empty body */ }

  // All sends (single or bulk) require admin role or cron secret.
  // Previously single-id sends were unrestricted, allowing any authenticated
  // user to enumerate reminders and trigger arbitrary patient messages.
  if (!isCron && !callerIsAdmin) {
    return jsonResponse({ error: "Forbidden: admin role required" }, 403);
  }

  // Enforce per-admin rate limit for non-cron callers.
  if (!isCron && actorId && !rateLimit(actorId)) {
    return jsonResponse(
      { error: "Too many reminder sends, please retry shortly" },
      429,
    );
  }

  const MAX_BATCH = maxBatchSize();
  // Build query
  let q = supabase
    .from("reminders")
    .select("id,branch_id,patient_id,reminder_type,message_en,message_ar,scheduled_time,status");

  if (body.reminder_id) {
    q = q.eq("id", body.reminder_id);
  } else {
    q = q.eq("status", "pending");
    if (body.branch_id) q = q.eq("branch_id", body.branch_id);
    if (body.due_only !== false) q = q.lte("scheduled_time", new Date().toISOString());
    // Fetch one extra so we can detect (and reject) oversized batches
    // instead of silently truncating.
    q = q.limit(MAX_BATCH + 1);
  }

  const { data: reminders, error: fetchErr } = await q;
  if (fetchErr) {
    return jsonResponse({ error: fetchErr.message }, 500);
  }

  const list = (reminders ?? []) as Reminder[];
  if (!body.reminder_id && list.length > MAX_BATCH) {
    return jsonResponse(
      {
        error: "Batch too large",
        max_batch: MAX_BATCH,
        hint: "Narrow the query with branch_id or process in smaller windows.",
      },
      413,
    );
  }
  let sent = 0;
  let failed = 0;
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  // Cache config & patient lookups
  const cfgCache = new Map<string, NotifySettings | null>();
  const patientCache = new Map<string, { phone: string | null; email: string | null }>();

  for (const r of list) {
    let cfg: NotifySettings | null = null;
    if (r.branch_id) {
      if (!cfgCache.has(r.branch_id)) {
        const { data } = await supabase
          .from("notification_settings")
          .select("whatsapp_api_key,whatsapp_api_url,whatsapp_business_number,sms_api_key,sms_api_url,sms_sender_id,email_sender_address,email_sender_name,whatsapp_enabled,sms_enabled,whatsapp_provider,sms_provider,meta_phone_number_id,twilio_account_sid,twilio_auth_token,twilio_from_whatsapp,twilio_from_sms,smsmisr_username,smsmisr_password,smsmisr_sender_token,smsmisr_environment,smsmisr_language")
          .eq("branch_id", r.branch_id)
          .maybeSingle();
        cfgCache.set(r.branch_id, (data as NotifySettings) ?? null);
      }
      cfg = cfgCache.get(r.branch_id) ?? null;
    }

    let phone: string | null = null;
    let email: string | null = null;
    if (r.patient_id) {
      if (!patientCache.has(r.patient_id)) {
        const { data } = await supabase
          .from("patients")
          .select("phone,email,deleted_at")
          .eq("id", r.patient_id)
          .is("deleted_at", null)
          .maybeSingle();
        patientCache.set(r.patient_id, {
          phone: (data as any)?.phone ?? null,
          email: (data as any)?.email ?? null,
        });
      }
      const p = patientCache.get(r.patient_id)!;
      phone = p.phone;
      email = p.email;
    }

    const res = await sendOne(r, phone, email, cfg);
    results.push({ id: r.id, ok: res.ok, error: res.error });

    if (res.ok) {
      sent++;
      await supabase
        .from("reminders")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
          destination_phone: phone,
        })
        .eq("id", r.id);
    } else {
      failed++;
      await supabase
        .from("reminders")
        .update({
          status: "failed",
          error_message: res.error ?? "unknown",
          destination_phone: phone,
        })
        .eq("id", r.id);
    }
  }

  return jsonResponse({ processed: list.length, sent, failed, results });
});