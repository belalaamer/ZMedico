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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    // Email sending is delegated to the platform email infra; for now we
    // mark sent but do not actually deliver.
    return { ok: true };
  }

  // push: in-app only, mark sent
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Authenticate caller. Accept either a logged-in user JWT (from the app)
  // or a shared cron secret (for scheduled invocations).
  const authHeader = req.headers.get("Authorization") ?? "";
  const cronSecret = Deno.env.get("SEND_REMINDER_CRON_SECRET");
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let callerIsAdmin = false;
  if (!isCron) {
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Check admin role for bulk operations
    const userId = claimsData.claims.sub as string;
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
    return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
  }

  const { data: reminders, error: fetchErr } = await q;
  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const list = (reminders ?? []) as Reminder[];
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
          .select("whatsapp_api_key,whatsapp_api_url,whatsapp_business_number,sms_api_key,sms_api_url,sms_sender_id,email_sender_address,email_sender_name")
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
          .select("phone,email")
          .eq("id", r.patient_id)
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
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", r.id);
    } else {
      failed++;
      await supabase
        .from("reminders")
        .update({ status: "failed", error_message: res.error ?? "unknown" })
        .eq("id", r.id);
    }
  }

  return new Response(
    JSON.stringify({ processed: list.length, sent, failed, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});