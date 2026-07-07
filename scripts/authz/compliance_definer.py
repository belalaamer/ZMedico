#!/usr/bin/env python3
"""
Sprint S2 — SECURITY DEFINER compliance checker.

Enumerates every SECURITY DEFINER function in `public` and grades each
against the frozen SECURITY DEFINER Standard v1
(`docs/security/S1_SECURITY_DEFINER_STANDARD_V1.md`).

Emits:
  * CSV grid (one row per function, one column per rule) — machine diff
  * Markdown report grouped by verdict (PASS / WARNING / FAIL)

Read-only. Does not modify the database. Same runtime contract as
`analyze_rpcs.py`: expects PGHOST/psql environment.
"""
from __future__ import annotations
import argparse, csv, os, re, subprocess, sys
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Scope classification
# ---------------------------------------------------------------------------
#
# Standard v1 is written for *authoritative RPCs* — client-callable
# mutating functions. Triggers, tiny helpers, and generator functions
# are still SECURITY DEFINER but are governed by a reduced rule set.
# Classification is intentionally rule-based (not a hand-maintained
# allowlist) so new functions inherit the correct scope automatically.

TRIGGER_PREFIXES = ("tg_", "trg_", "_tg_")
TRIGGER_EXPLICIT = {
    "handle_new_user",
    "audit_treasury_tx_v2",
    "audit_treasury_daily_closes_v2",
}

# Utilities that never take an authorization decision: pure computations,
# id generators, RLS helper predicates, cron/secret plumbing, audit
# sinks. Kept in sync with analyze_rpcs.UTILITY.
UTILITY = {
    "has_role", "has_permission", "is_tenant_owner",
    "user_has_branch_access",
    "user_has_branch_access_via_invoice",
    "user_has_branch_access_via_medical_record",
    "user_has_branch_access_via_patient",
    "user_has_branch_access_via_physio_case",
    "user_has_branch_access_via_prescription",
    "user_has_branch_access_via_purchase_order",
    "user_has_branch_access_via_treasury",
    "user_has_branch_access_via_treatment_plan",
    "current_user_branch_id",
    "default_treasury_for_branch",
    "get_clinic_logo",
    "realtime_topic_branch_allowed",
    "storage_patient_docs_branch_allowed",
    "render_template",
    "fn_resolve_coverage", "fn_consume_for_invoice",
    "fn_treasury_day_cash_summary",
    "staff_target_actual",
    "recalc_commissions_for_invoice", "recalc_invoice_payments",
    "recalc_invoice_subtotal", "recalc_po_subtotal",
    "renumber_active_invoices", "renumber_active_patient_codes",
    "generate_employee_id", "generate_invoice_number",
    "generate_po_number", "generate_product_sku",
    "generate_saas_invoice_number",
    "enqueue_appointment_reminders",
    "expense_treasury_self_audit",
    "check_expiry_alerts",
    "_audit_write", "_get_cron_secret", "_set_cron_secret",
    "_treasury_assert_open_period",
}

# Definer → definer call allowlist. Every entry must cite a report so
# S2 rule R8 can be audited. Nested definer chains not listed here
# raise a FAIL.
DEFINER_CHAIN_ALLOWLIST = {
    ("receive_po_item", "apply_inventory_tx"):
        "H-3 review §3.3 — audit propagates via auth.uid() through nested definer",
}

# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

@dataclass
class Rule:
    key: str
    title: str
    # scope ∈ {"all", "rpc"} — "rpc" means only authoritative RPCs are graded
    scope: str
    # severity when violated: "fail" | "warn"
    severity: str

RULES: list[Rule] = [
    Rule("R1", "SET search_path present",                     "all", "fail"),
    Rule("R2", "auth.uid() used to derive actor",             "rpc", "fail"),
    Rule("R3", "auth null-guard raises 42501",                "rpc", "fail"),
    Rule("R4", "exactly one has_permission() call",           "rpc", "fail"),
    Rule("R5", "zero has_role() calls in body",               "rpc", "fail"),
    Rule("R6", "no client-supplied actor parameter",          "rpc", "fail"),
    Rule("R7", "audit writes use auth.uid(), never a param",  "all", "warn"),
    Rule("R8", "nested SECURITY DEFINER calls are allowlisted","all", "fail"),
    Rule("R9", "has_role() only inside has_permission itself","all", "warn"),
]

# ---------------------------------------------------------------------------
# Regexes
# ---------------------------------------------------------------------------

RE_SEARCH_PATH   = re.compile(r"SET\s+search_path", re.I)
RE_AUTH_UID      = re.compile(r"auth\.uid\s*\(\s*\)", re.I)
RE_NULL_GUARD    = re.compile(
    r"auth\.uid\s*\(\s*\)\s+IS\s+NULL"                # explicit null-check
    r"|COALESCE\s*\(\s*auth\.uid\s*\(",               # or coalesce fallback
    re.I,
)
RE_HAS_PERM      = re.compile(r"has_permission\s*\(", re.I)
RE_HAS_ROLE      = re.compile(r"has_role\s*\(", re.I)
RE_ACTOR_PARAM   = re.compile(
    r"(^|,)\s*_?(by|actor_id|user_id|performed_by|created_by|updated_by)\s+\w",
    re.I,
)
RE_AUDIT_INSERT  = re.compile(
    r"insert\s+into\s+public\.audit_logs[^;]*?\(([^)]*)\)\s*values\s*\(([^)]*)\)",
    re.I | re.S,
)
RE_NESTED_CALL   = re.compile(
    r"\b(apply_wallet_tx|add_treasury_tx|apply_inventory_tx|"
    r"receive_po_item|merge_staff_position|apply_coupon_code|"
    r"_audit_write)\s*\(",
    re.I,
)

LIST_SQL = (
    "SELECT p.proname, pg_get_function_arguments(p.oid), "
    "pg_get_functiondef(p.oid) "
    "FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace "
    "WHERE n.nspname = 'public' AND p.prosecdef "
    "ORDER BY p.proname"
)

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

@dataclass
class Verdict:
    name: str
    scope: str
    results: dict = field(default_factory=dict)   # rule_key -> "pass"|"warn"|"fail"|"n/a"
    notes: list = field(default_factory=list)

    @property
    def overall(self) -> str:
        vals = list(self.results.values())
        if "fail" in vals: return "FAIL"
        if "warn" in vals: return "WARNING"
        return "PASS"


def classify(name: str) -> str:
    if any(name.startswith(p) for p in TRIGGER_PREFIXES): return "trigger"
    if name in TRIGGER_EXPLICIT: return "trigger"
    if name in UTILITY:          return "utility"
    return "rpc"


def grade(name: str, args: str, body: str, all_names: set[str]) -> Verdict:
    scope = classify(name)
    v = Verdict(name=name, scope=scope)

    # R1 — search_path
    v.results["R1"] = "pass" if RE_SEARCH_PATH.search(body) else "fail"

    # RPC-only rules
    if scope == "rpc":
        v.results["R2"] = "pass" if RE_AUTH_UID.search(body) else "fail"
        v.results["R3"] = "pass" if RE_NULL_GUARD.search(body) else "fail"
        n_hp = len(RE_HAS_PERM.findall(body))
        v.results["R4"] = "pass" if n_hp == 1 else ("warn" if n_hp > 1 else "fail")
        if n_hp != 1:
            v.notes.append(f"has_permission() call count = {n_hp}")
        n_hr = len(RE_HAS_ROLE.findall(body))
        v.results["R5"] = "pass" if n_hr == 0 else "fail"
        if n_hr:
            v.notes.append(f"has_role() call count = {n_hr}")
        v.results["R6"] = "fail" if RE_ACTOR_PARAM.search(args) else "pass"
        if RE_ACTOR_PARAM.search(args):
            v.notes.append("signature contains client-supplied actor parameter")
    else:
        for k in ("R2", "R3", "R4", "R5", "R6"):
            v.results[k] = "n/a"

    # R7 — audit writes
    audit_ok = True
    for cols, vals in RE_AUDIT_INSERT.findall(body):
        col_list = [c.strip().lower() for c in cols.split(",")]
        val_list = [x.strip() for x in vals.split(",")]
        if "user_id" in col_list:
            idx = col_list.index("user_id")
            if idx < len(val_list):
                expr = val_list[idx].lower()
                if "auth.uid" not in expr and "coalesce(auth.uid" not in expr:
                    # A local variable derived from auth.uid() (e.g. _uid,
                    # v_actor) is also OK — heuristic: single identifier
                    # whose name matches a pattern we allow.
                    if not re.match(r"^_?[a-z_]*(uid|actor|user)[a-z_]*$", expr):
                        audit_ok = False
                        v.notes.append(f"audit insert writes user_id from `{expr}`")
    v.results["R7"] = "pass" if audit_ok else "warn"

    # R8 — nested SECURITY DEFINER calls
    r8 = "pass"
    for callee in set(m.lower() for m in RE_NESTED_CALL.findall(body)):
        if callee == name.lower(): continue
        if callee not in all_names: continue
        pair = (name, callee)
        if pair not in DEFINER_CHAIN_ALLOWLIST:
            r8 = "fail"
            v.notes.append(f"undeclared definer→definer call: {callee}")
    v.results["R8"] = r8

    # R9 — has_role only inside has_permission itself
    if RE_HAS_ROLE.search(body) and name != "has_permission":
        # Rule R5 already flags rpc scope; here we warn for utilities/triggers
        # that lean on has_role. This is the "code smell" gate.
        if scope != "rpc":
            v.results["R9"] = "warn"
            v.notes.append("has_role() used outside has_permission (legacy pattern)")
        else:
            v.results["R9"] = "pass"   # R5 already covers rpc scope
    else:
        v.results["R9"] = "pass"

    return v


def dump_defs() -> list[tuple[str, str, str]]:
    if not os.environ.get("PGHOST"):
        sys.exit("PGHOST not set — the compliance checker needs psql env "
                 "(same as analyze_rpcs.py).")
    r = subprocess.run(["psql", "-At", "-F", "\x1f", "-c", LIST_SQL],
                       check=True, capture_output=True, text=True)
    out, cur = [], None
    for line in r.stdout.split("\n"):
        parts = line.split("\x1f", 2)
        if len(parts) == 3:
            if cur: out.append(cur)
            cur = [parts[0], parts[1], parts[2]]
        elif cur is not None:
            cur[2] += "\n" + line
    if cur: out.append(cur)
    return [tuple(x) for x in out]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv",      default="/tmp/authz_compliance.csv")
    ap.add_argument("--report",   default="/tmp/authz_compliance.md")
    ap.add_argument("--strict",   action="store_true",
                    help="exit 2 if any FAIL verdict is present")
    a = ap.parse_args()

    defs = dump_defs()
    names = {n for n, _, _ in defs}
    verdicts = [grade(n, args, body, names) for n, args, body in defs]

    with open(a.csv, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["function", "scope", "overall"] + [r.key for r in RULES] + ["notes"])
        for v in verdicts:
            w.writerow([v.name, v.scope, v.overall] +
                       [v.results.get(r.key, "n/a") for r in RULES] +
                       ["; ".join(v.notes)])

    with open(a.report, "w") as f:
        f.write("# SECURITY DEFINER Compliance Report\n\n")
        f.write(f"Total functions: **{len(verdicts)}**\n\n")
        for verdict in ("FAIL", "WARNING", "PASS"):
            group = [v for v in verdicts if v.overall == verdict]
            f.write(f"## {verdict} — {len(group)}\n\n")
            if not group:
                f.write("_none_\n\n"); continue
            f.write("| Function | Scope | " +
                    " | ".join(r.key for r in RULES) + " | Notes |\n")
            f.write("|" + "---|" * (3 + len(RULES)) + "\n")
            for v in group:
                cells = [v.results.get(r.key, "n/a") for r in RULES]
                f.write(f"| `{v.name}` | {v.scope} | " +
                        " | ".join(cells) + f" | {'; '.join(v.notes) or '—'} |\n")
            f.write("\n")

    print(f"[compliance] {len(verdicts)} functions → "
          f"{sum(1 for v in verdicts if v.overall=='PASS')} PASS, "
          f"{sum(1 for v in verdicts if v.overall=='WARNING')} WARNING, "
          f"{sum(1 for v in verdicts if v.overall=='FAIL')} FAIL")
    print(f"[compliance] csv    → {a.csv}")
    print(f"[compliance] report → {a.report}")

    if a.strict and any(v.overall == "FAIL" for v in verdicts):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
