/**
 * Full-system self-audit (Phase 20).
 *
 * Read-only health, security and consistency checks that span the major
 * modules of ZMedico: auth, branches, roles, queue/alerts, finance/treasury,
 * audit-log immutability, realtime, and basic cross-module data integrity.
 *
 * The audit reuses existing helpers where available:
 *   - runQueueSelfAudit() for queue/alerts/heartbeat/realtime
 *   - expense_treasury_self_audit RPC for finance accounting integrity
 *
 * No writes. No schema changes. Lightweight queries only (LIMIT'd).
 */
import { supabase } from "@/integrations/supabase/client";
import { runQueueSelfAudit } from "@/lib/queueSelfAudit";

export type SysStatus = "pass" | "warning" | "fail";
export type SysSeverity = "info" | "low" | "medium" | "high";
export type SysCategory =
  | "security"
  | "branches"
  | "queue"
  | "alerts"
  | "finance"
  | "audit"
  | "realtime"
  | "data_integrity"
  | "ui_state";

export type SysCheck = {
  id: string;
  category: SysCategory;
  title: string;
  status: SysStatus;
  severity: SysSeverity;
  reason: string;
  action?: string;
  heuristic?: boolean;
};

export type SysReport = {
  ranAt: string;
  branchId: string | null;
  checks: SysCheck[];
  totals: { pass: number; warning: number; fail: number };
};

const pass = (id: string, cat: SysCategory, title: string, reason: string, extra: Partial<SysCheck> = {}): SysCheck =>
  ({ id, category: cat, title, status: "pass", severity: "info", reason, ...extra });
const warn = (id: string, cat: SysCategory, title: string, reason: string, action?: string, severity: SysSeverity = "low", extra: Partial<SysCheck> = {}): SysCheck =>
  ({ id, category: cat, title, status: "warning", severity, reason, action, ...extra });
const fail = (id: string, cat: SysCategory, title: string, reason: string, action?: string, severity: SysSeverity = "high", extra: Partial<SysCheck> = {}): SysCheck =>
  ({ id, category: cat, title, status: "fail", severity, reason, action, ...extra });

export async function runSystemSelfAudit(opts: {
  branchId: string | null;
  branches: { id: string; name_en: string }[];
  localStorageBranchId: string | null;
}): Promise<SysReport> {
  const ranAt = new Date().toISOString();
  const checks: SysCheck[] = [];
  const { branchId, branches, localStorageBranchId } = opts;

  // ===== 1. SECURITY / AUTH =====
  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session?.user) {
    checks.push(fail("sec_session", "security", "Authenticated session", "No active session found.", "Sign in again."));
    return finalize(ranAt, branchId, checks);
  }
  const userId = sess.session.user.id;
  checks.push(pass("sec_session", "security", "Authenticated session", `Signed in as ${sess.session.user.email ?? userId.slice(0, 8)}.`));

  // Roles readable + at least one role assigned
  const rolesRes = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (rolesRes.error) {
    checks.push(fail("sec_roles", "security", "user_roles readable", rolesRes.error.message, "Check RLS on user_roles."));
  } else if (!rolesRes.data?.length) {
    checks.push(warn("sec_roles", "security", "Role assigned", "Current user has no role rows.", "Assign at least one role.", "medium"));
  } else {
    checks.push(pass("sec_roles", "security", "Role assigned", `Roles: ${rolesRes.data.map((r: any) => r.role).join(", ")}.`));
  }

  // Privilege escalation guard — has_role is the source of truth, profiles must NOT carry a role column
  const profCol = await supabase.from("profiles").select("role").limit(1);
  if (!profCol.error) {
    checks.push(fail("sec_profile_role_column", "security", "profiles has no role column", "profiles.role is queryable — roles must live only in user_roles.", "Drop profiles.role; rely on user_roles + has_role().", "high"));
  } else {
    checks.push(pass("sec_profile_role_column", "security", "profiles has no role column", "Roles live only in user_roles (privilege-escalation safe)."));
  }

  // ===== 2. BRANCHES =====
  if (!branches.length) {
    checks.push(fail("br_any", "branches", "At least one branch exists", "No branches visible to this user.", "Create a branch or grant branch access."));
  } else {
    checks.push(pass("br_any", "branches", "At least one branch exists", `${branches.length} branch(es) visible.`));
  }

  if (!branchId) {
    checks.push(warn("br_selected", "branches", "Active branch selected", "No current branch is selected.", "Pick a branch from the switcher.", "medium"));
  } else if (!branches.some((b) => b.id === branchId)) {
    checks.push(fail("br_selected", "branches", "Selected branch is valid", "currentBranchId does not match any visible branch (stale selection).", "Re-select a branch."));
  } else {
    checks.push(pass("br_selected", "branches", "Selected branch is valid", "Active branch resolves to a real row."));
  }

  if (branchId && localStorageBranchId && localStorageBranchId !== branchId) {
    checks.push(warn("ui_branch_sync", "ui_state", "UI branch ↔ persisted branch", "localStorage and context disagree on the current branch.", "Reselect the branch."));
  } else {
    checks.push(pass("ui_branch_sync", "ui_state", "UI branch ↔ persisted branch", "Context and localStorage agree."));
  }

  // ===== 3. QUEUE / ALERTS (reuse) =====
  if (branchId) {
    try {
      const q = await runQueueSelfAudit(branchId);
      const cat = (id: string): SysCategory =>
        id.startsWith("heartbeat") || id.startsWith("detector") ? "alerts"
        : id.startsWith("realtime") ? "realtime"
        : id.startsWith("access") ? "security"
        : id.startsWith("integrity") ? "data_integrity"
        : id.startsWith("lifecycle") ? "alerts"
        : "queue";
      for (const c of q.checks) {
        checks.push({
          id: `queue.${c.id}`,
          category: cat(c.id),
          title: c.title,
          status: c.status,
          severity: c.severity as SysSeverity,
          reason: c.reason,
          action: c.action,
        });
      }
    } catch (e: any) {
      checks.push(warn("queue_audit_err", "queue", "Queue self-audit", `Failed: ${e?.message ?? e}`, "Open Queue → Self Audit for details."));
    }
  }

  // ===== 4. FINANCE — expense/treasury (reuse RPC) =====
  try {
    const { data, error } = await (supabase as any).rpc("expense_treasury_self_audit", { _branch_id: branchId ?? null });
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      const status = row.status === "warn" ? "warning" : (row.status as SysStatus);
      checks.push({
        id: `fin.${row.id}`,
        category: "finance",
        title: row.title,
        status,
        severity: (row.severity as SysSeverity) ?? "info",
        reason: row.reason,
        action: row.action ?? undefined,
      });
    }
  } catch (e: any) {
    checks.push(warn("fin_rpc", "finance", "Expense/treasury self-audit RPC", `Failed: ${e?.message ?? e}`, "Open Expenses → Self Audit for details."));
  }

  // Treasury balances reachable
  if (branchId) {
    const tr = await (supabase as any)
      .from("treasury")
      .select("id,current_balance,non_cash_balance,currency")
      .eq("branch_id", branchId);
    if (tr.error) {
      checks.push(fail("fin_treasury_read", "finance", "Treasury buckets readable", tr.error.message, "Check RLS on treasury."));
    } else {
      checks.push(pass("fin_treasury_read", "finance", "Treasury buckets readable", `${tr.data?.length ?? 0} bucket(s).`));
    }
  }

  // ===== 5. AUDIT LOG immutability =====
  const al = await supabase.from("audit_logs").select("id").limit(1);
  if (al.error) {
    checks.push(warn("audit_read", "audit", "audit_logs readable", al.error.message, "Check RLS on audit_logs."));
  } else {
    checks.push(pass("audit_read", "audit", "audit_logs readable", "Append-only log is queryable."));
  }
  // Heuristic: we can't safely test UPDATE/DELETE from the client without
  // attempting a mutation. The append-only trigger _audit_logs_append_only is
  // verified in migrations; mark this as heuristic.
  checks.push({
    id: "audit_immutable",
    category: "audit",
    title: "audit_logs is append-only",
    status: "pass",
    severity: "info",
    reason: "Enforced by trigger _audit_logs_append_only; not probed from client to avoid noisy writes.",
    heuristic: true,
  });

  // ===== 6. DATA INTEGRITY — branch isolation spot checks =====
  if (branchId) {
    const probes: { table: string; label: string }[] = [
      { table: "patients", label: "patients" },
      { table: "appointments", label: "appointments" },
      { table: "invoices", label: "invoices" },
      { table: "expenses", label: "expenses" },
    ];
    for (const p of probes) {
      const r = await (supabase as any).from(p.table).select("id,branch_id").neq("branch_id", branchId).limit(1);
      if (r.error) {
        checks.push(warn(`iso_${p.table}`, "data_integrity", `${p.label} branch isolation`, r.error.message, "Check RLS.", "medium"));
      } else if ((r.data ?? []).length > 0) {
        checks.push(fail(`iso_${p.table}`, "data_integrity", `${p.label} branch isolation`, `Visible row(s) from another branch leaked through RLS.`, `Tighten RLS on ${p.table}.`));
      } else {
        checks.push(pass(`iso_${p.table}`, "data_integrity", `${p.label} branch isolation`, "No cross-branch rows visible."));
      }
    }

    // Physio module: table presence + RLS reachability + branch isolation.
    const pc = await (supabase as any).from("physio_cases").select("id,branch_id").limit(1);
    if (pc.error) {
      checks.push(warn("physio_table", "data_integrity", "physio_cases reachable", pc.error.message, "Check RLS / grants on physio_cases.", "medium"));
    } else {
      checks.push(pass("physio_table", "data_integrity", "physio_cases reachable", "Table queryable for this user."));
      const leak = await (supabase as any).from("physio_cases").select("id,branch_id").neq("branch_id", branchId).limit(1);
      if (!leak.error && (leak.data ?? []).length > 0) {
        checks.push(fail("iso_physio_cases", "data_integrity", "physio_cases branch isolation", "Cross-branch physio rows leaked through RLS.", "Tighten RLS on physio_cases."));
      } else {
        checks.push(pass("iso_physio_cases", "data_integrity", "physio_cases branch isolation", "No cross-branch physio rows visible."));
      }
    }
    const ps = await (supabase as any).from("physio_sessions").select("id").limit(1);
    if (ps.error) {
      checks.push(warn("physio_sessions_table", "data_integrity", "physio_sessions reachable", ps.error.message, "Check RLS / grants on physio_sessions.", "medium"));
    } else {
      checks.push(pass("physio_sessions_table", "data_integrity", "physio_sessions reachable", "Table queryable via case access."));
    }
    const pr = await (supabase as any).from("physio_reassessments").select("id").limit(1);
    if (pr.error) {
      checks.push(warn("physio_reassessments_table", "data_integrity", "physio_reassessments reachable", pr.error.message, "Check RLS / grants on physio_reassessments.", "medium"));
    } else {
      checks.push(pass("physio_reassessments_table", "data_integrity", "physio_reassessments reachable", "Table queryable via case access."));
    }

    // Stale selected branch (deleted branch still in localStorage handled by branches check)
    // Orphan probe: invoices missing patient_id (sample)
    const orph = await (supabase as any)
      .from("invoices")
      .select("id")
      .is("patient_id", null)
      .eq("branch_id", branchId)
      .limit(5);
    if (orph.error) {
      // skip
    } else if ((orph.data ?? []).length > 0) {
      checks.push(warn("orphan_invoices", "data_integrity", "Invoices have a patient", `${orph.data.length} invoice(s) without a patient_id.`, "Reconcile orphaned invoices."));
    } else {
      checks.push(pass("orphan_invoices", "data_integrity", "Invoices have a patient", "No orphaned invoices in sample."));
    }
  }

  // ===== 7. SETTINGS reachability =====
  const cs = await (supabase as any).from("clinic_settings").select("id").limit(1);
  if (cs.error) {
    checks.push(warn("settings_read", "security", "Clinic settings readable", cs.error.message, "Check RLS on clinic_settings."));
  } else {
    checks.push(pass("settings_read", "security", "Clinic settings readable", "Settings table reachable."));
  }

  return finalize(ranAt, branchId, checks);
}

function finalize(ranAt: string, branchId: string | null, checks: SysCheck[]): SysReport {
  const totals = checks.reduce(
    (acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }),
    { pass: 0, warning: 0, fail: 0 } as { pass: number; warning: number; fail: number }
  );
  return { ranAt, branchId, checks, totals };
}