// Staff reply to a patient conversation.
//
// Why this exists. `whatsapp-webhook` only receives, and `ai-agent-respond` is
// the only sender of outbound text -- as the assistant. A human who takes a
// conversation over had no way to answer, so the patient waited forever.
// `send-reminder` is not a substitute: it resolves its recipient through
// `reminders.patient_id`, and `conversations.patient_id` is never populated by
// the webhook.
//
// Contract: the screen inserts the outbound `messages` row first (so the thread
// shows what was written even if delivery fails), then calls this with the id.
// This decides whether the send is allowed *now*, sends, and writes the outcome
// onto the row.
//
// Fixed in this revision:
//   B1  authorisation now runs as the caller (`caller.rpc`), not the service
//       role. `user_has_branch_access` reads `auth.uid()`; the service client has
//       no `sub`, so it always answered false and every reply was refused 403.
//       A branch-less conversation is scoped by `user_has_tenant_access` instead
//       of treating a NULL branch as "allowed".
//   S5  sending goes through `_shared/whatsapp-send`, which honours the branch's
//       provider (twilio | meta | custom) and never falls back to platform-wide
//       credentials, so a reply cannot leave from another clinic's number.
//   B4  every exit path records a terminal outcome. Previously six early returns
//       left the row at `queued`, so the UI showed "sending" forever. Sending is
//       claimed atomically, so a retry or a concurrent request cannot double-send.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sessionGuardResponse } from "../_shared/active-session.ts";
import { sendConversationReply } from "../_shared/whatsapp-send.ts";

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
const MAX_REPLY_CHARS = 4096;

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
  // The caller's own client, carrying the caller's JWT. Used for identity checks
  // (B1) so `auth.uid()` is the staff member, not the service role.
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);

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
  // A browser may not ask us to deliver a row it does not own as staff speech.
  if (message.sender_type !== "staff") return jsonResponse({ error: "Only a staff reply can be sent" }, 400);

  // B4: every exit below, except a genuine "already sent", records a terminal
  // outcome so the row never stays `queued` while nothing is happening.
  const fail = async (code: string, error: string, status: number) => {
    await service
      .from("messages")
      .update({ delivery_status: "failed", raw_payload: { provider_error: { code, message: error } } })
      .eq("id", messageId)
      .neq("delivery_status", "sent");
    return jsonResponse({ error, code }, status);
  };

  if (message.delivery_status === "sent") return jsonResponse({ error: "This reply was already sent", code: "ALREADY_SENT" }, 409);
  const content = String(message.content ?? "").trim();
  if (!content) return fail("EMPTY_REPLY", "The reply is empty", 400);
  if (content.length > MAX_REPLY_CHARS) return fail("REPLY_TOO_LONG", "The reply is too long", 400);

  const { data: conversation, error: conversationError } = await service
    .from("conversations")
    .select("id,tenant_id,branch_id,channel_account_id,external_contact_id,status")
    .eq("id", message.conversation_id)
    .maybeSingle();
  if (conversationError || !conversation) return fail("CONVERSATION_MISSING", "Conversation not found", 404);
  if (conversation.tenant_id !== message.tenant_id) return fail("TENANT_MISMATCH", "Conversation does not belong to this message", 400);

  // B1: authorise as the caller. `has_permission` takes an explicit user id, but
  // `user_has_branch_access` / `user_has_tenant_access` read `auth.uid()`, so they
  // MUST run on the caller's client -- running them on the service client returns
  // false for everyone and refused every reply.
  //
  // Authorisation failures return WITHOUT writing. `fail()` runs with the service
  // role and would let a caller from another branch flip the delivery status of a
  // row they are not allowed to touch; refusing must be a no-op, not a write.
  const { data: permitted } = await caller.rpc("has_permission", {
    _user_id: userData.user.id,
    _permission_key: "communication.respond",
  });
  if (!permitted) return jsonResponse({ error: "Forbidden", code: "FORBIDDEN" }, 403);

  const scopeOk = conversation.branch_id
    ? (await caller.rpc("user_has_branch_access", { _branch: conversation.branch_id })).data === true
    : (await caller.rpc("user_has_tenant_access", { _tenant_id: conversation.tenant_id })).data === true;
  if (!scopeOk) return jsonResponse({ error: "Forbidden", code: "FORBIDDEN" }, 403);

  if (conversation.status !== "human_active") {
    return fail("NOT_HUMAN_HELD", "The assistant is handling this conversation again", 409);
  }

  // B4: claim the send exactly once per attempt window. A retry, or two staff
  // racing, gets false here and does not send a second copy. The claim is a
  // database guard, NOT a provider-level exactly-once guarantee: a crash after
  // the provider accepted the message but before `delivery_status='sent'` is
  // written can still resend once the claim goes stale. See the migration.
  const { data: claimed, error: claimError } = await service.rpc("claim_conversation_reply", { p_message_id: messageId });
  if (claimError) return fail("CLAIM_FAILED", "The reply could not be claimed for sending", 500);
  if (claimed !== true) {
    // Either it is already delivered, or another attempt holds a live claim. Say
    // which, so the operator is not told "already sent" about a message that may
    // still be in flight.
    const { data: current } = await service
      .from("messages")
      .select("delivery_status")
      .eq("id", messageId)
      .maybeSingle();
    if (current?.delivery_status === "sent") {
      return jsonResponse({ error: "This reply was already sent", code: "ALREADY_SENT" }, 409);
    }
    return jsonResponse({ error: "This reply is already being sent", code: "IN_FLIGHT" }, 409);
  }

  const { data: branchSettings } = await service
    .from("notification_settings")
    .select("whatsapp_enabled,whatsapp_provider,whatsapp_api_key,whatsapp_api_url,meta_phone_number_id,twilio_account_sid,twilio_auth_token,twilio_from_whatsapp")
    .eq("branch_id", conversation.branch_id)
    .maybeSingle();

  let fromAccountId: string | null = null;
  if (conversation.channel_account_id) {
    const { data: account } = await service
      .from("channel_accounts")
      .select("external_account_id,is_active")
      .eq("id", conversation.channel_account_id)
      .maybeSingle();
    if (account?.is_active && account.external_account_id) fromAccountId = String(account.external_account_id);
  }

  const outcome = await sendConversationReply({
    settings: branchSettings,
    to: String(conversation.external_contact_id ?? ""),
    body: content,
    fromAccountId,
  });

  if (!outcome.ok) {
    return fail(outcome.code, outcome.error, outcome.status ?? 502);
  }

  // The row may only move forward from a claimed state; a concurrent writer that
  // already marked it sent wins and we must not overwrite it.
  const { data: patched, error: patchError } = await service
    .from("messages")
    .update({ delivery_status: "sent", external_message_id: outcome.providerMessageId ?? null })
    .eq("id", messageId)
    .neq("delivery_status", "sent")
    .select("id");
  if (patchError || (patched ?? []).length === 0) {
    // The patient did get the message; say so instead of implying it failed.
    return jsonResponse({ sent: true, recorded: false, provider_message_id: outcome.providerMessageId ?? null }, 200);
  }

  await service
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  return jsonResponse({ sent: true, recorded: true, provider: outcome.provider, provider_message_id: outcome.providerMessageId ?? null });
});
