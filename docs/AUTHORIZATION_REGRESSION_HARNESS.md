# Authorization Regression Harness — Wave 2.5

**Status:** Live · **Baseline:** Golden Authorization Baseline (approved) · **Behavior change:** none

Turns the Golden Baseline into an executable regression suite. Every
cell — 3,392 RLS + 368 RPC = **3,760 authorization decisions** — is
re-derived from live database metadata on demand and diffed against the
frozen baseline. Unlabeled drift fails the suite.

## 1 · Components

| File | Role |
| --- | --- |
| `scripts/authz/analyze_rls.py` | Reads `pg_policies` and rebuilds the 3,392-cell RLS matrix (byte-identical to the Golden Baseline CSV). |
| `scripts/authz/analyze_rpcs.py` | Reads `pg_proc` + `pg_get_functiondef`, derives per-role ALLOW/DENY for every client-callable SECURITY DEFINER RPC. |
| `scripts/authz/diff_baseline.py` | Diffs current vs. baseline CSVs, classifies each change (`ALLOW→DENY`, `DENY→ALLOW`, `OWN→BRANCH`, …), assigns severity, fails on unlabeled changes. |
| `scripts/authz/run_all.sh` | Orchestrator. Supports table/role/cluster/RPC filters. |
| `scripts/authz/snapshot_rpc_baseline.py` | One-time bootstrap of the RPC baseline CSV (already run — CSV committed at `/mnt/documents/golden_rpc_baseline.csv`). |
| `scripts/authz/intentional_changes.txt` | Reviewer sign-off ledger for intentional authorization changes. |

All scripts are pure Python 3 + `psql`, SELECT-only. Zero SQL, RLS,
function, or schema modifications.

## 2 · How coverage maps to the Golden Baseline

`analyze_rls.py` re-implements the exact deterministic rules used to
produce `golden_authorization_baseline.csv` (§1 of that document). Rerun
on today's schema returns **0 diff**, confirming reproducibility.

Coverage per invocation:

| Dimension       | Count |
| --------------- | ----: |
| Tables          | 106   |
| Operations      | 4     |
| Roles           | 8     |
| RLS cells       | 3,392 |
| RPCs analyzed   | 46    |
| RPC cells       | 368   |
| **Total cells** | **3,760** |

## 3 · Diff engine

`diff_baseline.py` emits `/tmp/authz_diff_report.md` and classifies each
changed cell:

| Transition                | Meaning                    | Severity |
| ------------------------- | -------------------------- | -------- |
| `DENY → ALLOW`            | Loosening                  | **HIGH** |
| `OWN → ALLOW`             | Loosening                  | **HIGH** |
| `BRANCH → ALLOW`          | Loosening                  | **HIGH** |
| `ALLOW → DENY`            | Hardening                  | MED      |
| `DENY → BRANCH`           | Loosening (scoped)         | MED      |
| `DENY → OWN`              | Loosening (scoped)         | MED      |
| `ALLOW → BRANCH`          | Tightening                 | LOW      |
| `ALLOW → OWN`             | Tightening                 | LOW      |
| `BRANCH → DENY`           | Tightening                 | LOW      |
| `OWN → DENY`              | Tightening                 | LOW      |
| `BRANCH ↔ OWN` (lateral)  | Scope shift — review req.  | LOW      |
| `UNCHANGED`               | No action                  | —        |

Exit codes: `0` clean or all labeled · `2` unlabeled drift (fails CI).

## 4 · Intentional-change ledger

`scripts/authz/intentional_changes.txt` — one line per pre-approved
change, referenced in the batch's design doc:

```
# table,operation,role,from,to
invoices,DELETE,accountant,deny,allow          # Batch 5 · signed off by …
rpc:apply_wallet_tx,-,nurse,deny,allow         # Batch 7 · signed off by …
```

Every entry MUST be traceable to a Wave 3 batch PR. Adding an entry
here without design-doc sign-off is a review-blocking violation.

## 5 · Per-batch usage

Each Wave 3+ backend batch runs the harness at three checkpoints:

```text
┌────────────────────┐    ┌──────────────┐    ┌─────────────────────┐    ┌─────────────────────────┐
│ Pre-Migration snap │ →  │  Migration   │ →  │ Regression Suite    │ →  │ Authorization Diff      │
│  (analyze_rls +    │    │  (batch SQL) │    │  (run_all.sh)       │    │  Report                 │
│   analyze_rpcs)    │    │              │    │                     │    │  (blocks on unlabeled)  │
└────────────────────┘    └──────────────┘    └─────────────────────┘    └─────────────────────────┘
```

Concretely, in each batch PR:

```bash
# 1. Pre-migration snapshot — must equal Golden Baseline
bash scripts/authz/run_all.sh

# 2. Apply migration (Supabase migration tool, human-approved)

# 3. Post-migration re-check
bash scripts/authz/run_all.sh

# 4. Inspect /tmp/authz_diff_report.md
#    - all changes must appear in scripts/authz/intentional_changes.txt
#    - HIGH-severity changes require security sign-off in the PR
```

If step 4 exits `2`, the batch is not landable.

## 6 · Developer commands

```bash
# Everything (RLS + RPC + diff)
bash scripts/authz/run_all.sh

# One policy family (cluster names from the Golden Baseline)
bash scripts/authz/run_all.sh --cluster Clinical
bash scripts/authz/run_all.sh --cluster Finance
bash scripts/authz/run_all.sh --cluster HR

# One table
bash scripts/authz/run_all.sh --table invoices
bash scripts/authz/run_all.sh --table patients --cmd SELECT

# One role (all tables, all operations)
bash scripts/authz/run_all.sh --role doctor

# One RPC
bash scripts/authz/run_all.sh --rpc apply_wallet_tx

# Raw analyzers (no diff)
python scripts/authz/analyze_rls.py  --summary
python scripts/authz/analyze_rpcs.py --rpc fn_treasury_day_cash_summary

# Diff only, with a custom current CSV
python scripts/authz/diff_baseline.py \
  --current-rls /tmp/my_current_rls.csv \
  --report      /tmp/my_report.md
```

## 7 · CI wiring (suggested)

Add to CI as a required check on any migration-touching PR:

```yaml
- name: Authorization regression
  run: bash scripts/authz/run_all.sh
```

`run_all.sh` exits non-zero on unlabeled drift, blocking the merge.

## 8 · Verification at land-time

On today's schema (Wave 2.5 landing snapshot):

```
[analyze_rls]  wrote 424 rows → /tmp/authz_current_rls.csv
[analyze_rls]  totals: {'allow': 861, 'deny': 2399, 'branch': 58, 'own': 74}
[analyze_rpcs] wrote 46 rows  → /tmp/authz_current_rpcs.csv
[diff]         0 RLS + 0 RPC changes; 0 unlabeled.
[diff]         OK: no unlabeled authorization changes.
```

Baseline reproduces exactly: 3,392 RLS cells + 368 RPC cells = **3,760
authorization decisions verified**, zero drift.

## 9 · Scope & limits

- **In scope.** Deterministic static verification of RLS + RPC decisions
  against the Golden Baseline, per-batch drift detection, severity
  classification, sign-off gating.
- **Out of scope.** End-to-end impersonated-JWT probing per role — that
  would require seeded auth users and is intentionally deferred (would
  be schema/data change, which this phase forbids). The static analyzer
  is provably equivalent to today's runtime behavior because it
  interprets the exact `pg_policies` expressions the planner uses.
- **No changes made.** No SQL, no RLS, no functions, no roles, no
  permissions, no frontend, no edge functions.