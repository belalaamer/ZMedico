import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function genPassword(len = 14) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Identify caller and verify admin role
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const full_name = body.full_name ? String(body.full_name).trim() : null;
    const role = String(body.role ?? "staff");
    const branch_id = body.branch_id ? String(body.branch_id) : null;
    const password: string = body.password
      ? String(body.password)
      : genPassword(14);

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const allowedRoles = [
      "admin", "manager", "doctor", "nurse",
      "receptionist", "accountant", "hr", "staff",
    ];
    if (!allowedRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rolesRequiringBranch = ["manager", "doctor", "nurse", "receptionist", "accountant", "staff"];
    if (rolesRequiringBranch.includes(role) && !branch_id) {
      return new Response(
        JSON.stringify({ error: `Branch is required for role: ${role}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Pre-authorize email so handle_new_user trigger accepts the signup
    // and assigns the chosen role + name automatically.
    await admin.from("allowed_signup_emails").upsert(
      { email, role, full_name, created_by: userData.user.id },
      { onConflict: "email" },
    );

    // Create the auth user with email pre-confirmed.
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name ?? undefined },
      });

    if (createErr || !created?.user) {
      // Roll back the allowlist row so it does not linger.
      await admin.from("allowed_signup_emails").delete().eq("email", email);
      return new Response(
        JSON.stringify({ error: createErr?.message ?? "Create user failed" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Make sure profile + role exist (handle_new_user usually does this,
    // but if it didn't run we ensure consistency).
    await admin.from("profiles").upsert(
      { id: created.user.id, email, full_name },
      { onConflict: "id" },
    );
    await admin.from("user_roles").upsert(
      { user_id: created.user.id, role },
      { onConflict: "user_id,role" },
    );
    // Create/update staff profile with branch assignment when provided.
    if (branch_id) {
      // staff_profiles.employee_id is NOT NULL with no default. Generate one
      // using the employee_id_counter so the upsert does not violate the
      // constraint for newly created users.
      const { data: existing } = await admin
        .from("staff_profiles")
        .select("id, employee_id")
        .eq("id", created.user.id)
        .maybeSingle();

      let employeeId = existing?.employee_id as string | undefined;
      if (!employeeId) {
        const { data: counter } = await admin
          .from("employee_id_counter")
          .select("id, last_value")
          .eq("id", 1)
          .maybeSingle();
        const next = ((counter?.last_value as number) ?? 0) + 1;
        await admin
          .from("employee_id_counter")
          .upsert({ id: 1, last_value: next });
        employeeId = `EMP-${String(next).padStart(4, "0")}`;
      }

      const { error: spErr } = await admin.from("staff_profiles").upsert(
        { id: created.user.id, branch_id, employee_id: employeeId },
        { onConflict: "id" },
      );
      if (spErr) {
        return new Response(
          JSON.stringify({
            error: `User created but staff profile failed: ${spErr.message}`,
            user_id: created.user.id,
            email,
            password,
            role,
          }),
          {
            status: 207,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }
    // Consume invite if still present
    await admin.from("allowed_signup_emails").delete().eq("email", email);

    return new Response(
      JSON.stringify({
        user_id: created.user.id,
        email,
        password,
        role,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});