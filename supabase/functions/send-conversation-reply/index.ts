// Staff reply to a patient conversation.
//
// Why this function exists. `whatsapp-webhook` only ever *receives*, and
// `ai-agent-respond` is the only thing in the product that sends an outbound
// WhatsApp text -- it does so as the assistant. A human who has taken a
// conversation over therefore had no way to answer: the AI stays silent by design
// (`ai-agent-respond` bails unless status = 'ai_active'), so the patient waited
// forever. `send-reminder` is not a substitute: it resolves its recipient through
// `reminders.patient_id`, and `conversations.patient_id` is never populated by the
// webhook -- every inbound thread is a bare phone number, which is exactly the
// case that needs a human.
//
// Contract: the screen inserts the outbound `messages` row first (so the thread
// shows what was written even if delivery fails), then calls this function with
// that message's id. This function decides whether the send is allowed *now*,
// sends, and writes the outcome back onto the row. Same shape as
// `send-reminder`'s `{ reminder_id }`.
//
// Two refusals matter and are not defensive theatre:
//   * the conversation must still be held by a human. If staff handed it back to
//     the assistant while the box was open, sending would put a human answer and
//     an AI answer on the same patient message.
//   * the branch must have WhatsApp delivery enabled, otherwise the row would
//     claim a send that never happened.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sessionGuardResponse } from "../_shared/active-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function corsPreflight() { return new Response("ok", { headers: corsHeaders }); }

/** Roles that may answer a patient. Mirrors `communication.respond`. */
const allowedRoles = new Set(["system_owner", "admin", "manager", "receptionist", "doctor", "nurse"]);
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") ?? "v23.0";
const MAX_REPLY_CHARS = 4096;

/**
 * Same normalisation the rest of the WhatsApp code uses: Egyptian numbers arrive
 * as `01xxxxxxxxx`, Meta wants `201xxxxxxxxx`. Never invent a country code for a
 * number that already has one.
 */
function normalizeWhatsAppRecipient(raw: string): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `20${digits.slice(1)}`;
  return digits;
}

function safeProviderError(raw: string): string {
  return raw.replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, 200);
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

  // An inactive/revoked session must not be able to speak to a patient, exactly as
  // every other staff-facing function enforces.
  const guard = await sessionGuardResponse(caller, jsonResponse);
  if (guard) return guard;

  const service = createClient(supabaseUrl, serviceKey);
  const { data: roles } = await service.from("user_roles").select("role").eq("user_id", userData.user.id);
  const callerRoles = new Set((roles ?? []).map((r: { role: string }) => r.role));
  if (!Array.from(callerRoles).some((role) => allowedRoles.has(role))) return jsonResponse({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const messageId = typeof body.message_id === "string" ? body.message_id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return jsonResponse({ error: "Invalid message id" }, 400);

  const { data: message, error: messageError } = await service
    .from("messages")
    .select("id,tenant_id,conversation_id,direction,sender_type,content,delivery_status")
    .eq("id", messageId)
    .maybeSingle();
  if (messageError || !message) return jsonResponse({ error: "Message not found" }, 404);
  if (message.direction !== "outbound") return jsonResponse({ error: "Only an outbound reply can be sent" }, 400);
  if (message.delivery_status === "sent") return jsonResponse({ error: "This reply was already sent" }, 409);
  const content = String(message.content ?? "").trim();
  if (!content) return jsonResponse({ error: "The reply is empty" }, 400);
  if (content.length > MAX_REPLY_CHARS) return jsonResponse({ error: "The reply is too long" }, 400);

  const { data: conversation, error: conversationError } = await service
    .from("conversations")
    .select("id,tenant_id,branch_id,channel_account_id,external_contact_id,status")
    .eq("id", message.conversation_id)
    .maybeSingle();
  if (conversationError || !conversation) return jsonResponse({ error: "Conversation not found" }, 404);
  if (conversation.tenant_id !== message.tenant_id) return jsonResponse({ error: "Conversation does not belong to this message" }, 400);

  // The caller must hold the same authority the RLS policy gives them for reading
  // the thread: permission + branch access. Checked here because this function
  // reads with the service role, which bypasses RLS.
  const { data: permitted } = await service.rpc("has_permission", {
    _user_id: userData.user.id,
    _permission_key: "communication.respond",
  });
  const { data: branchAllowed } = await service.rpc("user_has_branch_access", {
    _branch: conversation.branch_id,
  });
  if (!permitted || !branchAllowed) return jsonResponse({ error: "Forbidden" }, 403);

  if (conversation.status !== "human_active") {
    return jsonResponse({ error: "The assistant is handling this conversation again", code: "NOT_HUMAN_HELD" }, 409);
  }

  // The phone number id that received the message is the only correct sender for a
  // multi-tenant deployment: a branch-level id would answer from another clinic's
  // number.
  let phoneNumberId: string | null = null;
  if (conversation.channel_account_id) {
    const { data: account } = await service
      .from("channel_accounts")
      .select("external_account_id,is_active")
      .eq("id", conversation.channel_account_id)
      .maybeSingle();
    if (account?.is_active && account.external_account_id) phoneNumberId = String(account.external_account_id);
  }

  const { data: branchSettings } = await service
    .from("notification_settings")
    .select("whatsapp_enabled,whatsapp_provider,whatsapp_api_key,meta_phone_number_id")
    .eq("branch_id", conversation.branch_id)
    .maybeSingle();
  if (branchSettings?.whatsapp_enabled === false) {
    return jsonResponse({ error: "WhatsApp delivery is disabled for this branch", code: "WHATSAPP_DISABLED" }, 400);
  }
  const accessToken = branchSettings?.whatsapp_api_key ?? Deno.env.get("META_ACCESS_TOKEN");
  phoneNumberId = phoneNumberId ?? branchSettings?.meta_phone_number_id ?? Deno.env.get("META_PHONE_NUMBER_ID") ?? null;
  if (!phoneNumberId || !accessToken) {
    return jsonResponse({ error: "Meta WhatsApp is not configured for this branch", code: "WHATSAPP_NOT_CONFIGURED" }, 503);
  }

  const recipient = normalizeWhatsAppRecipient(String(conversation.external_contact_id ?? ""));
  if (!recipient) {
    await service.from("messages").update({ delivery_status: "failed" }).eq("id", messageId);
    return jsonResponse({ error: "The contact number is not a valid WhatsApp recipient" }, 400);
  }

  let providerStatus = 0;
  let raw = "";
  try {
    const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "text",
        text: { body: content, preview_url: false },
      }),
    });
    providerStatus = res.status;
    raw = await res.text().catch(() => "");
  } catch (err) {
    await service.from("messages").update({ delivery_status: "failed" }).eq("id", messageId);
    return jsonResponse({ error: safeProviderError(String((err as Error)?.message ?? err)) || "The provider did not answer" }, 502);
  }

  let parsed: { messages?: Array<{ id?: string }>; error?: { message?: string } } = {};
  try { parsed = JSON.parse(raw); } catch { /* reported below */ }
  const providerMessageId = parsed.messages?.[0]?.id ?? null;

  if (providerStatus < 200 || providerStatus >= 300 || !providerMessageId) {
    await service.from("messages").update({ delivery_status: "failed" }).eq("id", messageId);
    const detail = safeProviderError(parsed.error?.message ?? raw) || `Meta rejected the message (HTTP ${providerStatus})`;
    return jsonResponse({ error: detail, code: "PROVIDER_REJECTED" }, providerStatus >= 500 ? 502 : 400);
  }

  const { error: patchError } = await service
    .from("messages")
    .update({ delivery_status: "sent", external_message_id: providerMessageId })
    .eq("id", messageId);
  if (patchError) {
    // The patient did get the message; say so instead of implying it failed.
    return jsonResponse({ sent: true, recorded: false, provider_message_id: providerMessageId }, 200);
  }

  await service
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  return jsonResponse({ sent: true, recorded: true, provider_message_id: providerMessageId });
});
