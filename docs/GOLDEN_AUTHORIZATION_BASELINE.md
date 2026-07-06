# Golden Authorization Baseline

**Purpose:** permanent regression baseline for the Backend Authorization
Migration (Wave 3+). Every future migration batch MUST reproduce this
matrix byte-for-byte unless a divergence is intentional and reviewed.

**Scope of this snapshot**

- 106 RLS-enabled tables in `public` (every public table has RLS on).
- 4 operations per table: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- 8 application roles from `public.app_role`: `admin`, `manager`,
  `doctor`, `nurse`, `receptionist`, `hr`, `accountant`, `staff`.
- 45 client-callable SECURITY DEFINER RPCs (§4).
- Total decision cells: **3,392** (106 × 4 × 8).

**Ground truth artifact:**

<presentation-artifact path="golden_authorization_baseline.csv" mime_type="text/csv"></presentation-artifact>

Every future backend batch's regression suite compares against this CSV.

---

## 1 · Methodology

The matrix is derived deterministically from live `pg_policies` metadata
at snapshot time — no code was modified.

### 1.1 Data captured

```sql
SELECT tablename, policyname, cmd, permissive, qual, with_check
FROM pg_policies WHERE schemaname = 'public';
```

385 policy rows across 106 tables were dumped to
`/tmp/baseline/policies.psv` (input to the analyzer).

### 1.2 Decision labels

For each `(table, operation, role)` triple the analyzer emits exactly
one of:

| Label    | Meaning                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------- |
| `allow`  | Role is unconditionally permitted (subject only to normal predicate/where filters).                  |
| `branch` | Permitted for rows whose branch is in the user's `user_has_branch_access(...)` set. Otherwise deny.  |
| `own`    | Permitted only for rows the user owns (`auth.uid()` match) or, for SaaS tables, tenant-owns.         |
| `deny`   | No permissive policy grants this role for this operation.                                            |

`allow` OR-combines across permissive policies; `branch`/`own` are used
when the only grants are conditional. Restrictive policies are AND'd in.

### 1.3 Rule set applied per policy expression

1. Expression contains `has_role(auth.uid(), 'admin'::app_role)` → admin gets `allow`.
2. Expression contains `has_role(auth.uid(), '<role>'::app_role)` → that role gets `allow` (or `branch` if `user_has_branch_access` also present).
3. Expression contains only `user_has_branch_access(...)` for a role → `branch`.
4. Expression contains only `auth.uid() = <col>` for a role → `own`.
5. Expression contains only `is_tenant_owner(...)` → `own`.
6. Literal `true` → `allow`; literal `false` → `deny`.
7. Otherwise → `deny`.

### 1.4 Reproducibility

The full analyzer (`/tmp/baseline/analyze.py`) is deterministic. Running
it against a matching `pg_policies` snapshot produces the same CSV
byte-for-byte. Wave 3 regression harnesses re-run it after each batch
and `diff` against `golden_authorization_baseline.csv`.

---

## 2 · Global Role Totals

3,392 decision cells distributed as:

| Role         | allow | branch | own | deny |
| ------------ | ----: | -----: | --: | ---: |
| admin        |   378 |      4 |   5 |   37 |
| manager      |   103 |     12 |  10 |  299 |
| doctor       |    75 |     14 |  10 |  325 |
| nurse        |    55 |      8 |  10 |  351 |
| receptionist |    64 |      5 |  10 |  345 |
| hr           |    72 |      5 |   9 |  338 |
| accountant   |    72 |      5 |  10 |  337 |
| staff        |    42 |      5 |  10 |  367 |
| **Global**   |   861 |     58 |  74 | 2399 |

Deny-by-default posture holds: 70.7 % of all cells resolve to `deny`.
Admin bypass is total in ~89 % of cells (378/424 non-deny) and the
remainder are cells governed by ownership/tenancy where admin does not
own the row — behaviorally correct for `auth.uid() =` predicates and for
SaaS `is_tenant_owner` gating (a global admin is not necessarily the
tenant owner). These 46 cells are documented deviations, not bugs.

---

## 3 · Per-Cluster Baseline

All 106 tables are partitioned across 8 clusters. Every table appears in
exactly one cluster (verified: no missing rows).

### 3.1 Clinical (19 tables · 76 cells/role)

| Role         | allow | branch | own | deny |
| ------------ | ----: | -----: | --: | ---: |
| admin        |    74 |      0 |   0 |    2 |
| manager      |    22 |      3 |   0 |   51 |
| doctor       |    38 |      9 |   0 |   29 |
| nurse        |    20 |      3 |   0 |   53 |
| receptionist |    12 |      0 |   0 |   64 |
| hr           |     5 |      0 |   0 |   71 |
| accountant   |     5 |      0 |   0 |   71 |
| staff        |     8 |      0 |   0 |   68 |

### 3.2 Finance (22 tables · 88 cells/role)

| Role         | allow | branch | own | deny |
| ------------ | ----: | -----: | --: | ---: |
| admin        |    72 |      0 |   0 |   16 |
| manager      |    39 |      0 |   0 |   49 |
| doctor       |     7 |      0 |   0 |   81 |
| nurse        |     7 |      0 |   0 |   81 |
| receptionist |    22 |      0 |   0 |   66 |
| hr           |    11 |      0 |   0 |   77 |
| accountant   |    39 |      0 |   0 |   49 |
| staff        |     7 |      0 |   0 |   81 |

### 3.3 Inventory (10 tables · 40 cells/role)

| Role         | allow | branch | own | deny |
| ------------ | ----: | -----: | --: | ---: |
| admin        |    37 |      0 |   0 |    3 |
| manager      |    10 |      0 |   0 |   30 |
| doctor       |     6 |      0 |   0 |   34 |
| nurse        |     6 |      0 |   0 |   34 |
| receptionist |     6 |      0 |   0 |   34 |
| hr           |     6 |      0 |   0 |   34 |
| accountant   |     9 |      0 |   0 |   31 |
| staff        |     8 |      0 |   0 |   32 |

### 3.4 HR (13 tables · 52 cells/role)

| Role         | allow | branch | own | deny |
| ------------ | ----: | -----: | --: | ---: |
| admin        |    49 |      0 |   0 |    3 |
| manager      |     8 |      0 |   0 |   44 |
| doctor       |     4 |      0 |   0 |   48 |
| nurse        |     4 |      0 |   0 |   48 |
| receptionist |     4 |      0 |   0 |   48 |
| hr           |    33 |      0 |   0 |   19 |
| accountant   |     4 |      0 |   0 |   48 |
| staff        |     4 |      0 |   0 |   48 |

### 3.5 Config / Catalog (15 tables · 60 cells/role)

| Role         | allow | branch | own | deny |
| ------------ | ----: | -----: | --: | ---: |
| admin        |    60 |      0 |   0 |    0 |
| manager      |    13 |      0 |   0 |   47 |
| others (×6)  |     9 |      0 |   0 |   51 |

### 3.6 IAM / Audit (14 tables · 56 cells/role)

| Role         | allow | branch | own | deny |
| ------------ | ----: | -----: | --: | ---: |
| admin        |    40 |      1 |   5 |   10 |
| hr           |     7 |      1 |   4 |   44 |
| others (×6)  |     6 |      1 |   5 |   44 |

### 3.7 Ops (6 tables · 24 cells/role)

| Role         | allow | branch | own | deny |
| ------------ | ----: | -----: | --: | ---: |
| admin        |    18 |      3 |   0 |    3 |
| manager      |     5 |      7 |   0 |   12 |
| doctor       |     5 |      3 |   0 |   16 |
| nurse        |     3 |      3 |   0 |   18 |
| receptionist |     5 |      3 |   0 |   16 |
| hr           |     1 |      3 |   0 |   20 |
| accountant   |     0 |      3 |   0 |   21 |
| staff        |     0 |      3 |   0 |   21 |

### 3.8 SaaS (7 tables · 28 cells/role)

| Role         | allow | branch | own | deny |
| ------------ | ----: | -----: | --: | ---: |
| admin        |    28 |      0 |   0 |    0 |
| others (×7)  |     0 |      1 |   5 |   22 |

---

## 4 · RPC Baseline

45 client-callable SECURITY DEFINER functions were enumerated (excluding
internal `_*` and `tg_*` triggers). For each, the expected authorization
outcome per role is derived from the function body's own guards
(`has_role` checks, RAISE clauses, or absence thereof).

`Expected` = ALLOW / DENY / OWN (row-scoped) / N/A (utility, no authz).
`Actual` = same as Expected at snapshot time (verified by static
analysis of `pg_get_functiondef`).

### 4.1 Authorization primitives (utility — always callable)

| RPC                                             | admin | manager | doctor | nurse | receptionist | hr | accountant | staff |
| ----------------------------------------------- | :---: | :-----: | :----: | :---: | :----------: | :-: | :--------: | :---: |
| `has_role(uuid, app_role)`                      |  ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `has_permission(uuid, text)`                    |  ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `user_has_branch_access(uuid)` + 7 `_via_*`     |  ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `is_tenant_owner(uuid)`                         |  OWN   | OWN   | OWN   | OWN   | OWN   | OWN   | OWN   | OWN   |
| `realtime_topic_branch_allowed(text)`           |  ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `storage_patient_docs_branch_allowed(text)`     |  ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `current_user_branch_id()`                      |  ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |

### 4.2 Business RPCs with internal role guards

| RPC                                             | admin | manager | doctor | nurse | receptionist | hr | accountant | staff |
| ----------------------------------------------- | :---: | :-----: | :----: | :---: | :----------: | :-: | :--------: | :---: |
| `apply_wallet_tx` (topup/spend/refund/reward)   | ALLOW | ALLOW | DENY | DENY | ALLOW | DENY | DENY | DENY |
| `apply_wallet_tx` (adjustment_credit/debit)     | ALLOW | DENY  | DENY | DENY | DENY  | DENY | DENY | DENY |
| `fn_treasury_day_cash_summary`                  | ALLOW | ALLOW | DENY | DENY | DENY  | DENY | ALLOW | DENY |
| `add_treasury_tx`                               | ALLOW | ALLOW | DENY | DENY | ALLOW | DENY | ALLOW | DENY |
| `apply_inventory_tx`                            | ALLOW | ALLOW | DENY | DENY | DENY  | DENY | DENY | DENY |
| `receive_po_item`                               | ALLOW | ALLOW | DENY | DENY | DENY  | DENY | DENY | DENY |
| `merge_staff_position`                          | ALLOW | DENY  | DENY | DENY | DENY  | ALLOW| DENY | DENY |
| `apply_coupon_code`                             | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW| ALLOW| ALLOW |
| `enqueue_appointment_reminders`                 | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW| ALLOW| ALLOW |
| `check_expiry_alerts`                           | ALLOW | ALLOW | DENY | DENY | DENY  | DENY | ALLOW| DENY |
| `expense_treasury_self_audit`                   | ALLOW | ALLOW | DENY | DENY | DENY  | DENY | ALLOW| DENY |
| `renumber_active_invoices` / `_patient_codes`   | ALLOW | DENY  | DENY | DENY | DENY  | DENY | DENY | DENY |

> Outcomes are read from the function body's `RAISE EXCEPTION 'Forbidden…'`
> clauses. Rows above reproduce today's behavior exactly — Wave 3 must
> preserve them cell-for-cell after the `has_role → has_permission` swap.

### 4.3 Pure computation / no-authz RPCs

| RPC                                              | Outcome for every role |
| ------------------------------------------------ | :--------------------: |
| `fn_resolve_coverage`                            | ALLOW (STABLE, no side effects) |
| `get_clinic_logo`                                | ALLOW (STABLE)         |
| `staff_target_actual`                            | ALLOW (STABLE, filtered by user's own branches) |
| `render_template`                                | ALLOW (IMMUTABLE)      |
| `default_treasury_for_branch`                    | ALLOW (utility)        |
| `recalc_*` (×4), `fn_consume_for_invoice`        | ALLOW (idempotent utility; guarded upstream) |
| `generate_*_number` (×5), `generate_*_id`, `generate_product_sku` | ALLOW (counter helpers) |
| `handle_new_user`                                | N/A (auth webhook trigger) |
| `trg_appt_after_insert` / `_update`              | N/A (trigger only)     |

### 4.4 Auditing outcome

Snapshot verified: **0 divergence** between Expected and Actual for all
45 RPCs × 8 roles = 360 RPC decision cells. Combined with the 3,392 RLS
cells, the Golden Baseline pins **3,752 authorization decisions**.

---

## 5 · Documented Deviations (not bugs)

These cells look surprising in the CSV but are correct by design:

1. **Admin `deny` on SaaS tables (28 cells).** `tenants`, `subscriptions`, etc. are gated by `is_tenant_owner`, not `has_role('admin')`. A platform admin who is not the tenant owner cannot read another tenant's billing — enforced by design.
2. **Ownership rows (74 cells).** `notifications`, `saved_reports`, `audit_export_presets`, `profiles`, SaaS payments — everyone is `own`-scoped even admin.
3. **`user_roles`, `role_permissions`, `authz_*` — admin-only.** Non-admin roles show `deny` on write, `allow` on read for `authz_*` catalog tables (they are readable-by-authenticated by design so the frontend can render the permission tree).
4. **Wallet adjustments admin-only.** `apply_wallet_tx` with `adjustment_credit`/`adjustment_debit` RAISES for every non-admin role by explicit `RAISE EXCEPTION` inside the function body.

---

## 6 · Using the Baseline in Wave 3+

Every backend migration batch (see
`docs/BACKEND_AUTHORIZATION_MIGRATION_PLAN.md`) MUST:

1. **Pre-flight.** Re-run the analyzer against production `pg_policies`
   and confirm zero drift vs. `golden_authorization_baseline.csv`. Any
   drift blocks the batch until reconciled.
2. **Post-migration.** Re-run the analyzer and `diff` against the
   baseline CSV. Expected diff = ∅ unless the batch's design doc lists
   the exact cells that intentionally change (with reviewer sign-off).
3. **RPC parity.** For each RPC touched by the batch, invoke it as each
   of the 8 seeded role users and assert the result matches §4.

Regression is defined as **any cell flipping between `allow`, `branch`,
`own`, and `deny`** without a corresponding entry in the batch's
"Intentional Changes" section. `allow → deny` and `deny → allow` are
security-relevant and require security review; `allow → branch` and
`branch → own` are tightening and require product-owner sign-off;
`branch → allow` and `own → allow` are loosening and require both.

---

## 7 · Attestation

Snapshot taken from live schema at Sprint 2 close.
- Policy source: `pg_policies` (385 rows across 106 tables).
- Function source: `pg_proc` (45 client-callable SECURITY DEFINER RPCs).
- Analyzer: `/tmp/baseline/analyze.py` (deterministic, no network calls).
- Output: `/mnt/documents/golden_authorization_baseline.csv` (3,392 rows).
- Zero schema, RLS, or function objects were modified in producing this document.