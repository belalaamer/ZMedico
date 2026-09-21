import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

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
    const suppliedPassword = typeof body.password === "string" && body.password.trim().length >= 6
      ? body.password.trim()
      : null;
    const nextPassword = suppliedPassword ?? genTemporaryPassword(32);

    const { data: callerIsSystemOwner, error: callerOwnerErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "system_owner",
    });
    if (callerOwnerErr) {
      return jsonResponse({ error: "Unable to verify caller scope" }, 500);
    }

    const { data: targetIsSystemOwner, error: targetOwnerErr } = await admin.rpc("has_role", {
      _user_id: user_id,
      _role: "system_owner",
    });
    if (targetOwnerErr) {
      return jsonResponse({ error: "Unable to verify target role" }, 500);
    }

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

      let inScope = false;
      for (const row of targetBranches) {
        const { data: allowed, error: scopeErr } = await admin.rpc("user_has_branch_access_for_user", {
          _user_id: userData.user.id,
          _branch: row.branch_id,
        });
        if (scopeErr) {
          return jsonResponse({ error: "Unable to verify branch scope" }, 500);
        }
        if (allowed === true) {
          inScope = true;
          break;
        }
      }
      if (!inScope) {
        return jsonResponse({ error: "Target user is outside your branch scope" }, 403);
      }
    }

    // Look up email for the target user so the admin UI can display it with
    // the one-time password returned below.
    const { data: target, error: getErr } =
      await admin.auth.admin.getUserById(user_id);
    if (getErr || !target?.user?.email) {
      return jsonResponse(
        { error: getErr?.message ?? "User not found" },
        404,
      );
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(user_id, {
      password: nextPassword,
      email_confirm: true,
    });
    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, 400);
    }

    return jsonResponse({
      success: true,
      user_id,
      email: target.user.email,
      password: nextPassword,
      password_was_generated: !suppliedPassword,
    });
  } catch (e) {
    return jsonResponse(
      { error: (e as Error).message ?? "Unknown error" },
      500,
    );
  }
});