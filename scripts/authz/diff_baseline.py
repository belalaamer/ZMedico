#!/usr/bin/env python3
"""
Authorization Diff Engine — Wave 2.5.

Diffs a freshly-produced RLS/RPC decision CSV against the Golden
Authorization Baseline and classifies every changed cell as one of:

    UNCHANGED
    ALLOW → DENY        (regression / hardening)
    DENY  → ALLOW       (regression / loosening — HIGH severity)
    ALLOW → BRANCH      (tightening)
    BRANCH → ALLOW      (loosening)
    ALLOW → OWN         (tightening)
    OWN → ALLOW         (loosening)
    BRANCH → DENY       (tightening)
    DENY → BRANCH       (loosening)
    OWN → DENY          (tightening)
    DENY → OWN          (loosening)
    BRANCH → OWN / OWN → BRANCH (lateral — review required)

Exit codes:
    0 = no changes, or every change appears in the --intentional file
    2 = unlabeled changes present (fails CI)
    1 = usage / I/O error

Intentional-change file format (one per line, `#` comments allowed):
    table,operation,role,expected_from,expected_to
    rpc:<name>,-,role,expected_from,expected_to
"""
from __future__ import annotations
import argparse, csv, os, sys
from collections import defaultdict

ROLES = ["admin", "manager", "doctor", "nurse", "receptionist", "hr", "accountant", "staff"]

SEVERITY = {
    ("deny", "allow"): "HIGH",
    ("own", "allow"): "HIGH",
    ("branch", "allow"): "HIGH",
    ("deny", "branch"): "MED",
    ("deny", "own"): "MED",
    ("allow", "deny"): "MED",
    ("allow", "branch"): "LOW",
    ("allow", "own"): "LOW",
    ("branch", "deny"): "LOW",
    ("own", "deny"): "LOW",
    ("branch", "own"): "LOW",
    ("own", "branch"): "LOW",
}


def load_matrix(path: str, keyfn) -> dict:
    m = {}
    with open(path) as f:
        rdr = csv.reader(f)
        header = next(rdr)
        roles = header[2:]
        for row in rdr:
            for i, role in enumerate(roles):
                m[keyfn(row[0], row[1], role)] = row[2 + i]
    return m


def load_intentional(path: str) -> set:
    if not path or not os.path.exists(path):
        return set()
    out = set()
    with open(path) as f:
        for line in f:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) != 5:
                continue
            out.add(tuple(parts))
    return out


def diff_matrices(base: dict, cur: dict) -> list[tuple]:
    changes = []
    keys = set(base) | set(cur)
    for k in sorted(keys):
        b = base.get(k, "MISSING")
        c = cur.get(k, "MISSING")
        if b != c:
            changes.append((k, b, c))
    return changes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline-rls", default="/mnt/documents/golden_authorization_baseline.csv")
    ap.add_argument("--current-rls",  default="/tmp/authz_current_rls.csv")
    ap.add_argument("--baseline-rpc", default=None,
                    help="Optional. If omitted, RPC diff is skipped.")
    ap.add_argument("--current-rpc",  default="/tmp/authz_current_rpcs.csv")
    ap.add_argument("--intentional", default="scripts/authz/intentional_changes.txt")
    ap.add_argument("--report", default="/tmp/authz_diff_report.md")
    a = ap.parse_args()

    rls_base = load_matrix(a.baseline_rls, lambda t, op, r: (t, op, r))
    rls_cur  = load_matrix(a.current_rls,  lambda t, op, r: (t, op, r))
    rls_diff = diff_matrices(rls_base, rls_cur)

    rpc_diff = []
    if a.baseline_rpc and os.path.exists(a.baseline_rpc):
        rpc_base = load_matrix(a.baseline_rpc, lambda n, _a, r: (f"rpc:{n}", "-", r))
        rpc_cur  = load_matrix(a.current_rpc,  lambda n, _a, r: (f"rpc:{n}", "-", r))
        rpc_diff = diff_matrices(rpc_base, rpc_cur)

    intentional = load_intentional(a.intentional)
    unlabeled = []
    with open(a.report, "w") as f:
        f.write("# Authorization Diff Report\n\n")
        f.write(f"- RLS baseline: `{a.baseline_rls}` — {len(rls_base)} cells\n")
        f.write(f"- RLS current:  `{a.current_rls}`  — {len(rls_cur)} cells\n")
        f.write(f"- RLS changes:  **{len(rls_diff)}**\n")
        f.write(f"- RPC changes:  **{len(rpc_diff)}**\n\n")
        buckets = defaultdict(int)
        for k, b, c in rls_diff + rpc_diff:
            buckets[(b, c)] += 1
        if buckets:
            f.write("## Change buckets\n\n| from → to | count | severity |\n|---|--:|---|\n")
            for (b, c), n in sorted(buckets.items(), key=lambda x: -x[1]):
                f.write(f"| {b} → {c} | {n} | {SEVERITY.get((b,c),'?')} |\n")
            f.write("\n")
        f.write("## Cells\n\n| kind | table/rpc | op | role | from | to | severity | intentional? |\n|---|---|---|---|---|---|---|---|\n")
        for (k, b, c) in rls_diff:
            t, op, r = k
            sig = (t, op, r, b, c)
            ok = sig in intentional
            f.write(f"| rls | {t} | {op} | {r} | {b} | {c} | {SEVERITY.get((b,c),'?')} | {'yes' if ok else 'NO'} |\n")
            if not ok:
                unlabeled.append(sig)
        for (k, b, c) in rpc_diff:
            t, op, r = k
            sig = (t, op, r, b, c)
            ok = sig in intentional
            f.write(f"| rpc | {t} | {op} | {r} | {b} | {c} | {SEVERITY.get((b,c),'?')} | {'yes' if ok else 'NO'} |\n")
            if not ok:
                unlabeled.append(sig)

    print(f"[diff] {len(rls_diff)} RLS + {len(rpc_diff)} RPC changes; "
          f"{len(unlabeled)} unlabeled. Report → {a.report}")
    if unlabeled:
        print("[diff] FAIL: unlabeled authorization changes. "
              f"Add them to {a.intentional} with reviewer sign-off, or revert.")
        return 2
    print("[diff] OK: no unlabeled authorization changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())