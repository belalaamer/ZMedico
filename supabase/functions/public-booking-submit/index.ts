import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-client-info, apikey, authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

function stringField(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Booking service is not configured" }, 500);
    }

    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 24_576) {
      return json({ error: "Request body is too large" }, 413);
    }
    const body = JSON.parse(raw || "{}");

    const tenantId = stringField(body.p_tenant_id, 36);
    const branchId = stringField(body.p_branch_id, 36);
    const serviceId = stringField(body.p_service_id, 36);
    const slotStart = stringField(body.p_slot_start, 64);
    const fullName = stringField(body.p_full_name, 160);
    const phone = stringField(body.p_phone, 40);
    const doctorId = stringField(body.p_doctor_id, 36) || null;
    const email = stringField(body.p_email, 254) || null;
    const complaint = stringField(body.p_complaint, 2000) || null;
    const source = stringField(body.p_source, 100) || "public_booking";
    const metadata =
      body.p_metadata && typeof body.p_metadata === "object" && !Array.isArray(body.p_metadata)
        ? body.p_metadata
        : {};

    if (
      !/^[0-9a-f-]{36}$/i.test(tenantId) ||
      !/^[0-9a-f-]{36}$/i.test(branchId) ||
      !/^[0-9a-f-]{36}$/i.test(serviceId) ||
      !slotStart ||
      fullName.length < 2 ||
      phone.length < 5 ||
      (doctorId && !/^[0-9a-f-]{36}$/i.test(doctorId))
    ) {
      return json({ error: "invalid_booking_request" }, 400);
    }

    const normalizedPhone = phone.replace(/\D/g, "");
    if (normalizedPhone.length < 7 || normalizedPhone.length > 20) {
      return json({ error: "invalid_phone" }, 400);
    }

    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const clientIp =
      req.headers.get("cf-connecting-ip")?.trim() ||
      forwardedFor ||
      "unknown";

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ipKey = await sha256Hex(`public-booking:ip:${tenantId}:${clientIp}`);
    const phoneKey = await sha256Hex(
      `public-booking:phone:${tenantId}:${normalizedPhone}`,
    );

    const [{ data: ipAllowed, error: ipError }, { data: phoneAllowed, error: phoneError }] =
      await Promise.all([
        admin.rpc("consume_public_booking_rate_limit", {
          p_key: ipKey,
          p_limit: 20,
          p_window_seconds: 3600,
        }),
        admin.rpc("consume_public_booking_rate_limit", {
          p_key: phoneKey,
          p_limit: 6,
          p_window_seconds: 21600,
        }),
      ]);

    if (ipError || phoneError) {
      return json({ error: "booking_service_temporarily_unavailable" }, 503);
    }
    if (ipAllowed !== true || phoneAllowed !== true) {
      return json({ error: "rate_limited" }, 429);
    }

    const { data, error } = await admin.rpc("public_create_booking_for_tenant", {
      p_tenant_id: tenantId,
      p_branch_id: branchId,
      p_service_id: serviceId,
      p_slot_start: slotStart,
      p_full_name: fullName,
      p_phone: phone,
      p_doctor_id: doctorId,
      p_email: email,
      p_complaint: complaint,
      p_source: source,
      p_metadata: metadata,
    });

    if (error) {
      const message = String(error.message || "booking_failed");
      const status = message.includes("slot_unavailable") ? 409 : 400;
      return json({ error: message }, status);
    }

    return json(data, 200);
  } catch {
    return json({ error: "invalid_booking_request" }, 400);
  }
});
