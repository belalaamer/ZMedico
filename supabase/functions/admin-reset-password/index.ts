import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflight();
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return jsonResponse({ error: "Forbidden: admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const user_id = String(body.user_id ?? "").trim();
    if (!user_id) {
      return jsonResponse({ error: "user_id required" }, 400);
    }
    // Sprint 1 hardening: admin-initiated password reset no longer accepts
    // or returns plaintext passwords. The target user receives a one-time
    // recovery link and sets their own password. Any inbound `password`
    // field is intentionally ignored.

    // Look up email for the target user; generateLink requires an email.
    const { data: target, error: getErr } =
      await admin.auth.admin.getUserById(user_id);
    if (getErr || !target?.user?.email) {
      return jsonResponse(
        { error: getErr?.message ?? "User not found" },
        404,
      );
    }

    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({
        type: "recovery",
        email: target.user.email,
      });
    if (linkErr) {
      return jsonResponse({ error: linkErr.message }, 400);
    }

    const action_link =
      (linkData as any)?.properties?.action_link ?? null;

    return jsonResponse({
      success: true,
      user_id,
      email: target.user.email,
      action_link,
      action_link_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  } catch (e) {
    return jsonResponse(
      { error: (e as Error).message ?? "Unknown error" },
      500,
    );
  }
});