# Sprint S2 — SECURITY DEFINER Compliance Framework

**Status:** Implementation complete. No authorization behavior changed,
no permissions changed, no RLS changed, no business logic touched.
**Purpose:** Enforcement layer for the frozen SECURITY DEFINER Standard
v1 (`docs/security/S1_SECURITY_DEFINER_STANDARD_V1.md`). Every future
`SECURITY DEFINER` function is graded automatically each time the
authorization regression harness runs.

---

## 1. Scope classification

Every function in `public` that is `SECURITY DEFINER` falls into exactly
one scope, decided declaratively from its name / registration in
`scripts/authz/compliance_definer.py`:

| Scope | Definition | Rule set applied |
|---|---|---|
| `rpc` | Client-callable authoritative RPC (mutates business state on behalf of an authenticated user). | Full Standard v1 (R1–R9). |
| `trigger` | Attached to a table via `CREATE TRIGGER`. Executed by row events, not by client RPC. | R1, R7, R8, R9 (auth-gate rules N/A — auth is enforced on the driving statement). |
| `utility` | Pure predicate / generator / recompute helper. No auth decision. Explicitly registered in `UTILITY` set (mirrors `analyze_rpcs.py`). | R1, R7, R8, R9. |

Adding a new authoritative RPC requires no registry change — it simply
falls through to `rpc` and must pass the full rule set. Adding a new
utility or trigger requires an explicit registry entry so the reduced
rule set can be justified in code review.

---

## 2. Machine-verifiable checklist

Nine rules extracted from Standard v1. Each maps to a static analyzer
in `compliance_definer.py`; results emit `pass` / `warn` / `fail` /
`n/a` per function.

| Rule | Standard v1 anchor | Scope | Severity | Check |
|---|---|---|---|---|
| **R1** | §Mandatory 1 (`SET search_path`) | all | fail | `SET\s+search_path` present in body. |
| **R2** | §Step 1 (auth derived from `auth.uid()`) | rpc | fail | `auth.uid()` referenced. |
| **R3** | §Step 1 (null-guard) | rpc | fail | `auth.uid() IS NULL` or `COALESCE(auth.uid(),...)` fallback present. |
| **R4** | §Step 3 / §Mandatory 2 (exactly one gate) | rpc | fail (0 or >1) | `has_permission(` call count == 1. |
| **R5** | §Mandatory 3 (no `has_role`) | rpc | fail | `has_role(` call count == 0. |
| **R6** | §Mandatory 4 (no client actor) | rpc | fail | Signature has no `_by / user_id / actor_id / performed_by / created_by / updated_by` parameter. |
| **R7** | §Step 6 (audit fields from actor) | all | warn | Every `INSERT INTO public.audit_logs (..., user_id, ...)` writes `user_id` from `auth.uid()` / `COALESCE(auth.uid(), …)` or a local variable named like `_uid` / `v_actor` — never from a raw parameter. |
| **R8** | §Implementation notes (nested definer) | all | fail | Any `SECURITY DEFINER → SECURITY DEFINER` call must appear in `DEFINER_CHAIN_ALLOWLIST` with a documented justification. |
| **R9** | §Mandatory 3 corollary | all | warn | `has_role(` only permitted inside `has_permission` itself; every other usage flagged as legacy code smell. |

Severity model: **`fail`** blocks strict-mode CI runs; **`warn`**
surfaces in the report but does not block. Rules can be promoted from
`warn` → `fail` in the registry as the codebase converges.

---

## 3. Automated validation & CI integration

- **Checker**: `scripts/authz/compliance_definer.py`
  - Reads every `pg_get_functiondef` via `psql` (same runtime contract
    as `analyze_rpcs.py` — needs `PGHOST`).
  - Writes machine-readable CSV to `/tmp/authz_compliance.csv`.
  - Writes human report to `/tmp/authz_compliance.md`.
  - Exit code `0` always; pass `--strict` to exit `2` on any FAIL.

- **Harness integration**: `scripts/authz/run_all.sh` now invokes the
  checker after the RPC decision analyzer. Advisory by default so the
  existing pipeline is not disrupted. Promote to blocking with:

  ```bash
  COMPLIANCE_STRICT=1 bash scripts/authz/run_all.sh
  ```

  The recommended cutover is: keep advisory until every function
  currently reported as FAIL has been remediated by the H3-3 → H3-6
  hotfixes, then flip to strict in CI.

- **Report artifact**: `docs/security/S2_COMPLIANCE_REPORT.md`
  is the committed snapshot for the current database state. Regenerated
  each harness run; commit the refreshed copy alongside any migration
  that adds / changes a SECURITY DEFINER function so the delta is
  reviewable in the PR.

- **What the checker does NOT do**: it does not modify the database,
  does not run any behavior-changing SQL, and does not alter the
  existing RLS or RPC decision baselines. It is orthogonal to
  `diff_baseline.py`.

---

## 4. Compliance report (current snapshot)

Full grid: `docs/security/S2_COMPLIANCE_REPORT.md`.

Totals against the live database (41 SECURITY DEFINER functions):

| Verdict | Count | Notes |
|---|---|---|
| **PASS** | 32 | Includes both H3-1A / H3-2 reference implementations and every `_audit_write` / utility / generator. |
| **WARNING** | 5 | Legacy `has_role()` usage inside utilities/triggers (`apply_coupon_code`, `check_expiry_alerts`, `fn_treasury_day_cash_summary`, `staff_target_actual`, `tg_*_self_guard` family). R9 warns; behavior unchanged. |
| **FAIL** | 4 | The four remaining H-3 hotfix targets: `add_treasury_tx`, `apply_inventory_tx`, `receive_po_item`, `apply_coupon_code` (as an authoritative RPC without `has_permission`). Each is already tracked by the ratified Hotfix Order H3-3 → H3-6. |

**No new findings.** Every FAIL corresponds to an already-open ticket
in `docs/security/H3_SECURITY_DEFINER_RPC_REVIEW.md`. The framework
does not surface a single previously-unknown issue — its value is
preventing regressions going forward, not opening new work.

---

## 5. Contributor guide — implementing a new SECURITY DEFINER function

1. **Draft the function following Standard v1 exactly** — the seven-
   step skeleton with `_uid := auth.uid()`, single `has_permission`
   gate, `SET search_path TO 'public'`, no `_by`/`actor_id` parameter,
   audit writes sourced from `_uid`.
2. **Classify the scope**: if the function is client-callable and
   mutates state → leave it as `rpc` (no registry change needed). If
   it's a trigger body → prefix with `tg_` / `trg_` / `_tg_`. If it's
   a pure utility → add it to the `UTILITY` set in
   `scripts/authz/compliance_definer.py` **in the same PR** with a
   one-line reason in the code review description.
3. **If your function calls another SECURITY DEFINER function**, add
   the `(caller, callee)` pair to `DEFINER_CHAIN_ALLOWLIST` with a
   citation to the design doc that justifies the chain. Otherwise R8
   fails.
4. **Ship the migration**, then run:

   ```bash
   bash scripts/authz/run_all.sh
   ```

   Confirm your function appears under **PASS** in the regenerated
   `docs/security/S2_COMPLIANCE_REPORT.md`. Commit the refreshed
   report with your migration.
5. **PR gate**: reviewers reject any PR where the compliance report
   introduces a new WARNING or FAIL row without an accompanying
   remediation ticket referenced in the PR description.
6. **Never** re-introduce `has_role(...)` at a definer call site, an
   `OR admin` fallback, or a client-supplied actor parameter. These
   are the three permanent tripwires that motivated the framework.

---

## 6. Deliverables checklist

- ✅ Compliance framework — this document.
- ✅ Compliance report — `docs/security/S2_COMPLIANCE_REPORT.md`.
- ✅ CI integration — `scripts/authz/compliance_definer.py` +
  `scripts/authz/run_all.sh` hook (advisory today, strict-ready).
- ✅ Contributor documentation — §5 above.
- ✅ Zero authorization behavior changes (no `CREATE OR REPLACE
  FUNCTION`, no policy edits, no grants touched).

Next actionable step: proceed with **H3-3 `add_treasury_tx`** under
Standard v1; the compliance checker will confirm the FAIL → PASS
transition automatically.
