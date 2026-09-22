import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "Server configuration error" }, 500);

    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 8_192) {
      return jsonResponse({ error: "Request body is too large" }, 413);
    }
    const body = JSON.parse(raw || "{}");
    const payload = body?.payload && typeof body.payload === "object" ? body.payload : body;

    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const clientIp = req.headers.get("cf-connecting-ip")?.trim() || forwardedFor || "unknown";
    const bucketKey = await sha256Hex(clientIp);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: allowed, error: rateError } = await admin.rpc("consume_subscription_request_rate_limit", {
      p_key: bucketKey,
      p_limit: 8,
      p_window_seconds: 3600,
    });
    if (rateError) return jsonResponse({ error: "Request service temporarily unavailable" }, 503);
    if (allowed !== true) return jsonResponse({ error: "Too many requests. Try again later.", code: "rate_limited" }, 429);

    const { data, error } = await admin.rpc("public_create_subscription_request", {
      p_payload: payload,
    });
    if (error) {
      const status = error.code === "22023" ? 400 : 500;
      return jsonResponse({ error: status === 400 ? error.message : "Could not submit request" }, status);
    }

    return jsonResponse(data ?? { accepted: true }, 200);
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
});
