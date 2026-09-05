import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^sha256=/, "").trim();
  if (!/^[0-9a-f]{64}$/i.test(clean)) return new Uint8Array();
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifySignature(rawBody: string, req: Request): Promise<boolean> {
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");
  if (!appSecret) return false;
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  return timingSafeEqual(digest, hexToBytes(signature));
}

// Processes a single inbound customer message (Meta "messages" webhook payload shape).
// Resolves the tenant via channel_accounts, finds-or-creates the conversation, and
// inserts the message idempotently on external_message_id. Never throws — all errors
// are caught and logged so one bad message can't abort the whole webhook call.
async function handleInboundMessage(
  supabase: ReturnType<typeof createClient>,
  phoneNumberId: string,
  message: any,
) {
  try {
    const { data: channelAccount, error: channelAccountError } = await supabase
      .from("channel_accounts")
      .select("id, tenant_id, branch_id")
      .eq("channel", "whatsapp")
      .eq("external_account_id", phoneNumberId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (channelAccountError) {
      console.error(`[whatsapp-webhook] error looking up channel_account for phone_number_id=${phoneNumberId}:`, channelAccountError);
      return;
    }

    if (!channelAccount) {
      console.warn(`[whatsapp-webhook] no active whatsapp channel_account found for phone_number_id=${phoneNumberId}; skipping message id=${message?.id}`);
      return;
    }

    const externalContactId = String(message.from ?? "").trim();
    if (!externalContactId) {
      console.warn(`[whatsapp-webhook] inbound message missing 'from'; skipping message id=${message?.id}`);
      return;
    }

    const { data: existingConversation, error: findConversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("channel_account_id", channelAccount.id)
      .eq("external_contact_id", externalContactId)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findConversationError) {
      console.error(`[whatsapp-webhook] error finding conversation for channel_account_id=${channelAccount.id} external_contact_id=${externalContactId}:`, findConversationError);
      return;
    }

    let conversationId = existingConversation?.id as string | undefined;

    if (!conversationId) {
      const { data: newConversation, error: createConversationError } = await supabase
        .from("conversations")
        .insert({
          tenant_id: channelAccount.tenant_id,
          branch_id: channelAccount.branch_id,
          channel_account_id: channelAccount.id,
          channel: "whatsapp",
          external_contact_id: externalContactId,
        })
        .select("id")
        .single();

      if (createConversationError || !newConversation) {
        console.error(`[whatsapp-webhook] error creating conversation for channel_account_id=${channelAccount.id} external_contact_id=${externalContactId}:`, createConversationError);
        return;
      }

      conversationId = newConversation.id as string;
    }

    const { error: insertMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        tenant_id: channelAccount.tenant_id,
        direction: "inbound",
        sender_type: "patient",
        message_type: message.type ?? null,
        content: message.text?.body ?? null,
        external_message_id: message.id ?? null,
        raw_payload: message,
      })
      .select();

    if (insertMessageError) {
      if ((insertMessageError as any).code === "23505") {
        console.log(`[whatsapp-webhook] duplicate inbound message ignored (idempotent), external_message_id=${message.id}`);
        return;
      }
      console.error(`[whatsapp-webhook] error inserting message external_message_id=${message.id}:`, insertMessageError);
      return;
    }

    const { error: touchConversationError } = await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (touchConversationError) {
      console.error(`[whatsapp-webhook] error updating last_message_at for conversation_id=${conversationId}:`, touchConversationError);
    }
  } catch (err) {
    console.error(`[whatsapp-webhook] unexpected error handling inbound message id=${message?.id}:`, err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected && challenge) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return response({ error: "Webhook verification failed" }, 403);
  }

  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  if (!(await verifySignature(rawBody, req))) return response({ error: "Invalid webhook signature" }, 401);

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return response({ error: "Invalid JSON" }, 400); }
  if (payload?.object !== "whatsapp_business_account") return response({ received: true });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return response({ error: "Server configuration missing" }, 500);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let updated = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const status of value.statuses ?? []) {
        const providerMessageId = String(status.id ?? "").trim();
        const providerStatus = String(status.status ?? "").trim().toLowerCase();
        if (!providerMessageId || !providerStatus) continue;
        const patch: Record<string, unknown> = {
          provider_status: providerStatus,
          provider_response: { webhook: status },
        };
        if (providerStatus === "failed") {
          patch.status = "failed";
          patch.error_message = `Meta status: ${String(status.errors?.[0]?.title ?? status.errors?.[0]?.message ?? "delivery failed").slice(0, 200)}`;
        } else if (["sent", "delivered", "read"].includes(providerStatus)) {
          patch.status = "sent";
          patch.error_message = null;
          patch.sent_at = new Date().toISOString();
        }
        const { error } = await supabase
          .from("reminders")
          .update(patch)
          .eq("provider_message_id", providerMessageId);
        const portalStatus = providerStatus === "failed"
          ? "failed"
          : providerStatus === "read"
            ? "read"
            : providerStatus === "delivered"
              ? "delivered"
              : providerStatus === "sent"
                ? "sent"
                : null;
        const { error: portalError } = portalStatus
          ? await supabase
            .from("patient_portal_delivery_events")
            .update({ status: portalStatus, error_message: portalStatus === "failed" ? patch.error_message : null })
            .eq("provider_message_id", providerMessageId)
          : { error: null };
        if (!error || !portalError) updated++;
      }

      // Inbound customer messages (Phase 1 multi-tenant AI messaging platform).
      // Processed alongside the existing status-update loop above; never lets a
      // single bad message affect the status-update logic or the response.
      if (Array.isArray(value.messages) && value.messages.length > 0) {
        const phoneNumberId = String(value.metadata?.phone_number_id ?? "").trim();
        if (!phoneNumberId) {
          console.warn("[whatsapp-webhook] inbound messages payload missing metadata.phone_number_id; skipping entry");
        } else {
          for (const message of value.messages) {
            await handleInboundMessage(supabase, phoneNumberId, message);
          }
        }
      }
    }
  }

  return response({ received: true, updated });
});
