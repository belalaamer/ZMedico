import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";
import { requireActiveSession } from "../_shared/active-session.ts";
import { isAdministrator, readUserRoles } from "../_shared/staff-roles.ts";
const MAX_BODY_BYTES = 8 * 1024;

function genTemporaryPassword(len = 32) {
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
    return corsPreflight();
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return jsonResponse({ error: "Request body is too large" }, 413);

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
    const sessionFailure = await requireActiveSession(userClient);
    if (sessionFailure) return sessionFailure;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const callerRoles = await readUserRoles(admin, userData.user.id);
    if (callerRoles.roles === null) {
      return jsonResponse({ error: "Unable to verify administrator access" }, 503);
    }
    if (!isAdministrator(callerRoles.roles)) {
      return jsonResponse({ error: "Forbidden: admin only" }, 403);
    }

    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return jsonResponse({ error: "Request body is too large" }, 413);
    let parsed: unknown;
    try { parsed = JSON.parse(raw || "{}"); } catch { return jsonResponse({ error: "Invalid request" }, 400); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonResponse({ error: "Invalid request" }, 400);
    const body = parsed as Record<string, unknown>;
    const user_id = String(body.user_id ?? "").trim();
    if (!user_id) {
      return jsonResponse({ error: "user_id required" }, 400);
    }
    const suppliedPassword = typeof body.password === "string" && body.password.trim().length >= 6
      ? body.password.trim()
      : null;
    const nextPassword = suppliedPassword ?? genTemporaryPassword(32);

    const callerIsSystemOwner = callerRoles.roles.includes("system_owner");

    const targetRoles = await readUserRoles(admin, user_id);
    if (targetRoles.roles === null) {
      return jsonResponse({ error: "Unable to verify target role" }, 500);
    }
    const targetIsSystemOwner = targetRoles.roles.includes("system_owner");

    if (targetIsSystemOwner && !callerIsSystemOwner) {
      return jsonResponse({ error: "Only the System Owner may reset another System Owner password" }, 403);
    }

    if (!callerIsSystemOwner) {
      const { data: targetBranches, error: branchErr } = await admin
        .from("staff_branches")
        .select("branch_id")
        .eq("user_id", user_id);
      if (branchErr) {
        return jsonResponse({ error: "Unable to verify target branch" }, 500);
      }
      if (!targetBranches?.length) {
        return jsonResponse({ error: "Target user is outside your branch scope" }, 403);
      }

      const { data: callerBranches, error: callerBranchErr } = await admin
        .from("staff_branches")
        .select("branch_id")
        .eq("user_id", userData.user.id);
      if (callerBranchErr) {
        return jsonResponse({ error: "Unable to verify caller branch" }, 500);
      }

      const callerBranchIds = new Set((callerBranches ?? []).map((row) => row.branch_id));
      const inScope = targetBranches.some((row) => callerBranchIds.has(row.branch_id));
      if (!inScope) {
        return jsonResponse({ error: "Target user is outside your branch scope" }, 403);
      }
    }

    // Look up email for the target user so the admin UI can display it with
    // the one-time password returned below.
    const { data: target, error: getErr } =
      await admin.auth.admin.getUserById(user_id);
    if (getErr || !target?.user?.email) {
      return jsonResponse({ error: "User not found" }, 404);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(user_id, {
      password: nextPassword,
      email_confirm: true,
    });
    if (updateErr) {
      return jsonResponse({ error: "Unable to reset password" }, 400);
    }

    return jsonResponse({
      success: true,
      user_id,
      email: target.user.email,
      password: nextPassword,
      password_was_generated: !suppliedPassword,
    });
  } catch {
    return jsonResponse({ error: "Unable to reset password" }, 500);
  }
});
