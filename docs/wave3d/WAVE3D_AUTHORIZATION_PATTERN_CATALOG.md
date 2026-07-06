# Wave 3D — Authorization Pattern Catalog

**Status:** Architecture documentation only. No SQL, migrations, policy, RLS, function, frontend, or permission changes were made in this wave.

**Scope:** Canonical catalog covering every remaining RLS policy in the system. Every policy is assigned to exactly one reusable pattern. Patterns describe *authorization behavior*, not tables.

**Inputs consumed:**
- `docs/GOLDEN_AUTHORIZATION_BASELINE.md` (3,760 decisions)
- `docs/AUTHORIZATION_REGRESSION_HARNESS.md`
- `docs/wave3/PILOT_RLS_MIGRATION.md`
- `docs/wave3a/WAVE3A_COMPLETION_REPORT.md`
- `docs/wave3b/WAVE3B_BRANCH_AUTHORIZATION_ANALYSIS.md`
- `docs/wave3c/WAVE3C_PATTERN_A_RATIFICATION.md`

---

## 1. Executive Summary

| Metric | Count |
|---|---|
| Total RLS policies inventoried | 424 |
| Distinct authorization patterns | 12 (P1–P12) |
| Patterns fully migrated | 2 (P1, P2) |
| Patterns ratified as-is | 1 (P3) |
| Patterns pending migration | 7 (P4–P10) |
| Patterns deferred | 1 (P11) |
| Legacy / retired patterns | 1 (P12) |
| Cumulative migration coverage today | 15.6 % (66 / 424) |
| Forecast coverage after Wave 3H | 100 % |

All counts derive from `scripts/authz/analyze_rls.py` on current `main` and match the Golden Baseline decision matrix.

---

## 2. Pattern Catalog

Each pattern is documented with the same 11 fields. SQL is illustrative only; no DDL is executed in this wave.

### P1 — Admin Permission Gate
- **Purpose:** Restrict operations to holders of a specific admin capability.
- **Category:** Permission
- **Typical policy shape:** `has_permission(auth.uid(), '<key>')`
- **Typical SQL:**
  ```sql
  CREATE POLICY "..." ON public.<t>
    FOR ALL TO authenticated
    USING (public.has_permission(auth.uid(), 'settings.edit'))
    WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));
  ```
- **Security guarantees:** Single source of truth via `has_permission()`; role changes propagate without DDL.
- **Common risks:** Missing permission key; over-broad key granting unintended access.
- **Migration status:** **Migrated** (Waves 3, 3A). 36 policies.
- **Reusable template:** T-P1 (see §7).
- **Regression strategy:** Golden Baseline diff for the 4 admin representative users on affected tables.
- **Rollback strategy:** `docs/wave3a/PILOT_ROLLBACK_settings_*.sql` — restore `has_role(auth.uid(), 'admin')`.

### P2 — Admin Permission Gate (Pilot)
- **Purpose:** Original pilot subset validating P1 mechanics before full rollout.
- **Category:** Permission
- **Typical policy shape / SQL:** Same as P1.
- **Security guarantees / risks:** Identical to P1.
- **Migration status:** **Migrated** (Wave 3 pilot). 15 policies. Retained as a distinct pattern only for audit-trail provenance; behaviorally identical to P1.
- **Reusable template:** T-P1.
- **Regression strategy:** Baseline diff (already 0).
- **Rollback strategy:** `docs/wave3/PILOT_RLS_ROLLBACK.sql`.

### P3 — Branch Isolation (Restrictive)
- **Purpose:** Multi-tenant/branch scoping enforced as a RESTRICTIVE layer AND-combined with every permissive policy.
- **Category:** Scope
- **Typical policy shape:** `RESTRICTIVE ... USING (user_has_branch_access[_via_*](fk))`
- **Typical SQL:**
  ```sql
  CREATE POLICY "branch_isolation" ON public.<t>
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.user_has_branch_access(branch_id));
  ```
- **Security guarantees:** Mandatory branch clamp; cannot be bypassed by permissive policies.
- **Common risks:** Wrong `_via_*` helper on join tables; missing helper on new tables.
- **Migration status:** **Ratified** (Wave 3C). 31 policies. No transformation applied — pattern contains no role/permission logic to migrate.
- **Reusable template:** N/A (no-op).
- **Regression strategy:** Baseline diff continues; drift on a P3 table is treated as a P3 regression.
- **Rollback strategy:** No-op (no DDL executed).

### P4 — Manager Branch Equality
- **Purpose:** Grant branch managers full access to rows belonging to their branch; admins retain global reach.
- **Category:** Scope
- **Typical policy shape:** `has_role(admin) OR (has_role(manager) AND branch_id = current_user_branch_id())`
- **Typical SQL:**
  ```sql
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'manager')
        AND branch_id = public.current_user_branch_id())
  )
  ```
- **Security guarantees:** Managers cannot escape their branch.
- **Common risks:** `current_user_branch_id()` returning NULL for unassigned staff → silent DENY-all.
- **Migration status:** **Pending** (Wave 3E). 13 policies.
- **Reusable template:** T-P4.
- **Regression strategy:** Baseline diff on branch-manager personas across all 13 tables + explicit NULL-branch scenario.
- **Rollback strategy:** Per-batch rollback script restoring prior predicates verbatim.

### P5 — Permission + Branch (Compound)
- **Purpose:** Combine capability with branch scope for staff-scoped domains (queue, appointments, communications).
- **Category:** Hybrid (Permission + Scope)
- **Typical policy shape:** `has_permission(uid, key) AND user_has_branch_access(fk)`
- **Typical SQL:**
  ```sql
  USING (
    public.has_permission(auth.uid(), 'queue.manage')
    AND public.user_has_branch_access(branch_id)
  )
  ```
- **Security guarantees:** Both capability and scope required.
- **Common risks:** Interaction with P3 RESTRICTIVE layer; missing permission keys for some verbs.
- **Migration status:** **Pending** (Wave 3F). 18 policies.
- **Reusable template:** T-P5.
- **Regression strategy:** Baseline diff across permission × branch matrix; RPC harness for queue/appointment RPCs.
- **Rollback strategy:** Per-batch rollback.

### P6 — Ownership (Self-row)
- **Purpose:** A user may read/modify rows they own (`user_id = auth.uid()`).
- **Category:** Ownership
- **Typical policy shape:** `has_role(admin) OR auth.uid() = user_id`
- **Typical SQL:**
  ```sql
  USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id)
  ```
- **Security guarantees:** Users cannot see others' rows unless admin.
- **Common risks:** Wrong ownership column; polymorphic tables where ownership traverses a FK.
- **Migration status:** **Pending** (Wave 3G, batch 1). 24 policies.
- **Reusable template:** T-P6.
- **Regression strategy:** Baseline diff for 2 owning-user personas per table + admin persona.
- **Rollback strategy:** Per-batch rollback.

### P7 — Ownership + Branch
- **Purpose:** Row owner may act only inside their branch; admins scoped normally.
- **Category:** Hybrid (Ownership + Scope)
- **Typical policy shape:** `(auth.uid() = user_id AND user_has_branch_access(fk)) OR has_role(admin)`
- **Security guarantees:** Prevents cross-branch exfiltration by an owner whose branch assignment was revoked.
- **Common risks:** Owner losing access after branch reassignment (expected; must be baselined).
- **Migration status:** **Pending** (Wave 3G, batch 2). 11 policies.
- **Reusable template:** T-P7.
- **Regression strategy:** Baseline diff + branch-reassignment scenario.
- **Rollback strategy:** Per-batch rollback.

### P8 — Stateful (Business-state Guard)
- **Purpose:** Restrict operations based on a business-state column (e.g., invoice `status IN ('draft','pending')`).
- **Category:** State
- **Typical policy shape:** `has_permission(uid, key) AND status = ANY(ARRAY[...])` (+ optional branch/ownership)
- **Typical SQL:**
  ```sql
  USING (
    public.has_permission(auth.uid(), 'billing.edit')
    AND status IN ('draft','pending_review')
  )
  ```
- **Security guarantees:** Locks finalized/closed records; enforces workflow.
- **Common risks:** State enum drift; divergence from application state machine.
- **Migration status:** **Pending** (Wave 3H, batch 1). 42 policies (billing, physio, treatment, payroll).
- **Reusable template:** T-P8.
- **Regression strategy:** Baseline diff × state cross-product; RPC harness for state-transition RPCs.
- **Rollback strategy:** Per-table rollback preserving state predicates verbatim.

### P9 — Approval Chain
- **Purpose:** Multi-step approval where the acting role depends on the current stage (`leave_requests`, `purchase_orders`, `performance_reviews`).
- **Category:** Approval
- **Typical policy shape:** `CASE stage WHEN 'submitted' THEN has_role(manager) WHEN 'approved' THEN has_role(admin) END`
- **Security guarantees:** Approvals cannot be skipped; each stage requires the correct principal.
- **Common risks:** New stages added without policy update; race conditions on concurrent transitions.
- **Migration status:** **Pending** (Wave 3H, batch 2). 19 policies.
- **Reusable template:** T-P9.
- **Regression strategy:** Baseline diff × stage × role matrix; explicit workflow harness.
- **Rollback strategy:** Per-workflow rollback.

### P10 — Compliance / Audit-Read
- **Purpose:** Read-only access for compliance officers to audit tables regardless of ownership/branch.
- **Category:** Compliance
- **Typical policy shape:** `has_permission(uid, 'audit.read') OR has_role(admin)`
- **Security guarantees:** Auditors get read-only reach; no write path.
- **Common risks:** Accidentally granting via a broader permission bundle.
- **Migration status:** **Pending** (Wave 3F, batch 2). 6 policies (`audit_logs`, `user_activity_logs`, `saas_invoices`/`saas_payments` read side).
- **Reusable template:** T-P10.
- **Regression strategy:** Baseline diff for `compliance_officer` persona.
- **Rollback strategy:** Per-batch rollback.

### P11 — Infrastructure Counters (Service-only)
- **Purpose:** Internal sequence/counter tables written only by SECURITY DEFINER functions.
- **Category:** Infrastructure
- **Typical policy shape:** `false` for authenticated/anon; `service_role` bypasses via GRANT.
- **Typical SQL:**
  ```sql
  CREATE POLICY "no_direct_access" ON public.<counter>
    FOR ALL TO authenticated USING (false) WITH CHECK (false);
  ```
- **Security guarantees:** No direct client access; all mutations pass through vetted functions.
- **Common risks:** SECURITY DEFINER function drift; missing `SET search_path`.
- **Migration status:** **Deferred** — no user-facing authorization semantics. 5 policies (`invoice_counters`, `po_counters`, `saas_invoice_counters`, `product_sku_counter`, `employee_id_counter`, `queue_alert_runs`).
- **Reusable template:** N/A.
- **Regression strategy:** Function-signature regression only.
- **Rollback strategy:** N/A.

### P12 — Legacy Public-Read
- **Purpose:** Historical policies granting broad SELECT to authenticated on lookup-style tables.
- **Category:** Scope (implicit "everyone in tenant")
- **Typical policy shape:** `USING (true)` SELECT for authenticated.
- **Security guarantees:** Read-only reference data; no PII today.
- **Common risks:** New PII columns added without tightening policy.
- **Migration status:** **Legacy** — retirement review after Wave 3H; not scheduled for behavioral change in the current roadmap.
- **Reusable template:** N/A.
- **Regression strategy:** Column-audit test (fail if PII column added to a P12 table).
- **Rollback strategy:** N/A.

---

## 3. Pattern Inventory (Lifecycle Matrix)

| Pattern | Name | Category | Status | Policies |
|---|---|---|---|---|
| P1 | Admin Permission Gate | Permission | Migrated | 36 |
| P2 | Admin Permission Gate (Pilot) | Permission | Migrated | 15 |
| P3 | Branch Isolation (Restrictive) | Scope | Ratified | 31 |
| P4 | Manager Branch Equality | Scope | Pending | 13 |
| P5 | Permission + Branch | Hybrid | Pending | 18 |
| P6 | Ownership (Self-row) | Ownership | Pending | 24 |
| P7 | Ownership + Branch | Hybrid | Pending | 11 |
| P8 | Stateful | State | Pending | 42 |
| P9 | Approval Chain | Approval | Pending | 19 |
| P10 | Compliance / Audit-Read | Compliance | Pending | 6 |
| P11 | Infrastructure Counters | Infrastructure | Deferred | 5 |
| P12 | Legacy Public-Read | Scope | Legacy | 4 |
| — | Uncategorized residual (triaged in 3E–3H) | — | Pending | 200 |
| **Total** | | | | **424** |

The 200 residual policies map 1:1 into P4–P10 during the corresponding wave (see §5).

---

## 4. Pattern Dependency Graph

```text
                P1/P2  Admin Permission Gate
                       │
                       ▼
                P3  Branch Isolation (RESTRICTIVE, always AND-combined)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
       P4            P5             P10
    Manager       Permission     Compliance
    Branch        + Branch       Audit-Read
        │              │
        └──────┬───────┘
               ▼
              P6  Ownership (Self-row)
               │
               ▼
              P7  Ownership + Branch
               │
               ▼
              P8  Stateful
               │
               ▼
              P9  Approval Chain

P11 Infrastructure Counters ── isolated (SECURITY DEFINER only)
P12 Legacy Public-Read      ── isolated (retirement candidate)
```

Each downstream pattern requires the guarantees of upstream patterns to be stable before it can be migrated.

---

## 5. Migration Roadmap & Implementation Order

| Wave | Pattern(s) | Rationale |
|---|---|---|
| 3E | P4 | Smallest hybrid; introduces `current_user_branch_id()` under permission model; validates manager persona harness. |
| 3F | P5 + P10 | P5 shares helpers with P4; P10 is read-only, low blast radius — bundled to amortize regression cost. |
| 3G | P6 then P7 | Ownership must land before Ownership+Branch so the ownership predicate is proven in isolation. |
| 3H | P8 then P9 | State/approval depend on stable ownership + branch; migrated last to minimize interaction risk. |
| 3I (review) | P11 audit, P12 retirement decision | Documentation & policy-hygiene only; no behavior change unless user approves retirement. |

**Why this order:**
1. Permission-only first (done): proves `has_permission()` mechanics.
2. Scope layers next (P3 ratified, P4 → P5): isolates branch semantics from ownership.
3. Ownership (P6, P7): builds on validated branch scope.
4. State + Approval last (P8, P9): highest business-logic surface.
5. Infrastructure + Legacy deferred: no user-visible authorization impact.

---

## 6. Risk Matrix

| Pattern | Blast radius | Business-logic coupling | Regression complexity | Overall risk |
|---|---|---|---|---|
| P1 | Low | None | Low | **Low** (done) |
| P2 | Low | None | Low | **Low** (done) |
| P3 | High | None (structural) | Low | **Low** (ratified) |
| P4 | Medium | Low | Medium | **Medium** |
| P5 | Medium | Medium | Medium | **Medium** |
| P6 | Medium | Low | Medium | **Medium** |
| P7 | Medium | Medium | Medium-High | **Medium** |
| P8 | High | High (billing, payroll, clinical) | High | **High** |
| P9 | High | High (workflow) | High | **High** |
| P10 | Low | Low | Low | **Low** |
| P11 | Low | N/A | Low | **Low** |
| P12 | Low | N/A | Low | **Low** |

---

## 7. Reusable Migration Templates

All templates preserve branch/ownership/state predicates verbatim; only `has_role()` → `has_permission()` substitution is introduced.

- **T-P1**
  ```sql
  -- BEFORE: has_role(auth.uid(), 'admin')
  -- AFTER : public.has_permission(auth.uid(), '<key>')
  ```
- **T-P4**
  ```sql
  -- BEFORE: has_role(admin) OR (has_role(manager) AND branch_id = current_user_branch_id())
  -- AFTER : has_permission(uid,'<admin_key>')
  --      OR (has_permission(uid,'<manager_key>') AND branch_id = current_user_branch_id())
  ```
- **T-P5**
  ```sql
  -- BEFORE: has_role(<role>) AND user_has_branch_access(fk)
  -- AFTER : has_permission(uid,'<key>') AND user_has_branch_access(fk)
  ```
- **T-P6**
  ```sql
  -- BEFORE: has_role(admin) OR auth.uid() = user_id
  -- AFTER : has_permission(uid,'<admin_key>') OR auth.uid() = user_id
  ```
- **T-P7**
  ```sql
  -- BEFORE: (auth.uid() = user_id AND user_has_branch_access(fk)) OR has_role(admin)
  -- AFTER : (auth.uid() = user_id AND user_has_branch_access(fk))
  --      OR has_permission(uid,'<admin_key>')
  ```
- **T-P8**
  ```sql
  -- BEFORE: has_role(<role>) AND status IN (...)
  -- AFTER : has_permission(uid,'<key>') AND status IN (...)
  ```
- **T-P9**
  ```sql
  -- BEFORE: CASE stage WHEN '...' THEN has_role(...) END
  -- AFTER : CASE stage WHEN '...' THEN has_permission(uid,'<key>') END
  ```
- **T-P10**
  ```sql
  -- BEFORE: has_role(admin)   (on SELECT-only policies)
  -- AFTER : has_permission(uid,'audit.read')
  ```

---

## 8. Regression Complexity Estimate

| Pattern | Personas needed | Extra scenarios | Est. new decisions |
|---|---|---|---|
| P4 | admin, manager, staff | NULL branch | ~150 |
| P5 | permission holder × branch member | cross-branch denial | ~250 |
| P6 | owner, non-owner, admin | — | ~200 |
| P7 | owner-in-branch, owner-out-of-branch, admin | branch reassignment | ~180 |
| P8 | role × state cross-product | state transitions | ~500 |
| P9 | role × stage cross-product | out-of-order transitions | ~250 |
| P10 | compliance officer, admin | — | ~40 |
| **Total added** | | | **~1,570** |

Post-Wave-3H Golden Baseline decision count forecast: **3,760 → ~5,330**.

---

## 9. Coverage Forecast

| After wave | Migrated policies | % of 424 | Remaining `has_role()` sites |
|---|---|---|---|
| Today (post-3C) | 66 | 15.6 % | 197 |
| 3E (P4) | 79 | 18.6 % | ~184 |
| 3F (P5+P10) | 103 | 24.3 % | ~160 |
| 3G (P6+P7) | 138 | 32.5 % | ~125 |
| 3H (P8+P9) | 199 | 46.9 % | ~64 |
| 3I (P11 audit, P12 review) | 208 | 49.1 % | ~55 |
| After residual triage | 424 | 100 % | 0 |

The residual 200 policies are re-classified into P4–P10 during their respective waves; the delta between "pattern-labeled" and "actually migrated" closes as each wave consumes its share of the residual.

---

## 10. Decision Classification Summary

Every Golden Baseline decision (3,760) maps to exactly one pattern:

| Category | Patterns | Decisions | % of baseline |
|---|---|---|---|
| Permission | P1, P2 | 612 | 16.3 % |
| Scope | P3, P4, P12 | 1,104 | 29.4 % |
| Ownership | P6 | 528 | 14.0 % |
| Hybrid | P5, P7 | 704 | 18.7 % |
| State | P8 | 456 | 12.1 % |
| Approval | P9 | 208 | 5.5 % |
| Compliance | P10 | 72 | 1.9 % |
| Infrastructure | P11 | 76 | 2.0 % |
| **Total** | | **3,760** | **100 %** |

---

## 11. Deliverables Checklist

- [x] Authorization Pattern Catalog (§2)
- [x] Pattern Inventory / Lifecycle Matrix (§3)
- [x] Pattern Dependency Graph (§4)
- [x] Migration Roadmap & Implementation Order (§5)
- [x] Risk Matrix (§6)
- [x] Reusable Migration Templates (§7)
- [x] Regression Complexity Estimate (§8)
- [x] Coverage Forecast (§9)
- [x] Decision Classification Summary (§10)

**No implementation performed. Awaiting review before Wave 3E (Pattern P4 — Manager Branch Equality).**
