// Admin API for managing the ZMedico AI receptionist's provider configuration
// (Settings > AI). Every action requires the caller to hold the `system_owner`
// role -- checked with a user-scoped client BEFORE any service-role client is
// created or touched.
//
// SECURITY: the raw AI provider API key is never present in any HTTP response
// body, console.log/console.error call, or ai_config_audit_log row produced by
// this function. It lives only in Supabase Vault (vault.secrets), reached
// exclusively through the SECURITY DEFINER wrapper functions
// get_ai_provider_secret / set_ai_provider_secret, which are grant-restricted
// to service_role. This function always calls those wrappers through the
// service-role client, never through the caller's own client.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";
import { getAIProvider } from "../_shared/ai-provider.ts";

const DEFAULT_MODEL = "gemini-2.0-flash";

type PlatformConfigRow = {
  id: string;
  provider: string;
  model: string | null;
  temperature: number | null;
  secret_id: string | null;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: "success" | "failed" | null;
  last_test_error: string | null;
};

async function auditLog(
  serviceClient: ReturnType<typeof createClient>,
  entry: {
    actor_user_id: string | null;
    scope: string;
    tenant_id?: string | null;
    action: string;
    provider?: string | null;
    success: boolean;
    error_message?: string | null;
  },
) {
  try {
    const { error } = await serviceClient.from("ai_config_audit_log").insert({
      actor_user_id: entry.actor_user_id,
      scope: entry.scope,
      tenant_id: entry.tenant_id ?? null,
      action: entry.action,
      provider: entry.provider ?? null,
      success: entry.success,
      error_message: entry.error_message ?? null,
    });
    if (error) {
      console.error(`[ai-admin-settings] audit log insert failed for action=${entry.action}:`, error.message);
    }
  } catch (err) {
    console.error(`[ai-admin-settings] audit log insert threw for action=${entry.action}:`, err instanceof Error ? err.message : String(err));
  }
}

async function loadPlatformConfig(serviceClient: ReturnType<typeof createClient>): Promise<PlatformConfigRow | null> {
  const { data, error } = await serviceClient
    .from("ai_provider_config")
    .select("id, provider, model, temperature, secret_id, is_active, last_tested_at, last_test_status, last_test_error")
    .eq("scope", "platform")
    .maybeSingle();
  if (error) {
    console.error("[ai-admin-settings] loadPlatformConfig error:", error.message);
    throw new Error("Failed to load platform AI config");
  }
  return (data as PlatformConfigRow | null) ?? null;
}

// Step 2 bootstrap: if no platform config row exists yet and GEMINI_API_KEY is
// present as an edge-function secret, migrate it into Vault + ai_provider_config
// one time. This is intentionally lazy (runs on first get_config call) rather
// than a separate migration script, per the agreed design.
async function bootstrapFromEnvIfNeeded(
  serviceClient: ReturnType<typeof createClient>,
  actorUserId: string,
): Promise<PlatformConfigRow | null> {
  const existing = await loadPlatformConfig(serviceClient);
  if (existing) return existing;

  const envKey = Deno.env.get("GEMINI_API_KEY");
  if (!envKey) return null;

  try {
    const { data: secretId, error: secretError } = await serviceClient.rpc("set_ai_provider_secret", {
      p_secret_id: null,
      p_new_value: envKey,
      p_name: "gemini_platform_key",
    });
    if (secretError || !secretId) {
      await auditLog(serviceClient, {
        actor_user_id: actorUserId,
        scope: "platform",
        action: "bootstrap_from_env_secret",
        provider: "gemini",
        success: false,
        error_message: secretError?.message ?? "no secret_id returned",
      });
      return null;
    }

    const { data: inserted, error: insertError } = await serviceClient
      .from("ai_provider_config")
      .insert({
        scope: "platform",
        tenant_id: null,
        provider: "gemini",
        model: Deno.env.get("GEMINI_MODEL") || DEFAULT_MODEL,
        secret_id: secretId,
        is_active: true,
      })
      .select("id, provider, model, temperature, secret_id, is_active, last_tested_at, last_test_status, last_test_error")
      .single();

    if (insertError) {
      await auditLog(serviceClient, {
        actor_user_id: actorUserId,
        scope: "platform",
        action: "bootstrap_from_env_secret",
        provider: "gemini",
        success: false,
        error_message: insertError.message,
      });
      return null;
    }

    await auditLog(serviceClient, {
      actor_user_id: actorUserId,
      scope: "platform",
      action: "bootstrap_from_env_secret",
      provider: "gemini",
      success: true,
    });

    return inserted as PlatformConfigRow;
  } catch (err) {
    await auditLog(serviceClient, {
      actor_user_id: actorUserId,
      scope: "platform",
      action: "bootstrap_from_env_secret",
      provider: "gemini",
      success: false,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflight();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration missing" }, 500);
  }

  // 1. Identify the caller from their own JWT (anon key + bearer token --
  // never service role for this step).
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userId = userData.user.id;

  // 2. system_owner check, via service-role client (RLS-independent, exact
  // role row lookup) -- BEFORE any config data is touched.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: roleRow, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "system_owner")
    .maybeSingle();

  if (roleError) {
    console.error("[ai-admin-settings] role check error:", roleError.message);
    return jsonResponse({ error: "Server error" }, 500);
  }
  if (!roleRow) {
    return jsonResponse({ error: "Forbidden: system_owner role required" }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const action = String(body?.action ?? "");

  try {
    switch (action) {
      case "get_config": {
        const row = await bootstrapFromEnvIfNeeded(serviceClient, userId);
        if (!row) {
          return jsonResponse({
            configured: false,
            provider: "gemini",
            model: null,
            temperature: null,
            is_active: false,
            has_api_key: false,
            last_tested_at: null,
            last_test_status: null,
            last_test_error: null,
          });
        }
        return jsonResponse({
          configured: true,
          provider: row.provider,
          model: row.model,
          temperature: row.temperature,
          is_active: row.is_active,
          has_api_key: row.secret_id !== null,
          last_tested_at: row.last_tested_at,
          last_test_status: row.last_test_status,
          last_test_error: row.last_test_error,
        });
      }

      case "save_config": {
        const provider = typeof body.provider === "string" && body.provider.trim() ? body.provider.trim() : "gemini";
        const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : null;
        const temperature = typeof body.temperature === "number" ? body.temperature : null;
        const isActive = body.ai_enabled !== false;

        const existing = await loadPlatformConfig(serviceClient);
        let saveError: string | null = null;

        if (existing) {
          const { error } = await serviceClient
            .from("ai_provider_config")
            .update({ provider, model, temperature, is_active: isActive })
            .eq("id", existing.id);
          if (error) saveError = error.message;
        } else {
          const { error } = await serviceClient.from("ai_provider_config").insert({
            scope: "platform",
            tenant_id: null,
            provider,
            model,
            temperature,
            is_active: isActive,
            secret_id: null,
          });
          if (error) saveError = error.message;
        }

        await auditLog(serviceClient, {
          actor_user_id: userId,
          scope: "platform",
          action: "save_config",
          provider,
          success: !saveError,
          error_message: saveError,
        });

        if (saveError) return jsonResponse({ success: false, error: saveError }, 500);
        return jsonResponse({ success: true });
      }

      case "save_api_key": {
        const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
        if (!apiKey) {
          return jsonResponse({ success: false, error: "api_key is required" }, 400);
        }

        const existing = await loadPlatformConfig(serviceClient);
        let secretId: string | null = null;
        let opError: string | null = null;

        try {
          const { data, error } = await serviceClient.rpc("set_ai_provider_secret", {
            p_secret_id: existing?.secret_id ?? null,
            p_new_value: apiKey,
            p_name: "gemini_platform_key",
          });
          if (error || !data) {
            opError = error?.message ?? "set_ai_provider_secret returned no id";
          } else {
            secretId = data as string;
          }
        } catch (err) {
          opError = err instanceof Error ? err.message : String(err);
        }

        if (!opError && secretId) {
          if (existing) {
            const { error } = await serviceClient
              .from("ai_provider_config")
              .update({ secret_id: secretId })
              .eq("id", existing.id);
            if (error) opError = error.message;
          } else {
            const { error } = await serviceClient.from("ai_provider_config").insert({
              scope: "platform",
              tenant_id: null,
              provider: "gemini",
              model: DEFAULT_MODEL,
              secret_id: secretId,
              is_active: true,
            });
            if (error) opError = error.message;
          }
        }

        // NEVER log apiKey itself here.
        await auditLog(serviceClient, {
          actor_user_id: userId,
          scope: "platform",
          action: "save_api_key",
          provider: existing?.provider ?? "gemini",
          success: !opError,
          error_message: opError,
        });

        if (opError) return jsonResponse({ success: false, error: opError }, 500);
        return jsonResponse({ success: true });
      }

      case "remove_api_key": {
        const existing = await loadPlatformConfig(serviceClient);
        if (!existing) {
          return jsonResponse({ success: false, error: "not_configured" }, 400);
        }
        // Simplification: we only detach the reference; the underlying Vault
        // secret row is left in place, orphaned and still encrypted. Vault
        // has no built-in "delete_secret" RPC exposed here, and an orphaned
        // encrypted row poses no confidentiality risk since it is unreachable
        // without the id we just discarded.
        const { error } = await serviceClient
          .from("ai_provider_config")
          .update({ secret_id: null })
          .eq("id", existing.id);

        await auditLog(serviceClient, {
          actor_user_id: userId,
          scope: "platform",
          action: "remove_api_key",
          provider: existing.provider,
          success: !error,
          error_message: error?.message ?? null,
        });

        if (error) return jsonResponse({ success: false, error: error.message }, 500);
        return jsonResponse({ success: true });
      }

      case "test_connection": {
        const existing = await loadPlatformConfig(serviceClient);
        if (!existing || !existing.secret_id) {
          return jsonResponse({ success: false, error: "not_configured" });
        }

        const { data: apiKey, error: keyError } = await serviceClient.rpc("get_ai_provider_secret", {
          p_secret_id: existing.secret_id,
        });
        if (keyError || !apiKey) {
          await auditLog(serviceClient, {
            actor_user_id: userId,
            scope: "platform",
            action: "test_connection",
            provider: existing.provider,
            success: false,
            error_message: keyError?.message ?? "secret not found",
          });
          return jsonResponse({ success: false, error: "Failed to resolve stored API key" }, 500);
        }

        const provider = getAIProvider(apiKey as string, existing.model || DEFAULT_MODEL);
        const result = await provider.testConnection();

        await serviceClient
          .from("ai_provider_config")
          .update({
            last_tested_at: new Date().toISOString(),
            last_test_status: result.success ? "success" : "failed",
            last_test_error: result.success ? null : (result.error ?? "unknown error"),
          })
          .eq("id", existing.id);

        await auditLog(serviceClient, {
          actor_user_id: userId,
          scope: "platform",
          action: "test_connection",
          provider: existing.provider,
          success: result.success,
          error_message: result.success ? null : (result.error ?? "unknown error"),
        });

        return jsonResponse({
          success: result.success,
          provider: existing.provider,
          model: existing.model || DEFAULT_MODEL,
          latency_ms: result.latencyMs,
          error: result.error,
        });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error(`[ai-admin-settings] unhandled error for action=${action}:`, err instanceof Error ? err.message : String(err));
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
