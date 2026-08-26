import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function corsPreflight() { return new Response("ok", { headers: corsHeaders }); }

const allowedRoles = new Set(["system_owner", "admin", "manager", "receptionist", "doctor", "nurse"]);
const WORKER_ORIGIN = Deno.env.get("PATIENT_PORTAL_WORKER_ORIGIN") ?? "https://zmedico2.belalaamer.workers.dev";
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") ?? "v23.0";

function normalizeWhatsAppRecipient(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `20${digits.slice(1)}`;
  return digits;
}
function safeProviderError(raw: string): string {
  return raw.replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, 200);
}
function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key: string) => values[key] ?? "");
}

async function sendEmail(params: { token: string; patientId: string; username: string; temporaryPassword: string; language: "ar" | "en" }) {
  const { token, patientId, username, temporaryPassword, language } = params;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: context, error: contextError } = await caller.rpc("patient_portal_send_context", { p_patient_id: patientId });
  if (contextError || !context?.allowed || !context.email) return jsonResponse({ error: "Forbidden" }, 403);

  const { data: templates, error: templateError } = await service
    .from("email_templates")
    .select("subject_en,subject_ar,body_en,body_ar")
    .eq("template_key", "patient_portal_credentials")
    .eq("is_active", true)
    .limit(1);
  if (templateError || !templates?.[0]) return jsonResponse({ error: "Patient portal email template is not configured" }, 503);

  const values = {
    patient_name: String(context.patient_name ?? "Patient"),
    patient_name_ar: String(context.patient_name_ar ?? context.patient_name ?? "المريض"),
    patient_portal_username: username,
    patient_portal_password: temporaryPassword,
    patient_portal_url: `${WORKER_ORIGIN}/patient-portal/login`,
    support_contact: [context.support_email, context.support_phone].filter(Boolean).join(" / ") || (language === "ar" ? "تواصل مع العيادة" : "Contact the clinic"),
  };
  const template = templates[0] as { subject_en?: string; subject_ar?: string; body_en?: string; body_ar?: string };
  const subject = renderTemplate(language === "ar" ? template.subject_ar ?? "بيانات دخول بوابة المريض" : template.subject_en ?? "Patient Portal access", values);
  const text = renderTemplate(language === "ar" ? template.body_ar ?? "" : template.body_en ?? "", values);

  const workerResponse = await fetch(`${WORKER_ORIGIN}/api/patient-portal-email`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ patient_id: patientId, username, temporary_password: temporaryPassword, language }),
  });
  const workerBody = await workerResponse.json().catch(() => ({})) as { error?: string; accepted?: boolean; provider_message_id?: string };
  if (!workerResponse.ok || !workerBody.accepted) return jsonResponse({ error: workerBody.error ?? "Email provider rejected the message" }, workerResponse.status >= 500 ? 502 : workerResponse.status);

  const { error: eventError } = await service.from("patient_portal_delivery_events").insert({ patient_id: patientId, branch_id: context.branch_id, channel: "email", provider_message_id: workerBody.provider_message_id ?? null, status: "accepted" });
  if (eventError) return jsonResponse({ error: "Email accepted but delivery status could not be recorded" }, 500);
  // Keep subject/text in memory only; they are deliberately not persisted or logged.
  void subject; void text;
  return jsonResponse({ success: true, channel: "email", accepted: true });
}

async function sendWhatsApp(params: { token: string; patientId: string; username: string; temporaryPassword: string; language: "ar" | "en"; templateName: string; templateLanguage: string }) {
  const { token, patientId, username, temporaryPassword, language, templateName, templateLanguage } = params;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: context, error: contextError } = await caller.rpc("patient_portal_send_context", { p_patient_id: patientId });
  if (contextError || !context?.allowed || !context.phone || context.whatsapp_opt_in !== true) return jsonResponse({ error: "WhatsApp opt-in and a patient phone number are required" }, 400);

  const { data: branchSettings } = await service
    .from("notification_settings")
    .select("whatsapp_enabled,whatsapp_provider,whatsapp_api_key,meta_phone_number_id")
    .eq("branch_id", context.branch_id)
    .maybeSingle();
  const phoneNumberId = branchSettings?.meta_phone_number_id ?? Deno.env.get("META_PHONE_NUMBER_ID");
  const accessToken = branchSettings?.whatsapp_api_key ?? Deno.env.get("META_ACCESS_TOKEN");
  if (branchSettings?.whatsapp_enabled === false) return jsonResponse({ error: "WhatsApp delivery is disabled for this branch" }, 400);
  if (branchSettings?.whatsapp_provider && branchSettings.whatsapp_provider !== "meta" && !Deno.env.get("META_ACCESS_TOKEN")) return jsonResponse({ error: "Branch WhatsApp provider is not Meta" }, 400);
  if (!phoneNumberId || !accessToken) return jsonResponse({ error: "Meta WhatsApp is not configured" }, 503);
  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) return jsonResponse({ error: "Invalid Meta template name" }, 400);
  if (!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(templateLanguage)) return jsonResponse({ error: "Invalid Meta template language" }, 400);

  const recipient = normalizeWhatsAppRecipient(String(context.phone));
  if (!recipient) return jsonResponse({ error: "Invalid WhatsApp recipient" }, 400);
  const templateParams = [
    String(context.patient_name_ar ?? context.patient_name ?? "المريض"),
    username,
    temporaryPassword,
    `${WORKER_ORIGIN}/patient-portal/login`,
    [context.support_email, context.support_phone].filter(Boolean).join(" / ") || "تواصل مع العيادة",
  ].map((text) => ({ type: "text", text }));

  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template: { name: templateName, language: { code: templateLanguage }, components: [{ type: "body", parameters: templateParams }] },
    }),
  });
  const raw = await response.text().catch(() => "");
  let parsed: { messages?: Array<{ id?: string }>; error?: { message?: string } } = {};
  try { parsed = JSON.parse(raw); } catch { /* handled by generic error */ }
  const providerMessageId = parsed.messages?.[0]?.id ?? null;
  if (!response.ok || !providerMessageId) {
    const message = safeProviderError(parsed.error?.message ?? raw) || "Meta rejected the message";
    await service.from("patient_portal_delivery_events").insert({ patient_id: patientId, branch_id: context.branch_id, channel: "whatsapp", status: "failed", error_message: message });
    return jsonResponse({ error: message }, response.status >= 500 ? 502 : response.status);
  }
  await service.from("patient_portal_delivery_events").insert({ patient_id: patientId, branch_id: context.branch_id, channel: "whatsapp", provider_message_id: providerMessageId, status: "accepted" });
  return jsonResponse({ success: true, channel: "whatsapp", accepted: true, provider_message_id: providerMessageId });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return jsonResponse({ error: "Server configuration error" }, 500);
  const token = authorization.slice("Bearer ".length).trim();
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);

  const service = createClient(supabaseUrl, serviceKey);
  const { data: roles } = await service.from("user_roles").select("role").eq("user_id", userData.user.id);
  const callerRoles = new Set((roles ?? []).map((r: { role: string }) => r.role));
  if (!Array.from(callerRoles).some((role) => allowedRoles.has(role))) return jsonResponse({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const patientId = typeof body.patient_id === "string" ? body.patient_id : "";
  const username = typeof body.username === "string" ? body.username : "";
  const temporaryPassword = typeof body.temporary_password === "string" ? body.temporary_password : "";
  const channel = body.channel === "whatsapp" ? "whatsapp" : body.channel === "email" ? "email" : "";
  const language = body.language === "en" ? "en" : "ar";
  if (!/^[0-9a-f-]{36}$/i.test(patientId) || !username || temporaryPassword.length < 8 || temporaryPassword.length > 256 || !channel) return jsonResponse({ error: "Invalid portal message request" }, 400);

  if (channel === "email") return sendEmail({ token, patientId, username, temporaryPassword, language });
  const templateName = typeof body.template_name === "string" ? body.template_name.trim() : "";
  const templateLanguage = typeof body.template_language === "string" ? body.template_language.trim() : language === "ar" ? "ar" : "en_US";
  if (!templateName) return jsonResponse({ error: "Approved Meta template name is required" }, 400);
  return sendWhatsApp({ token, patientId, username, temporaryPassword, language, templateName, templateLanguage });
});
