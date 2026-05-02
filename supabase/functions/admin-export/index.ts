import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TABLES = new Set([
  "patients",
  "appointments",
  "invoices",
  "payments",
  "products",
  "medical_records",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate the caller's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Verify admin role server-side
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleErr || !roleRow) {
      return json({ error: "Forbidden: admin access required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "all" ? "all" : "table";
    const requested: string[] =
      mode === "all"
        ? Array.from(ALLOWED_TABLES)
        : Array.isArray(body?.tables)
        ? body.tables
        : typeof body?.table === "string"
        ? [body.table]
        : [];

    const tables = requested.filter((t) => ALLOWED_TABLES.has(t));
    if (tables.length === 0) {
      return json({ error: "No valid table requested" }, 400);
    }

    const out: Record<string, unknown[]> = {};
    for (const tbl of tables) {
      const { data, error } = await admin.from(tbl).select("*").limit(10000);
      if (error) return json({ error: `Failed to read ${tbl}` }, 500);
      out[tbl] = data ?? [];
    }

    return json({ data: out });
  } catch (_e) {
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}