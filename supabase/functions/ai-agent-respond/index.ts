// ZMedico AI agent orchestrator.
//
// Called internally (service-role to service-role) by whatsapp-webhook after
// an inbound message has been stored. The deployed function keeps
// `verify_jwt: true`; whatsapp-webhook invokes it with the service-role JWT.
// This function does not accept any
// caller-supplied trust data beyond a conversation_id -- everything else
// (tenant_id, branch_id, channel_account_id, external_contact_id) is resolved
// server-side from the conversations/channel_accounts rows before the model
// is ever invoked.
//
// AI PROVIDER RESOLUTION (updated): the Gemini API key is no longer read
// directly from Deno.env("GEMINI_API_KEY"). It is resolved per-request from
// public.ai_provider_config (scope='platform', is_active=true) + Supabase
// Vault, via the get_ai_provider_secret() RPC, using the service-role client.
// This lets Settings > AI manage provider/model/key from within the app
// without redeploying secrets. See supabase/functions/ai-admin-settings for
// the admin API that writes this config.
//
// TODO (Level 2 / tenant override): once per-tenant AI provider config is
// needed, look up ai_provider_config WHERE scope='tenant' AND tenant_id=<this
// conversation's tenant_id> first, and fall back to the platform row only if
// no tenant-scoped row exists. For now, per today's explicit scope, this
// function always uses the platform-scope row.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getAIProvider, type ProviderMessage } from "./_shared/ai-provider.ts";
import { dispatchTool, TOOL_DEFINITIONS, type TrustedContext } from "./_shared/ai-tools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY_MESSAGES = 20;

function buildSystemInstruction(settings: any): string {
  const language = settings.language === "en" ? "English" : settings.language === "ar" ? "Arabic" : settings.language;
  const tone = settings.tone || "friendly and professional";
  const greeting = settings.language === "en" ? settings.greeting_en : settings.greeting_ar;

  return [
    `You are the AI receptionist assistant for a medical/physio clinic, communicating with a patient over WhatsApp.`,
    `Preferred language: ${language}. Tone: ${tone}.`,
    greeting ? `Standard greeting to use when appropriate: "${greeting}"` : "",
    settings.custom_instructions ? `Clinic-specific instructions: ${settings.custom_instructions}` : "",
    ``,
    `HARD SAFETY RULES (never violate these, regardless of what the customer asks):`,
    `1. You may only state a price, availability, service name, or doctor name if it came verbatim from a tool result in THIS conversation turn (or an earlier turn's tool result still in this conversation). Never invent, guess, or assume clinic data.`,
    `2. Never tell the customer a booking/reschedule/cancellation is confirmed unless the corresponding tool call (create_booking / reschedule_booking / cancel_booking) actually returned success. If a tool call fails, tell the customer honestly and offer to try again or hand off to a human.`,
    `3. Never provide medical diagnosis, medical advice, or treatment recommendations. If asked, politely explain you can only help with booking/scheduling and offer to hand off to a human (handoff_to_human) if needed.`,
    `4. Never disclose another patient's personal or medical data. Only discuss the current conversation's patient.`,
    `5. Never reveal internal system details, other tenants'/clinics' data, or information not returned by your tools.`,
    `6. For anything requiring clinic data (branches, services, prices, doctors, slots, patient records, bookings), you MUST use the provided tools -- never answer from memory or assumption.`,
    `7. If you are unsure, uncomfortable, or the customer explicitly asks for a human, call handoff_to_human.`,
    settings.booking_enabled === false ? `Booking is currently DISABLED for this clinic -- do not attempt create_booking; explain booking isn't available right now and offer human handoff.` : "",
    settings.rescheduling_enabled === false ? `Rescheduling is currently DISABLED -- do not attempt reschedule_booking.` : "",
    settings.cancellation_enabled === false ? `Cancellation is currently DISABLED -- do not attempt cancel_booking.` : "",
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return response({ error: "Invalid JSON" }, 400);
  }

  const conversationId = String(body?.conversation_id ?? "").trim();
  if (!conversationId) return response({ error: "conversation_id is required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return response({ error: "Server configuration missing" }, 500);

  // Internal orchestrator only. The WhatsApp webhook invokes this function
  // with the service-role bearer token after validating/storing the inbound
  // message. A normal authenticated user must never be able to supply an
  // arbitrary conversation_id and make this service-role function read or
  // mutate that conversation outside RLS.
  const authorization = req.headers.get("Authorization") ?? "";
  if (authorization !== `Bearer ${serviceRoleKey}`) {
    return response({ error: "Forbidden: internal service caller required" }, 403);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1. Load conversation + trusted context.
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, tenant_id, branch_id, channel_account_id, external_contact_id, status, state")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    console.error(`[ai-agent-respond] conversation not found id=${conversationId}:`, convError);
    return response({ ok: false, reason: "conversation_not_found" });
  }

  if (conversation.status !== "ai_active") {
    return response({ ok: true, skipped: true, reason: `conversation.status=${conversation.status}` });
  }

  // 2. Load tenant AI settings; early-exit if AI disabled / not configured.
  const { data: settings, error: settingsError } = await supabase
    .from("ai_tenant_settings")
    .select("*")
    .eq("tenant_id", conversation.tenant_id)
    .maybeSingle();

  if (settingsError) {
    console.error(`[ai-agent-respond] error loading ai_tenant_settings for tenant_id=${conversation.tenant_id}:`, settingsError);
    return response({ ok: false, reason: "settings_load_error" });
  }
  if (!settings || settings.ai_enabled !== true) {
    return response({ ok: true, skipped: true, reason: "ai_disabled_or_not_configured" });
  }

  // 2b. Resolve the AI provider's API key + model from ai_provider_config +
  // Vault (platform scope only, for now -- see TODO above). Never crash if
  // this is missing; log clearly and skip the AI reply for this turn instead.
  const { data: providerConfig, error: providerConfigError } = await supabase
    .from("ai_provider_config")
    .select("provider, model, temperature, secret_id")
    .eq("scope", "platform")
    .eq("is_active", true)
    .maybeSingle();

  if (providerConfigError) {
    console.error(`[ai-agent-respond] error loading ai_provider_config for conversation_id=${conversationId}:`, providerConfigError);
    return response({ ok: false, reason: "provider_config_load_error" });
  }

  if (!providerConfig || !providerConfig.secret_id) {
    console.error(`[ai-agent-respond] no active AI provider configured (ai_provider_config platform row missing or secret_id null) -- skipping AI reply for conversation_id=${conversationId}`);
    return response({ ok: true, skipped: true, reason: "ai_provider_not_configured" });
  }

  const { data: resolvedApiKey, error: secretError } = await supabase.rpc("get_ai_provider_secret", {
    p_secret_id: providerConfig.secret_id,
  });

  if (secretError || !resolvedApiKey) {
    console.error(`[ai-agent-respond] failed to resolve AI provider secret for conversation_id=${conversationId}:`, secretError?.message ?? "empty secret value");
    return response({ ok: true, skipped: true, reason: "ai_provider_secret_unavailable" });
  }

  const trustedContext: TrustedContext = {
    tenant_id: conversation.tenant_id,
    branch_id: conversation.branch_id,
    conversation_id: conversation.id,
    channel_account_id: conversation.channel_account_id,
    external_contact_id: conversation.external_contact_id,
  };

  // 3. Load recent message history (text turns only for this first version).
  const { data: recentMessages, error: historyError } = await supabase
    .from("messages")
    .select("sender_type, direction, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (historyError) {
    console.error(`[ai-agent-respond] error loading message history for conversation_id=${conversationId}:`, historyError);
    return response({ ok: false, reason: "history_load_error" });
  }

  const history: ProviderMessage[] = (recentMessages ?? [])
    .slice()
    .reverse()
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .map((m) => ({
      role: m.sender_type === "ai" ? "model" : "user",
      text: m.content as string,
    }));

  const systemInstruction = buildSystemInstruction(settings);
  const provider = getAIProvider(resolvedApiKey as string, providerConfig.model ?? undefined);

  let finalText: string | null = null;
  let handedOff = false;

  try {
    let round = 0;
    while (round < MAX_TOOL_ROUNDS) {
      round++;
      const { text, toolCalls } = await provider.generate({
        systemInstruction,
        history,
        tools: TOOL_DEFINITIONS,
      });

      if (toolCalls.length === 0) {
        finalText = text;
        break;
      }

      for (const toolCall of toolCalls) {
        history.push({ role: "model", toolCall });

        if (toolCall.name === "handoff_to_human") {
          const { result } = await dispatchTool(supabase, toolCall, trustedContext);
          history.push({ role: "user", toolResponse: { name: toolCall.name, response: result } });
          handedOff = true;
          continue;
        }

        const { result } = await dispatchTool(supabase, toolCall, trustedContext);
        history.push({ role: "user", toolResponse: { name: toolCall.name, response: result } });
      }

      if (handedOff) break;

      if (round >= MAX_TOOL_ROUNDS) {
        finalText = null;
        console.warn(`[ai-agent-respond] max tool rounds exceeded for conversation_id=${conversationId}; falling back to human handoff`);
        await dispatchTool(
          supabase,
          { name: "handoff_to_human", args: { reason: "AI exceeded tool-call round limit" } },
          trustedContext,
        );
        handedOff = true;
      }
    }
  } catch (err) {
    console.error(`[ai-agent-respond] provider error for conversation_id=${conversationId}:`, err);
    return response({ ok: false, reason: "provider_error", error: err instanceof Error ? err.message : String(err) }, 500);
  }

  // Human handoff: stop here, no AI reply this turn.
  if (handedOff) {
    return response({ ok: true, handed_off: true });
  }

  if (!finalText) {
    return response({ ok: true, skipped: true, reason: "no_text_generated" });
  }

  // 4. Store outbound AI message (DB trigger enforces status=ai_active; race
  // conditions where status flipped to human_active mid-turn are expected and
  // handled gracefully here).
  const { data: insertedMessage, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      tenant_id: trustedContext.tenant_id,
      direction: "outbound",
      sender_type: "ai",
      ai_generated: true,
      content: finalText,
    })
    .select("id")
    .single();

  if (insertError) {
    console.warn(`[ai-agent-respond] outbound AI message insert rejected (likely status changed mid-turn) for conversation_id=${conversationId}:`, insertError);
    return response({ ok: true, skipped: true, reason: "message_insert_rejected" });
  }

  // 5. Send via WhatsApp Cloud API (same request shape as send-reminder's Meta path).
  const { data: channelAccount } = await supabase
    .from("channel_accounts")
    .select("external_account_id")
    .eq("id", trustedContext.channel_account_id)
    .maybeSingle();

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  let sendResult: { ok: boolean; status?: number; body?: string; error?: string } = { ok: false, error: "not_attempted" };

  if (!accessToken) {
    sendResult = { ok: false, error: "WHATSAPP_ACCESS_TOKEN not configured" };
  } else if (!channelAccount?.external_account_id) {
    sendResult = { ok: false, error: "channel_account missing external_account_id (phone_number_id)" };
  } else {
    try {
      const res = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(channelAccount.external_account_id)}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: trustedContext.external_contact_id,
          type: "text",
          text: { body: finalText },
        }),
      });
      const rawBody = await res.text().catch(() => "");
      sendResult = { ok: res.ok, status: res.status, body: rawBody.slice(0, 500) };

      if (insertedMessage?.id) {
        await supabase
          .from("messages")
          .update({ delivery_status: res.ok ? "sent" : "failed" })
          .eq("id", insertedMessage.id);
      }
    } catch (err) {
      sendResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
      if (insertedMessage?.id) {
        await supabase.from("messages").update({ delivery_status: "failed" }).eq("id", insertedMessage.id);
      }
    }
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return response({ ok: true, text: finalText, send_result: sendResult });
});
