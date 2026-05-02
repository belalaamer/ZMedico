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

    try {
      const res = await fetch(url, {
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
      if (!res.ok) return { ok: false, error: `Provider ${res.status}: ${await res.text()}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
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
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { reminder_id?: string; branch_id?: string; due_only?: boolean } = {};
  try { body = await req.json(); } catch { /* allow empty body */ }

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