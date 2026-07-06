#!/usr/bin/env python3
"""
RLS decision analyzer — Wave 2.5 Authorization Regression Harness.

Reads live `pg_policies` metadata via `psql` and emits a CSV whose shape
is byte-identical to `docs/../golden_authorization_baseline.csv`. The
analyzer is deterministic and reproduces the same 3,392-cell matrix that
produced the Golden Baseline.

Usage:
    python scripts/authz/analyze_rls.py --out /tmp/current_rls.csv
    python scripts/authz/analyze_rls.py --table invoices
    python scripts/authz/analyze_rls.py --role doctor --cluster Clinical

Requires: `psql` on PATH and PG* env vars set (same as project sandbox).
No SQL is written — SELECT-only against `pg_policies`.
"""
from __future__ import annotations
import argparse, csv, os, re, subprocess, sys
from collections import defaultdict

ROLES = ["admin", "manager", "doctor", "nurse", "receptionist", "hr", "accountant", "staff"]
CMDS = ["SELECT", "INSERT", "UPDATE", "DELETE"]

CLUSTERS = {
    "Clinical": {"patients","medical_records","medical_history","prescriptions","prescription_items","record_diagnoses","record_procedures","dental_chart","patient_documents","vital_signs","treatment_plans","treatment_sessions","physio_cases","physio_sessions","physio_reassessments","diagnoses","medications","procedures","medical_specialties"},
    "Finance": {"invoices","invoice_items","payments","expenses","expense_categories","treasury","treasury_transactions","treasury_daily_closes","coupons","coupon_redemptions","doctor_commissions","patient_wallets","patient_wallet_transactions","insurance_companies","insurance_contracts","insurance_contract_rules","invoice_settings","invoice_counters","po_counters","saas_invoice_counters","payment_methods","loyalty_settings"},
    "Inventory": {"products","product_categories","product_sku_counter","inventory","inventory_transactions","purchase_orders","purchase_order_items","suppliers","stock_alerts","service_consumables"},
    "HR": {"staff_profiles","staff_positions","staff_branches","staff_targets","departments","attendance","leave_requests","leave_types","payroll","performance_reviews","salary_adjustments","work_schedules","employee_id_counter"},
    "Config/Catalog": {"services","service_categories","sms_templates","email_templates","whatsapp_templates","communication_templates","report_schedules","report_templates","clinic_profile","clinic_settings","appointment_settings","notification_settings","system_languages","subscription_plans","subscription_addons"},
    "IAM/Audit": {"role_permissions","user_roles","profiles","authz_permissions","authz_bundles","authz_bundle_permissions","authz_bundle_implies","authz_role_bundles","audit_logs","user_activity_logs","audit_export_presets","saved_reports","system_backups","allowed_signup_emails"},
    "Ops": {"appointments","reminders","notifications","queue_alerts","queue_settings","queue_alert_runs"},
    "SaaS": {"tenants","tenant_addons","tenant_usage","subscriptions","saas_invoices","saas_payments","branches"},
}
CLUSTER_OF = {t: c for c, ts in CLUSTERS.items() for t in ts}

POLICY_DUMP_SQL = (
    "SELECT tablename, policyname, cmd, permissive, "
    "COALESCE(qual,''), COALESCE(with_check,'') "
    "FROM pg_policies WHERE schemaname='public' "
    "ORDER BY tablename, cmd, policyname"
)

# Wave 3 Pilot: resolve every `has_permission(auth.uid(),'<key>')` expression
# by asking the DB which roles reach that permission through the bundle graph.
# `admin` is always in the set because `public.has_permission()` short-circuits
# on `has_role(_user_id,'admin')`. The mapping is captured once per run so the
# analyzer stays deterministic and offline-cacheable.
PERM_ROLES_SQL = """
WITH RECURSIVE role_bundles AS (
  SELECT r.role, rb.bundle_key
    FROM (SELECT unnest(enum_range(NULL::public.app_role)) AS role) r
    JOIN public.authz_role_bundles rb ON rb.role = r.role
  UNION
  SELECT rb.role, bi.child_bundle_key
    FROM role_bundles rb
    JOIN public.authz_bundle_implies bi ON bi.parent_bundle_key = rb.bundle_key
)
SELECT bp.permission_key, rb.role::text
  FROM role_bundles rb
  JOIN public.authz_bundle_permissions bp ON bp.bundle_key = rb.bundle_key
 ORDER BY 1, 2
"""

_PERM_ROLES: dict[str, set[str]] = {}
_HAS_PERM_RE = re.compile(
    r"has_permission\s*\(\s*auth\.uid\(\)\s*,\s*'([^']+)'(?:::text)?\s*\)",
    re.IGNORECASE,
)


def load_perm_roles() -> dict[str, set[str]]:
    if _PERM_ROLES:
        return _PERM_ROLES
    if not os.environ.get("PGHOST"):
        return _PERM_ROLES
    r = subprocess.run(
        ["psql", "-At", "-F", "|", "-c", PERM_ROLES_SQL],
        check=True, capture_output=True, text=True,
    )
    for line in r.stdout.splitlines():
        if "|" not in line:
            continue
        key, role = line.split("|", 1)
        _PERM_ROLES.setdefault(key, set()).add(role)
    # admin bypass baked into public.has_permission()
    for roles in _PERM_ROLES.values():
        roles.add("admin")
    return _PERM_ROLES


def dump_policies() -> list[dict]:
    if not os.environ.get("PGHOST"):
        sys.exit("PGHOST not set — this harness requires managed DB env vars.")
    r = subprocess.run(
        ["psql", "-At", "-F", "|", "-c", POLICY_DUMP_SQL],
        check=True, capture_output=True, text=True,
    )
    out = []
    for line in r.stdout.splitlines():
        parts = line.split("|", 5)
        if len(parts) < 6:
            continue
        table, name, cmd, permissive, qual, wc = parts
        out.append({"table": table, "name": name, "cmd": cmd,
                    "permissive": permissive, "qual": qual, "wc": wc})
    return out


def role_signal(expr: str, role: str) -> str:
    """Return one of: allow, branch, own, deny, none for `role` on `expr`."""
    e = expr or ""
    if not e.strip():
        return "none"
    if e.strip().lower() in ("true", "(true)"):
        return "allow"
    if e.strip().lower() in ("false", "(false)"):
        return "deny"
    has_admin = ("has_role(auth.uid(), 'admin'::app_role)" in e
                 or "has_role(auth.uid(),'admin'::app_role)" in e)
    role_ref = f"'{role}'::app_role" in e
    branch = "user_has_branch_access" in e
    owner = "auth.uid()" in e and re.search(r"auth\.uid\(\)\s*=\s*", e) is not None
    is_tenant = "is_tenant_owner" in e
    # Wave 3: has_permission(auth.uid(),'<key>') — allow for every role whose
    # bundle graph reaches <key> (admin is always included via the bypass).
    perm_keys = _HAS_PERM_RE.findall(e)
    if perm_keys:
        perm_roles = load_perm_roles()
        for k in perm_keys:
            if role in perm_roles.get(k, {"admin"}):
                return "allow"
    if role == "admin" and has_admin:
        return "allow"
    if role_ref and branch:
        return "branch"
    if role_ref:
        return "allow"
    if branch and not role_ref and not has_admin and not owner:
        return "branch"
    if owner and not role_ref:
        return "own"
    if is_tenant:
        return "own"
    return "deny"


def combine(signals: list[str]) -> str:
    order = {"allow": 4, "branch": 3, "own": 2, "deny": 1, "none": 0}
    if not signals:
        return "deny"
    best = max(signals, key=lambda s: order[s])
    return best if best != "none" else "deny"


def build_matrix(policies: list[dict]) -> dict:
    matrix: dict = {}
    tables = sorted({p["table"] for p in policies})
    for t in tables:
        for cmd in CMDS:
            applicable = [p for p in policies if p["table"] == t and p["cmd"] in (cmd, "ALL")]
            for role in ROLES:
                perm, restr = [], []
                for p in applicable:
                    if cmd == "INSERT":
                        expr = p["wc"] or p["qual"]
                    elif cmd == "UPDATE":
                        expr = (f"({p['qual']}) AND ({p['wc']})"
                                if p["wc"] and p["qual"] else (p["qual"] or p["wc"]))
                    else:
                        expr = p["qual"]
                    sig = role_signal(expr, role)
                    (perm if p["permissive"] == "PERMISSIVE" else restr).append(sig)
                result = combine(perm)
                if restr and combine(restr) == "deny":
                    result = "deny"
                matrix[(t, cmd, role)] = result
    return matrix


def write_csv(matrix: dict, path: str, table=None, role=None, cluster=None, cmd=None) -> int:
    tables = sorted({k[0] for k in matrix})
    keep_roles = [role] if role else ROLES
    n = 0
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["table", "operation"] + keep_roles)
        for t in tables:
            if table and t != table: continue
            if cluster and CLUSTER_OF.get(t) != cluster: continue
            for c in CMDS:
                if cmd and c != cmd: continue
                w.writerow([t, c] + [matrix[(t, c, r)] for r in keep_roles])
                n += 1
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/tmp/authz_current_rls.csv")
    ap.add_argument("--table", help="restrict to one table")
    ap.add_argument("--role", choices=ROLES, help="restrict to one role")
    ap.add_argument("--cluster", choices=list(CLUSTERS), help="restrict to one cluster")
    ap.add_argument("--cmd", choices=CMDS, help="restrict to one operation")
    ap.add_argument("--summary", action="store_true")
    a = ap.parse_args()

    policies = dump_policies()
    matrix = build_matrix(policies)
    rows = write_csv(matrix, a.out, table=a.table, role=a.role,
                     cluster=a.cluster, cmd=a.cmd)
    print(f"[analyze_rls] wrote {rows} rows → {a.out}")
    if a.summary:
        counts = defaultdict(int)
        for v in matrix.values():
            counts[v] += 1
        print(f"[analyze_rls] totals: {dict(counts)}  cells={len(matrix)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())