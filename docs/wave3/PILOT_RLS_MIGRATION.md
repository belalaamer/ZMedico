# Wave 3 — Pilot RLS Migration Report

**Batch ID:** wave3.pilot.001
**Scope:** 7 RLS policies on 7 configuration/catalog tables
**Model change:** `has_role(auth.uid(),'admin'::app_role)` → `has_permission(auth.uid(),'settings.edit')`
**Behavior change:** none (mathematically identical)

## 1. Selection Rationale

Selected the safest available policy family. Every candidate satisfies all Wave 3 selection criteria:

| Criterion | Pilot family |
| --- | --- |
| Same authorization pattern | Yes — all pure admin-only `ALL` policies with a companion `true` SELECT |
| Uses only `has_role()` | Yes |
| No ownership predicate | Yes |
| No branch-scope predicate | Yes |
| No business-state logic | Yes |
| Not financial / payroll / clinical / inventory-transaction | Yes |

Excluded from the pilot even though pattern-compatible: `expense_categories` (finance), `payment_methods` (finance), `product_categories` (inventory), `leave_types` (HR/payroll), `medications` / `procedures` / `diagnoses` (clinical), `communication_templates` (`admin OR manager`, different pattern).

## 2. Pilot Policy Set (7 policies)

| Table | Policy | Command | Current qual |
| --- | --- | --- | --- |
| `email_templates` | `et_admin` | ALL | `has_role(auth.uid(),'admin'::app_role)` |
| `sms_templates` | `st_admin` | ALL | `has_role(auth.uid(),'admin'::app_role)` |
| `whatsapp_templates` | `wt_admin` | ALL | `has_role(auth.uid(),'admin'::app_role)` |
| `medical_specialties` | `spec_admin` | ALL | `has_role(auth.uid(),'admin'::app_role)` |
| `report_templates` | `rt_admin` | ALL | `has_role(auth.uid(),'admin'::app_role)` |
| `service_categories` | `sc_admin` | ALL | `has_role(auth.uid(),'admin'::app_role)` |
| `system_languages` | `lng_admin` | ALL | `has_role(auth.uid(),'admin'::app_role)` |

Companion `SELECT` policies (`*_select`, `USING (true)`) are **untouched**.

## 3. Semantic Equivalence Proof

`public.has_permission(_user_id, _permission_key)` returns `true` iff:

1. `has_role(_user_id,'admin')` — hard bypass, or
2. the user's bundle graph reaches `_permission_key`.

Live bundle-graph query result:

```
-- roles reaching 'settings.edit' → { admin } (only)
```

Therefore `has_permission(auth.uid(),'settings.edit')` returns `true` **iff** the caller is admin — the exact truth set of the original `has_role(auth.uid(),'admin'::app_role)`.

## 4. Authorization Diff (RLS matrix)

Per-cell projection over 7 tables × 4 operations × 8 roles = 224 cells:

| Cell family | Pre | Post | Δ |
| --- | --- | --- | --- |
| `SELECT`, any role (from `true`) | allow | allow | 0 |
| `INSERT/UPDATE/DELETE`, admin | allow | allow | 0 |
| `INSERT/UPDATE/DELETE`, other 7 roles | deny | deny | 0 |

**Golden Baseline diff:** 0 changed cells, 0 unlabeled.
**Harness command:** `bash scripts/authz/run_all.sh`

The analyzer (`scripts/authz/analyze_rls.py`) was extended in this wave to resolve `has_permission(auth.uid(),'<key>')` against the live bundle graph so post-migration policies map back to the same `allow/deny` cells the Golden Baseline recorded. No baseline CSV mutation required.

## 5. Performance & Execution-Plan Comparison

All 7 tables are small configuration/catalog tables (<200 rows). `EXPLAIN (COSTS OFF) SELECT 1 FROM <t> LIMIT 1` returns `Limit → Seq Scan on <t>` for every table both pre- and post-migration; RLS predicates are inlined only on write paths and the base plans are unchanged.

Function-cost comparison (both `STABLE SECURITY DEFINER`):

| Function | Admin path | Non-admin path |
| --- | --- | --- |
| `has_role` | 1 index lookup on `user_roles(user_id,role)` | 1 index lookup |
| `has_permission` | 1 index lookup on `user_roles(user_id,'admin')` (short-circuits) | +1 recursive CTE over bundle graph (6 bundles, 4 edges) |

For admin users — the only role that actually reaches these policies — the two functions collapse to the same single lookup: zero measurable regression. Non-admin users short-circuit on `deny`; the bounded CTE runs at most once per statement per policy.

## 6. Rollback

See `docs/wave3/PILOT_RLS_ROLLBACK.sql`. Single transactional script that drops the new policies and recreates the originals verbatim.

## 7. Regression-Harness Runbook

```bash
bash scripts/authz/run_all.sh                          # full suite
bash scripts/authz/run_all.sh --cluster Config/Catalog # pilot family
bash scripts/authz/run_all.sh --table email_templates  # single table
```

Expected exit code: `0`. Expected diff footer: `0 RLS + 0 RPC changes; 0 unlabeled`.

## 8. Success-Criteria Checklist

- [x] Zero authorization drift (0 changed cells vs Golden Baseline)
- [x] Zero behavior change (semantic equivalence proven)
- [x] Zero performance regression (admin path identical; non-admin bounded)
- [x] No unexpected policy interactions (each table has 1 write policy + 1 read policy; migration touches only the write policy)
- [x] Regression harness passes (`exit 0`)
- [x] Harness reports 0 unlabeled drift

## 9. Stop Conditions (none triggered)

No wrapper, trigger, view, RPC, or edge function was found to depend on the old `has_role` predicate for any pilot table. Grep across `scripts/`, `supabase/functions/`, and `src/` confirms these tables are accessed only via the standard client, which trusts RLS.

## 10. Next Steps

On approval and successful soak (72h) of this pilot batch, proceed to Batch 1 (Catalog) of `docs/BACKEND_AUTHORIZATION_MIGRATION_PLAN.md` — the remaining pure-admin catalog policies excluded from the pilot for cluster-isolation reasons.
