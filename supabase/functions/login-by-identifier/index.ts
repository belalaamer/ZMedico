import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) return json({ error: "Server configuration error" }, 500);

    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier ?? "").trim();
    const password = typeof body.password === "string" ? body.password : "";
    if (!identifier || password.length < 6 || password.length > 128) return json({ error: "Invalid credentials" }, 401);

    let email = identifier.toLowerCase();
    if (!identifier.includes("@")) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(identifier)) return json({ error: "Invalid credentials" }, 401);
      const admin = createClient(url, serviceKey);
      const { data: profile } = await admin.from("profiles").select("email").ilike("username", identifier).maybeSingle();
      if (!profile?.email) return json({ error: "Invalid credentials" }, 401);
      email = String(profile.email).trim().toLowerCase();
    }

    const authResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const authBody = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || !authBody.access_token || !authBody.refresh_token) return json({ error: "Invalid credentials" }, 401);
    return json({ access_token: authBody.access_token, refresh_token: authBody.refresh_token, expires_in: authBody.expires_in, token_type: authBody.token_type, user: authBody.user });
  } catch {
    return json({ error: "Invalid credentials" }, 401);
  }
});
