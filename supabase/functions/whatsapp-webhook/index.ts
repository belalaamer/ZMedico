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
    }
  }

  return response({ received: true, updated });
});
