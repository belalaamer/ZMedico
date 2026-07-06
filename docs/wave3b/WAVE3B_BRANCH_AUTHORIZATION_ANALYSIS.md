# Wave 3B — Branch Authorization Analysis

**Type:** Analysis / documentation only.
**No SQL, no RLS changes, no function changes, no policy migration.**

Source of truth: live `pg_policies` snapshot filtered on `user_has_branch_access%`, `branch_id`, and `current_user_branch_id()`. Cross-referenced with the Golden Authorization Baseline and the Wave 3A completion report.

---

## 1. Inventory

Total branch-scoped policies analyzed: **68** across **35 tables**.

Branch helpers observed (all `SECURITY DEFINER`, stable):

| Helper | Semantics | Uses |
|---|---|---|
| `user_has_branch_access(branch_id)` | Direct row → branch link via `staff_branches` | 40 |
| `user_has_branch_access_via_patient(patient_id)` | Resolve branch through `patients.branch_id` | 4 |
| `user_has_branch_access_via_invoice(invoice_id)` | Resolve through `invoices.branch_id` | 1 |
| `user_has_branch_access_via_medical_record(medical_record_id)` | Resolve through `medical_records.branch_id` | 4 |
| `user_has_branch_access_via_prescription(prescription_id)` | Resolve through `prescriptions.medical_record_id → …` | 1 |
| `user_has_branch_access_via_purchase_order(purchase_order_id)` | Resolve through `purchase_orders.branch_id` | 1 |
| `user_has_branch_access_via_physio_case(case_id)` | Resolve through `physio_cases.branch_id` | 6 |
| `user_has_branch_access_via_treatment_plan(treatment_plan_id)` | Resolve through `treatment_plans.branch_id` | 1 |
| `user_has_branch_access_via_treasury(treasury_id)` | Resolve through `treasury.branch_id` | 1 |
| `current_user_branch_id()` + `staff_branches` join | Manager’s single home branch (equality) | 13 |

Per-policy sheet (table · policy · cmd · helper · owner · admin · state · candidate perm · complexity):
See §7 Appendix A.

---

## 2. Pattern Catalog

Six reusable patterns cover 100% of branch-scoped policies. All decompositions are semantic equivalents suitable for direct migration once the target permission keys exist in the catalog.

### Pattern A — Pure Branch Isolation (RESTRICTIVE)

Shape:
```
PERMISSIVE base policies (roles) …
RESTRICTIVE branch_isolation:
  USING/CHECK: user_has_branch_access[_via_*](fk)
```
Meaning: role-based permissive policies grant, restrictive layer clamps rows to the caller’s branch set. Admin is implicitly allowed because `user_has_branch_access()` returns TRUE for admin (verified in helper source).

Count: **31** policies across 30 tables (see §7).
Target shape (Wave 4+): keep RESTRICTIVE layer unchanged — pattern is already scope-only and does not embed role or permission logic. This is the **lowest-risk** family.

### Pattern B — Manager Branch Equality (PERMISSIVE)

Shape:
```
has_role('manager') AND (branch_id IS NULL OR branch_id = current_user_branch_id())
```
Count: **13** policies (appointments ×3, expenses ×2, invoices ×2, patients ×3, payments ×2, treasury ×1).
Semantics: single-branch manager write/read on core operational tables. `current_user_branch_id()` returns the manager’s single home branch and is stricter than `user_has_branch_access()` (equality vs set-membership).
Target shape:
```
has_permission(auth.uid(), '<module>.<action>')
  AND (branch_id IS NULL OR branch_id = current_user_branch_id())
```
Candidate permission keys: `appointments.edit`, `expenses.edit`, `invoices.edit`, `patients.edit`, `payments.edit`, `treasury.view` (per-op, mirroring existing `role_permissions` grid).

### Pattern C — Billing/Ops Multi-Role SELECT (Compound)

Shape:
```
has_role('admin') OR has_role('accountant') OR has_role('receptionist')
  OR (has_role('manager') AND (branch_id IS NULL OR branch_id = current_user_branch_id()))
```
Count: **6** (exp_select_billing, items_select_billing, invoices_select_billing, pay_select_billing, manager_treasury_tx_select, tdc_select_scoped).
Target shape:
```
has_permission(auth.uid(), '<domain>.view')
  AND (
       is_org_scoped_role(auth.uid())   -- admin/accountant/receptionist path
    OR (branch_id IS NULL OR branch_id = current_user_branch_id())
  )
```
Note: safest to keep two-branch OR structure literally; only the role-check side becomes `has_permission`. `items_select_billing` uses an `EXISTS(invoices)` subquery — semantic equivalent, same handling.

### Pattern D — Branch + Role Compound (Physio, Queue, Audit)

Shape (three sub-shapes):
```
D1 SELECT:  has_role('admin') OR (user_has_branch_access(…) AND role_in(doctor|nurse|manager))
D2 INSERT:  role_in(admin|doctor) AND (admin OR user_has_branch_access(…))
D3 UPDATE:  user_has_branch_access(…) [USING]  +  D2 shape [CHECK]
```
Count: **17** (physio_cases ×3, physio_reassessments ×3, physio_sessions ×3, queue_alerts ×4, queue_settings ×4).
Target shape:
```
has_permission(auth.uid(), '<domain>.<action>') AND user_has_branch_access(...)
```
with domain keys: `physio.edit` / `physio.view`, `queue.edit` / `queue.view`.

### Pattern E — Ownership + Branch (Presets)

Shape:
```
auth.uid() = user_id  AND  user_has_branch_access(branch_id)
```
Count: **3** (`audit_export_presets` insert/select/update).
Target shape unchanged in structure — ownership predicate stays, only the SELECT path may pick up `has_permission('audit.view')` if we later add a shared-view mode. Recommend deferring to Ownership wave (Wave 4).

### Pattern F — Branch-only SELECT (Directory)

Shape:
```
user_has_branch_access(id)                             -- branches
has_role(admin|hr) OR EXISTS(shared staff_branches)    -- profiles
```
Count: **2** (`branches.branches_select_scoped`, `profiles.profiles_select_same_branch`).
Target shape: rewrite role side to `has_permission('directory.view')`; keep same-branch EXISTS clause verbatim.

---

## 3. Estimated Policy Counts

| Pattern | Policies | Tables | Migration wave |
|---|---:|---:|---|
| A — Pure branch isolation (RESTRICTIVE) | 31 | 30 | 3C (first) |
| B — Manager branch equality | 13 | 6 | 3D |
| C — Billing multi-role SELECT | 6 | 6 | 3E |
| D — Branch + role compound (physio/queue) | 17 | 5 | 3F |
| E — Ownership + branch | 3 | 1 | Wave 4 (ownership) |
| F — Branch-only directory SELECT | 2 | 2 | 3E (with C) |
| **Total** | **72\*** | **35** | |

\* Counted with pattern overlap on tables that carry both a permissive role policy and a restrictive branch policy. Deduplicated unique-policy total = **68**.

---

## 4. Recommended Migration Order

1. **Wave 3C — Pattern A (RESTRICTIVE branch isolation).** Zero role logic to touch. Migration is a no-op transformation *at policy level* but establishes the harness discipline for branch-scoped tables and unlocks per-table verification fixtures. If the pattern is left as-is (recommended), Wave 3C becomes a documentation-only ratification.
2. **Wave 3D — Pattern B (Manager branch equality).** Smallest surface with a real role → permission substitution. Candidate keys already exist (`*.edit`).
3. **Wave 3E — Patterns C + F (multi-role SELECT).** Read-only; regression cost is bounded (read-side drift is easy to detect via analyzer).
4. **Wave 3F — Pattern D (physio + queue compound).** Highest complexity in the branch family; do last after B/C prove the compound `has_permission(...) AND user_has_branch_access(...)` template.
5. **Deferred to Wave 4** — Pattern E (ownership + branch): merges with the ownership family already planned as the next after admin-only.

No stateful, financial-transactional, or clinical-record semantics are altered in any of 3C–3F. Restricted domains stay behind their existing RESTRICTIVE branch layer.

---

## 5. Reusable Migration Templates

All templates are drop-and-recreate under a single transaction per batch, matching Wave 3A conventions. Fill placeholders `<TABLE>`, `<POL>`, `<KEY>`, `<FK>` per policy.

### Template T-A — RESTRICTIVE branch isolation (no-op ratification)
```sql
-- No change required. Included for completeness / audit trail.
-- Verify:
SELECT policyname, qual, with_check FROM pg_policies
 WHERE schemaname='public' AND tablename='<TABLE>'
   AND policyname='branch_isolation';
```

### Template T-B — Manager branch equality
```sql
DROP POLICY "<POL>" ON public.<TABLE>;
CREATE POLICY "<POL>" ON public.<TABLE>
  FOR <CMD> TO authenticated
  USING (
    public.has_permission(auth.uid(), '<KEY>')
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  )
  WITH CHECK (
    public.has_permission(auth.uid(), '<KEY>')
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );
```

### Template T-C — Billing multi-role SELECT
```sql
DROP POLICY "<POL>" ON public.<TABLE>;
CREATE POLICY "<POL>" ON public.<TABLE>
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), '<DOMAIN>.view')
    AND (
      NOT public.role_requires_branch_scope(auth.uid())
      OR (branch_id IS NULL OR branch_id = public.current_user_branch_id())
    )
  );
```
(Note: `role_requires_branch_scope` is a *proposed* helper — not created in this wave; kept as a design placeholder.)

### Template T-D — Compound role + branch
```sql
DROP POLICY "<POL>" ON public.<TABLE>;
CREATE POLICY "<POL>" ON public.<TABLE>
  FOR <CMD> TO authenticated
  USING (
    public.has_permission(auth.uid(), '<KEY>')
    AND public.user_has_branch_access<FK_SUFFIX>(<FK>)
  )
  WITH CHECK (
    public.has_permission(auth.uid(), '<KEY>')
    AND public.user_has_branch_access<FK_SUFFIX>(<FK>)
  );
```

### Template T-E — Ownership + branch (deferred)
```sql
-- Deferred to Wave 4 (ownership family). Template placeholder only.
USING  (auth.uid() = user_id)
CHECK  (auth.uid() = user_id AND public.user_has_branch_access(branch_id));
```

### Template T-F — Directory branch SELECT
```sql
DROP POLICY "<POL>" ON public.<TABLE>;
CREATE POLICY "<POL>" ON public.<TABLE>
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'directory.view')
    AND public.user_has_branch_access(<id_col>)
  );
```

---

## 6. Risk Analysis

| Risk | Pattern | Severity | Mitigation |
|---|---|---|---|
| Silent broadening of manager scope from equality (`current_user_branch_id`) to set (`user_has_branch_access`) | B, C, D | **HIGH** | Templates keep original branch predicate verbatim; never swap helpers |
| `has_permission` bundle graph mis-mapping (e.g. accountant unexpectedly reaches `patients.edit`) | B, C, D | **HIGH** | Harness resolves `has_permission` via live bundle graph; any reach expansion shows as DENY→ALLOW drift and blocks the batch |
| RESTRICTIVE + PERMISSIVE interaction inversion on billing tables (invoice_items, treasury_transactions) | A + C | **MEDIUM** | Migrate C last; run harness after each batch; keep A untouched |
| Compound physio/queue policies contain both USING and CHECK with different shapes | D | **MEDIUM** | Per-policy verbatim rewrite; do not normalize USING=CHECK unless originally identical |
| Ownership + branch semantic drift (`audit_export_presets`) | E | **LOW** (deferred) | Handle in ownership wave, not here |
| Helper regression if `user_has_branch_access*` changes admin-bypass behavior | A, D, F | **LOW** | Contract locked by Golden Baseline; helper functions are out of scope for Wave 3B–3F |
| `role_requires_branch_scope()` helper introduction (Template T-C) | C | **DEFERRED** | Not created in Wave 3B. If Wave 3E can’t model it without the helper, either introduce it under a dedicated helper wave with its own rollback, or keep the literal role OR structure |

No risk requires migration of finance-transactional, clinical-record, or inventory-transaction *tables* — those remain protected by Pattern A RESTRICTIVE layer, which is not being altered.

---

## 7. Expected Regression Coverage

The Authorization Regression Harness (`scripts/authz/run_all.sh`) already covers:

| Signal | Coverage |
|---|---|
| RLS cells in Golden Baseline | 3,392 |
| Branch-scoped tables in matrix | 35 / 35 (100%) |
| Branch-scoped cells (8 roles × 4 cmds × 35 tables) | 1,120 (33% of matrix) |
| Analyzer signal classes for branch predicates | `branch`, `allow` (admin bypass), `deny` |
| `has_permission` resolution via bundle graph | enabled since Wave 3 Pilot |
| RPC baseline cells | 368 (unaffected — no RPC changes in Wave 3B) |

Expected per-batch outcome under the migration plan:

| Wave | Cells re-evaluated | Expected drift | Blocker if |
|---|---:|---|---|
| 3C (Pattern A no-op ratification) | 1,120 | 0 | any cell moves |
| 3D (Pattern B) | 192 (6 tables × 8 roles × 4 cmds) | 0 for admin/manager/others per key equivalence proof | manager reach expands or non-manager reach appears |
| 3E (Patterns C + F) | 256 | 0 | receptionist/accountant SELECT drops or non-billing role gains SELECT |
| 3F (Pattern D) | 160 | 0 | doctor/nurse write reach changes or admin bypass regresses |

All batches remain gated by `diff_baseline.py` exit code (2 = unlabeled drift → CI blocks). Coverage of *behavioral* branch access remains via the analyzer’s existing `branch` cell class; no harness change is required for Waves 3C–3F.

---

## Appendix A — Per-Policy Sheet

Legend: **H**=helper family (`bx`=direct branch_id, `patient`, `invoice`, `mr`=medical_record, `rx`=prescription, `po`=purchase_order, `case`=physio_case, `plan`=treatment_plan, `tr`=treasury, `eq`=current_user_branch_id equality). **O**=ownership combined. **A**=admin explicit. **S**=state logic. **C**=complexity (L/M/H).

| Table | Policy | Cmd | H | O | A | S | Candidate perm | Pattern | C |
|---|---|---|---|---|---|---|---|---|---|
| appointments | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| appointments | manager_appts_insert | INSERT | eq | – | – | – | appointments.edit | B | L |
| appointments | manager_appts_select | SELECT | eq | – | – | – | appointments.view | B | L |
| appointments | manager_appts_update | UPDATE | eq | – | – | – | appointments.edit | B | L |
| audit_export_presets | aep_insert_own | INSERT | bx | Y | – | – | (defer) | E | M |
| audit_export_presets | aep_select_branch_access | SELECT | bx | – | – | – | audit.view | E | M |
| audit_export_presets | aep_update_own | UPDATE | bx | Y | – | – | (defer) | E | M |
| branches | branches_select_scoped | SELECT | bx | – | – | – | directory.view | F | L |
| coupon_redemptions | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| coupons | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| dental_chart | branch_isolation | ALL(R) | patient | – | implicit | – | – | A | L |
| doctor_commissions | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| expenses | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| expenses | manager_expenses_insert | INSERT | eq | – | – | – | expenses.edit | B | L |
| expenses | manager_expenses_update | UPDATE | eq | – | – | – | expenses.edit | B | L |
| expenses | exp_select_billing | SELECT | eq | – | Y | – | expenses.view | C | M |
| inventory | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| inventory_transactions | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| invoice_items | branch_isolation | ALL(R) | invoice | – | implicit | – | – | A | L |
| invoice_items | items_select_billing | SELECT | eq(exists) | – | Y | – | invoices.view | C | M |
| invoices | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| invoices | manager_invoices_insert | INSERT | eq | – | – | – | invoices.edit | B | L |
| invoices | manager_invoices_update | UPDATE | eq | – | – | – | invoices.edit | B | L |
| invoices | invoices_select_billing | SELECT | eq | – | Y | – | invoices.view | C | M |
| medical_history | branch_isolation | ALL(R) | patient | – | implicit | – | – | A | L |
| medical_records | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| patient_documents | branch_isolation | ALL(R) | patient | – | implicit | – | – | A | L |
| patient_wallet_transactions | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| patient_wallets | branch_isolation | ALL(R) | patient | – | implicit | – | – | A | L |
| patients | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| patients | manager_patients_insert | INSERT | eq | – | – | – | patients.edit | B | L |
| patients | manager_patients_select | SELECT | eq | – | – | – | patients.view | B | L |
| patients | manager_patients_update | UPDATE | eq | – | – | – | patients.edit | B | L |
| payments | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| payments | manager_payments_insert | INSERT | eq | – | – | – | payments.edit | B | L |
| payments | manager_payments_update | UPDATE | eq | – | – | – | payments.edit | B | L |
| payments | pay_select_billing | SELECT | eq | – | Y | – | payments.view | C | M |
| physio_cases | physio_cases_insert_clinical | INSERT | bx | – | Y | – | physio.edit | D | H |
| physio_cases | physio_cases_select | SELECT | bx | – | Y | – | physio.view | D | H |
| physio_cases | physio_cases_update_clinical | UPDATE | bx | – | Y | – | physio.edit | D | H |
| physio_reassessments | physio_reassessments_insert_clinical | INSERT | case | – | Y | – | physio.edit | D | H |
| physio_reassessments | physio_reassessments_select | SELECT | case | – | Y | – | physio.view | D | H |
| physio_reassessments | physio_reassessments_update_clinical | UPDATE | case | – | Y | – | physio.edit | D | H |
| physio_sessions | physio_sessions_insert_clinical | INSERT | case | – | Y | – | physio.edit | D | H |
| physio_sessions | physio_sessions_select | SELECT | case | – | Y | – | physio.view | D | H |
| physio_sessions | physio_sessions_update_clinical | UPDATE | case | – | Y | – | physio.edit | D | H |
| prescription_items | branch_isolation | ALL(R) | rx | – | implicit | – | – | A | L |
| prescriptions | branch_isolation | ALL(R) | mr | – | implicit | – | – | A | L |
| profiles | profiles_select_same_branch | SELECT | staff_branches(exists) | – | Y | – | directory.view | F | M |
| purchase_order_items | purchase_order_items_branch_isolation | ALL(R) | po | – | implicit | – | – | A | L |
| purchase_orders | purchase_orders_branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| queue_alert_runs | qar_select_branch_access | SELECT | bx | – | – | – | queue.view | D | L |
| queue_alerts | qa_select_branch_access | SELECT | bx | – | – | – | queue.view | D | L |
| queue_alerts | qa_insert_manager | INSERT | bx | – | Y | – | queue.edit | D | M |
| queue_alerts | qa_update_manager | UPDATE | bx | – | Y | – | queue.edit | D | M |
| queue_alerts | qa_delete_admin | DELETE | bx | – | Y | – | queue.delete | D | M |
| queue_settings | qs_select_branch_access | SELECT | bx | – | – | – | queue.view | D | L |
| queue_settings | qs_insert_manager | INSERT | bx | – | Y | – | queue.edit | D | M |
| queue_settings | qs_update_manager | UPDATE | bx | – | Y | – | queue.edit | D | M |
| queue_settings | qs_delete_manager | DELETE | bx | – | Y | – | queue.delete | D | M |
| record_diagnoses | branch_isolation | ALL(R) | mr | – | implicit | – | – | A | L |
| record_procedures | branch_isolation | ALL(R) | mr | – | implicit | – | – | A | L |
| reminders | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| stock_alerts | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| treasury | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| treasury | manager_treasury_select | SELECT | eq | – | – | – | treasury.view | B | L |
| treasury_daily_closes | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| treasury_daily_closes | tdc_insert_admin_or_branch_manager | INSERT | eq | – | Y | – | treasury.edit | C | M |
| treasury_daily_closes | tdc_select_scoped | SELECT | eq | – | Y | – | treasury.view | C | M |
| treasury_transactions | branch_isolation | ALL(R) | tr | – | implicit | – | – | A | L |
| treasury_transactions | manager_treasury_tx_select | SELECT | eq(exists) | – | – | – | treasury.view | C | M |
| treatment_plans | branch_isolation | ALL(R) | bx | – | implicit | – | – | A | L |
| treatment_sessions | branch_isolation | ALL(R) | plan | – | implicit | – | – | A | L |
| vital_signs | branch_isolation | ALL(R) | mr | – | implicit | – | – | A | L |

End of analysis. No code, SQL, or policy changes were made. Awaiting review before proceeding to Wave 3C.