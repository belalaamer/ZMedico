import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, corsPreflight, jsonResponse } from "../_shared/cors.ts";

const ALLOWED_TABLES = new Set([
  "patients",
  "appointments",
  "invoices",
  "payments",
  "products",
  "medical_records",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();

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
      .in("role", ["admin", "system_owner"])
      .maybeSingle();

    if (roleErr || !roleRow) {
      return json({ error: "Forbidden: administrator access required" }, 403);
    }
    const isSystemOwner = roleRow.role === "system_owner";

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

    const requestId = crypto.randomUUID();
    const branchId = typeof body?.branch_id === "string" && body.branch_id.trim()
      ? body.branch_id.trim()
      : null;

    if (!isSystemOwner && !branchId) {
      return json({ error: "branch_id is required for branch administrators" }, 400);
    }

    if (branchId && !isSystemOwner) {
      const { data: branchLink, error: branchLinkErr } = await admin
        .from("staff_branches")
        .select("branch_id")
        .eq("user_id", userData.user.id)
        .eq("branch_id", branchId)
        .maybeSingle();
      if (branchLinkErr || !branchLink) {
        return json({ error: "Requested branch is outside your scope" }, 403);
      }
    }

    const startedAt = new Date().toISOString();
    // Pre-export audit record: written BEFORE any data is read so a caller
    // cannot exfiltrate data without leaving a trail. Row counts are
    // filled into new_values after each table read.
    const rowCounts: Record<string, number> = {};
    await admin.from("audit_logs").insert({
      user_id: userData.user.id,
      branch_id: branchId,
      action: "admin_export",
      entity_type: "bulk_export",
      entity_id: null,
      new_values: {
        request_id: requestId,
        mode,
        tables,
        started_at: startedAt,
        row_counts: rowCounts,
      },
    });

    const out: Record<string, unknown[]> = {};
    let branchProductIds: string[] | null = null;

    if (branchId && tables.includes("products")) {
      const { data: inventoryRows, error: inventoryErr } = await admin
        .from("inventory")
        .select("product_id")
        .eq("branch_id", branchId)
        .not("product_id", "is", null)
        .limit(10000);
      if (inventoryErr) return json({ error: "Failed to resolve branch products" }, 500);
      branchProductIds = Array.from(new Set((inventoryRows ?? []).map((row) => row.product_id).filter(Boolean)));
    }

    for (const tbl of tables) {
      let query = admin.from(tbl).select("*");

      if (branchId) {
        if (tbl === "products") {
          if (!branchProductIds?.length) {
            out[tbl] = [];
            rowCounts[tbl] = 0;
            continue;
          }
          query = query.in("id", branchProductIds);
        } else {
          query = query.eq("branch_id", branchId);
        }
      }

      const { data, error } = await query.limit(10000);
      if (error) return json({ error: `Failed to read ${tbl}` }, 500);
      out[tbl] = data ?? [];
      rowCounts[tbl] = (data ?? []).length;
    }

    // Post-export audit update: capture final row counts + completion time.
    // Best-effort — a failure here does not affect the caller's response.
    await admin.from("audit_logs").insert({
      user_id: userData.user.id,
      branch_id: branchId,
      action: "admin_export_complete",
      entity_type: "bulk_export",
      entity_id: null,
      new_values: {
        request_id: requestId,
        mode,
        tables,
        row_counts: rowCounts,
        completed_at: new Date().toISOString(),
      },
    });

    return json({ data: out });
  } catch (_e) {
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return jsonResponse(body, status);
}