import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function corsPreflight() { return new Response("ok", { headers: corsHeaders }); }

const allowedRoles = new Set(["system_owner", "admin", "manager", "receptionist", "doctor", "nurse"]);
function randomTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
function usernameBase(value: string) {
  const normalized = value.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").toLowerCase();
  return normalized.slice(0, 24) || "patient";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) return jsonResponse({ error: "Server configuration error" }, 500);

    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization) return jsonResponse({ error: "Unauthorized" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const patientId = typeof body.patient_id === "string" ? body.patient_id : "";
    const autoCredentials = body.auto_credentials === true;
    if (!patientId) return jsonResponse({ error: "patient_id is required" }, 400);

    const [{ data: patient, error: patientError }, { data: roles }] = await Promise.all([
      admin.from("patients").select("id,patient_code,branch_id,email,first_name_en,last_name_en,first_name_ar,last_name_ar").eq("id", patientId).is("deleted_at", null).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", callerData.user.id),
    ]);
    if (patientError || !patient) return jsonResponse({ error: "Patient not found" }, 404);
    if (!patient.email || !String(patient.email).includes("@")) return jsonResponse({ error: "patient_email_required" }, 400);

    const callerRoles = new Set((roles ?? []).map((row: { role: string }) => String(row.role)));
    const isSystemOwner = callerRoles.has("system_owner");
    if (!isSystemOwner && !Array.from(callerRoles).some((role) => allowedRoles.has(role))) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    if (!isSystemOwner) {
      const { data: branchLink } = await admin.from("staff_branches").select("branch_id").eq("user_id", callerData.user.id).eq("branch_id", patient.branch_id).limit(1);
      if (!branchLink?.length) return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: existing } = await admin.from("patient_portal_accounts").select("id,auth_user_id,status").eq("patient_id", patient.id).maybeSingle();
    if (existing?.auth_user_id) {
      return jsonResponse({ success: true, already_enabled: true, status: existing.status });
    }

    const fullName = [patient.first_name_en || patient.first_name_ar, patient.last_name_en || patient.last_name_ar].filter(Boolean).join(" ") || "Patient";
    let portalUsername: string | null = null;
    let temporaryPassword: string | null = null;
    if (autoCredentials) {
      const base = usernameBase([patient.first_name_en, patient.last_name_en].filter(Boolean).join(" ") || `patient-${patient.patient_code}`);
      for (let i = 0; i < 20; i++) {
        const suffix = i === 0 ? "" : `.${i + 1}`;
        const candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
        const { data: taken } = await admin.from("profiles").select("id").ilike("username", candidate).limit(1);
        if (!taken?.length) { portalUsername = candidate; break; }
      }
      if (!portalUsername) return jsonResponse({ error: "Could not allocate a unique username" }, 409);
      temporaryPassword = randomTemporaryPassword();
    }
    const email = String(patient.email).trim().toLowerCase();
    const metadata = { full_name: fullName, patient_portal: true, patient_id: patient.id, portal_username: portalUsername, force_password_change: autoCredentials };
    const { data: invited, error: inviteError } = autoCredentials
      ? await admin.auth.admin.createUser({ email, password: temporaryPassword!, email_confirm: true, user_metadata: metadata })
      : await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${Deno.env.get("PATIENT_PORTAL_ORIGIN") ?? "https://belalaamer.com"}/auth/callback?next=/patient-portal`, data: metadata });
    if (inviteError || !invited.user) return jsonResponse({ error: inviteError?.message ?? "Portal invitation failed" }, 400);

    // The generic signup trigger may provision a default staff role. A portal
    // identity is not staff and must never receive clinic operational access.
    await admin.from("user_roles").delete().eq("user_id", invited.user.id);
    await admin.from("profiles").upsert({ id: invited.user.id, email, full_name: fullName, username: portalUsername }, { onConflict: "id" });
    const { data: branch } = await admin.from("branches").select("tenant_id").eq("id", patient.branch_id).maybeSingle();
    if (!branch?.tenant_id) return jsonResponse({ error: "Branch not found" }, 400);

    const { error: accountError } = await admin.from("patient_portal_accounts").upsert({
      patient_id: patient.id,
      auth_user_id: invited.user.id,
      branch_id: patient.branch_id,
      tenant_id: branch.tenant_id,
      portal_enabled: true,
      status: "active",
      invited_at: new Date().toISOString(),
    }, { onConflict: "patient_id" });
    if (accountError) {
      await admin.auth.admin.deleteUser(invited.user.id).catch(() => {});
      return jsonResponse({ error: `Portal account provisioning failed: ${accountError.message}` }, 500);
    }

    return new Response(JSON.stringify({ success: true, already_enabled: false, invitation_sent: !autoCredentials, credentials: autoCredentials && portalUsername && temporaryPassword ? { username: portalUsername, password: temporaryPassword, email } : null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
