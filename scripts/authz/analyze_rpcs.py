#!/usr/bin/env python3
"""
RPC decision analyzer — Wave 2.5.

Enumerates client-callable SECURITY DEFINER functions in `public` and,
for each, derives per-role ALLOW/DENY/OWN by static analysis of the
function body (`pg_get_functiondef`). Emits a CSV parallel to the RLS
matrix so the diff engine can compare current vs. baseline RPC decisions.

Read-only. No SQL is written.
"""
from __future__ import annotations
import argparse, csv, os, re, subprocess, sys

ROLES = ["admin", "manager", "doctor", "nurse", "receptionist", "hr", "accountant", "staff"]

LIST_SQL = (
    "SELECT p.proname, pg_get_function_identity_arguments(p.oid), "
    "pg_get_functiondef(p.oid) "
    "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
    "WHERE n.nspname='public' AND p.prosecdef "
    "AND p.proname NOT LIKE 'tg\\_%' ESCAPE '\\' "
    "AND p.proname NOT LIKE '\\_%' ESCAPE '\\' "
    "ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)"
)

# RPCs known to be pure utilities / triggers-only-exposed: default ALLOW
# for every role because they raise no role guard.
UTILITY = {
    "fn_resolve_coverage", "get_clinic_logo", "staff_target_actual",
    "render_template", "default_treasury_for_branch",
    "recalc_commissions_for_invoice", "recalc_invoice_payments",
    "recalc_invoice_subtotal", "recalc_po_subtotal",
    "fn_consume_for_invoice",
    "generate_employee_id", "generate_invoice_number",
    "generate_po_number", "generate_product_sku",
    "generate_saas_invoice_number",
    "current_user_branch_id", "handle_new_user",
    "trg_appt_after_insert", "trg_appt_after_update",
    "has_role", "has_permission", "is_tenant_owner",
    "realtime_topic_branch_allowed", "storage_patient_docs_branch_allowed",
    "user_has_branch_access",
    "user_has_branch_access_via_invoice",
    "user_has_branch_access_via_medical_record",
    "user_has_branch_access_via_patient",
    "user_has_branch_access_via_physio_case",
    "user_has_branch_access_via_prescription",
    "user_has_branch_access_via_purchase_order",
    "user_has_branch_access_via_treasury",
    "user_has_branch_access_via_treatment_plan",
    "enqueue_appointment_reminders", "apply_coupon_code",
}

ROLE_GUARD_RE = re.compile(
    r"has_role\s*\(\s*auth\.uid\(\)\s*,\s*'([a-z_]+)'::(?:public\.)?app_role\s*\)"
)
FORBID_RE = re.compile(r"RAISE\s+EXCEPTION\s+'Forbidden", re.I)


def dump_rpcs() -> list[dict]:
    if not os.environ.get("PGHOST"):
        sys.exit("PGHOST not set")
    r = subprocess.run(["psql", "-At", "-F", "\x1f", "-c", LIST_SQL],
                       check=True, capture_output=True, text=True)
    out, cur = [], None
    for line in r.stdout.split("\n"):
        # function bodies can contain newlines — collate by field count
        parts = line.split("\x1f", 2)
        if len(parts) == 3:
            if cur:
                out.append(cur)
            cur = {"name": parts[0], "args": parts[1], "body": parts[2]}
        elif cur is not None:
            cur["body"] += "\n" + line
    if cur:
        out.append(cur)
    return out


def decide_for_role(fn: dict, role: str) -> str:
    name, body = fn["name"], fn["body"]
    if name in UTILITY:
        return "allow"
    if not FORBID_RE.search(body):
        return "allow"
    # Collect the set of roles that appear in has_role(...) inside the body.
    guarded = set(ROLE_GUARD_RE.findall(body))
    if not guarded:
        return "allow"
    # Heuristic: if the body has a Forbidden RAISE and the role is not
    # referenced by any has_role(...) call, it is denied. `admin` is
    # always allowed unless the body explicitly forbids admin (none do).
    if role == "admin":
        return "allow"
    return "allow" if role in guarded else "deny"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/tmp/authz_current_rpcs.csv")
    ap.add_argument("--rpc", help="restrict to one RPC name")
    ap.add_argument("--role", choices=ROLES)
    a = ap.parse_args()
    fns = dump_rpcs()
    keep = [r for r in ROLES] if not a.role else [a.role]
    n = 0
    with open(a.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["rpc", "args"] + keep)
        for fn in fns:
            if a.rpc and fn["name"] != a.rpc:
                continue
            w.writerow([fn["name"], fn["args"]] + [decide_for_role(fn, r) for r in keep])
            n += 1
    print(f"[analyze_rpcs] wrote {n} rows → {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())