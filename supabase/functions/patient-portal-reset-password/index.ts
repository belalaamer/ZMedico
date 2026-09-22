import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

const allowedRoles = new Set(["system_owner", "admin", "manager", "receptionist", "doctor", "nurse"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const patientId = typeof body.patient_id === "string" ? body.patient_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(patientId)) {
      return jsonResponse({ error: "patient_id is required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const [{ data: roles }, { data: patient, error: patientError }, { data: account, error: accountError }] =
      await Promise.all([
        admin.from("user_roles").select("role").eq("user_id", callerData.user.id),
        admin.from("patients")
          .select("id,branch_id,email")
          .eq("id", patientId)
          .is("deleted_at", null)
          .maybeSingle(),
        admin.from("patient_portal_accounts")
          .select("id,patient_id,auth_user_id,status,portal_enabled")
          .eq("patient_id", patientId)
          .maybeSingle(),
      ]);

    if (patientError || !patient || accountError || !account?.auth_user_id) {
      return jsonResponse({ error: "Patient portal account not found" }, 404);
    }
    if (!account.portal_enabled || account.status !== "active") {
      return jsonResponse({ error: "Patient portal account is not active" }, 409);
    }

    const callerRoles = new Set((roles ?? []).map((row: { role: string }) => String(row.role)));
    const isSystemOwner = callerRoles.has("system_owner");
    if (!isSystemOwner && !Array.from(callerRoles).some((role) => allowedRoles.has(role))) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    if (!isSystemOwner) {
      const { data: branchLink, error: branchError } = await admin
        .from("staff_branches")
        .select("branch_id")
        .eq("user_id", callerData.user.id)
        .eq("branch_id", patient.branch_id)
        .limit(1);
      if (branchError || !branchLink?.length) return jsonResponse({ error: "Forbidden" }, 403);
    }

    const password = randomTemporaryPassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(account.auth_user_id, {
      password,
      user_metadata: { force_password_change: true, patient_portal: true, patient_id: patient.id },
    });
    if (updateError) return jsonResponse({ error: "Could not reset the portal password" }, 500);

    await admin.from("patient_portal_accounts")
      .update({ must_change_password: true })
      .eq("patient_id", patient.id)
      .eq("auth_user_id", account.auth_user_id);

    const { data: profile } = await admin.from("profiles")
      .select("username,email")
      .eq("id", account.auth_user_id)
      .maybeSingle();

    return jsonResponse({
      success: true,
      credentials: {
        username: profile?.username ?? null,
        email: profile?.email ?? patient.email ?? null,
        password,
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
