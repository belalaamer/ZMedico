# Authorization Standards

**Status:** Ratified — immutable constitution of the Authorization System.
**Effective:** From this commit forward, for every future wave (R5+).
**Scope:** Every permission, bundle, role, RLS policy, RPC, Edge Function, frontend gate, and CI check in this project.
**Change control:** This document may only be amended by full Approval Authority Board quorum (see `docs/governance/CHARTER.md` §4) recorded in `docs/governance/CHARTER_HISTORY.md`. No PR may violate it; violations MUST fail CI.

> If a rule here conflicts with any other document in the repository, **this document wins**. All other authorization docs are derived or advisory.

---

## 1. Permission Naming Standard

### 1.1 Canonical syntax

```
<domain>.<resource>.<action>
```

Regex (CI-enforced):

```
^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.(view|list|create|edit|delete|approve|export|configure|dispense|refund|receive|run|close|reassess|credit|debit|log|compose|send|manage|request|cancel|submit|adjust|upload|read)$
```

- `domain` — one of the registered Groups in `docs/normalization/N1_PERMISSION_TAXONOMY_V2.md` §2. Lowercase snake_case. Never invented ad-hoc.
- `resource` — the entity acted upon. Lowercase snake_case. **Singular** (`invoice`, not `invoices`) unless the resource is inherently a collection (`inventory`, `attendance`). The group segment MAY be plural (historical: `patients.*`); the resource segment MUST NOT introduce new plurals.
- `action` — exactly one verb from the closed set below. No synonyms.

### 1.2 Canonical verbs (closed set)

| Verb | Meaning |
|---|---|
| `view` | Read a single row or list-scoped view |
| `list` | Enumerate rows (used only when distinct from `view`) |
| `create` | Insert |
| `edit` | Mutate an existing row |
| `delete` | Remove (hard or soft) |
| `export` | Bulk read + download; audited separately from `view` |
| `approve` | Advance a workflow stage |
| `configure` | Change domain-level settings (not per-row) |
| Domain verbs | `dispense`, `refund`, `receive`, `run`, `close`, `reassess`, `credit`, `debit`, `log`, `compose`, `send`, `manage`, `request`, `cancel`, `submit`, `adjust`, `upload`, `read` |

Any new verb requires a C1 change (Charter §5) and MUST be added to this list in the same PR.

### 1.3 Forbidden names

- Uppercase, camelCase, kebab-case (`Patients.View`, `patient-view`).
- Verb-first (`view.patients.*`).
- Wildcards (`patients.*`, `*.view`).
- Umbrella keys (`reports.view` — see N4; being deprecated).
- Synonyms of canonical verbs (`read`, `write`, `remove`, `list_all`, `browse`, `fetch`, `get`, `put`, `post`, `send_email`).
- Role names embedded in keys (`doctor.patients.view`).
- Booleans / negations (`patients.no_delete`).

### 1.4 Examples

Valid: `invoices.invoice.create`, `patients.patient.export`, `physio.case.close`, `payroll.run.run`, `settings.branch.configure`.
Historical two-segment keys (`invoices.create`) are grandfathered as `<group>.<action>` where the group also names the resource; **no new two-segment keys may be added**.

### 1.5 Anti-patterns

- `patients.full_access` — collapses verbs; use a bundle.
- `admin.everything` — role masquerading as permission.
- `finance.reports.viewOrExport` — compound verbs.
- `hr_v2.staff.view` — versioning in the key; version the catalog, not the key.

---

## 2. Permission Lifecycle

See `docs/governance/LIFECYCLE_POLICY.md` for the full state machine. Summary of the binding rules:

| State transition | Who may authorise | Required evidence |
|---|---|---|
| Draft → Approved | Business chair + Technical chair | Owner assignment, taxonomy conformance, at least one planned bundle grant |
| Approved → Active | Technical chair | First RLS/frontend consumer merged, harness green |
| Active → Deprecated | Full quorum | Replacement key Active OR business op retired; usage report attached |
| Deprecated → Retired | Full quorum + DPO if Regulatory ≠ None | ≥30d (Low) / 60d (Med) / 90d (High/Critical) dwell with **0 call sites** |
| Any → Rejected | Any chair | Documented rationale in PR |

**Deletion is never a first-class action.** A permission is retired through the state machine; direct `DELETE FROM authz_permissions` is a CI blocker (§9).

**Who can create a permission:** any engineer may propose one in a PR; it enters `Draft` on merge of the design doc, `Approved` only after the Board approvals above.

---

## 3. Bundle Rules

A bundle is a **named grouping of permissions** consumed by roles. It is not a role, not a scope, not a feature flag.

### 3.1 Structural limits

- **Max permissions per bundle:** 40. Above this, split by sub-domain.
- **Max responsibilities per bundle:** 1. A bundle names exactly one coherent business responsibility (e.g. "Manage invoices end-to-end"). If the one-sentence description needs "and", split.
- **Max depth of `authz_bundle_implies`:** 2. Deeper chains are forbidden (readability + cycle risk).
- **Naming:** `<domain>_<responsibility>` snake_case (e.g. `invoices_manage`, `physio_clinician`). No role names in bundle names.

### 3.2 Forbidden bundle structures

- **Cycles** in `authz_bundle_implies`.
- **Cross-domain grab-bags** (`operations_everything`).
- **Role-shaped bundles** whose name matches an `app_role` value; roles map *to* bundles, not the reverse.
- **Empty bundles** or bundles bound to zero roles for >30d (see §9 orphan rule).
- **Duplicate bundles** — two bundles with identical permission sets. Consolidate.

### 3.3 When to split a bundle

- It exceeds 40 permissions.
- Two roles want disjoint subsets of it.
- Its description contains "and" between responsibilities.
- A permission needs a stricter approval class (C2/C3/C4) than the bundle's average.

### 3.4 When NOT to create a bundle

- To grant a single permission to a single role — grant directly via `authz_role_bundles` only if it forms a coherent responsibility; otherwise use an existing bundle.
- To model a scope (branch, tenant) — scope belongs in RLS predicates, never in bundles.
- To model a workflow state — state belongs in the row, never in bundles.

---

## 4. Role Rules

### 4.1 Principles

- A role is an **identity label** representing a job function, nothing more.
- Roles map to bundles via `authz_role_bundles`. They MUST NOT be referenced by permission checks in frontend, backend, RPCs, or RLS (except the R3 Class D compatibility utilities documented in `R3_RPC_AUTHORIZATION_INVENTORY.md`).
- The full role list lives in the `app_role` enum. Adding a value is a C2 change.

### 4.2 Forbidden

- **Business logic inside roles.** No `if (role === 'doctor')`. Ever. Use permissions.
- **Role hierarchy.** No "senior_doctor extends doctor". If overlap exists, share a bundle.
- **Role inheritance.** The DB has no role-of-role relation; do not fake it in code.
- **Role explosion.** Do not create a role per persona per branch (`doctor_branch_a`). Persona is a role; branch is scope.
- **Role checks in RLS** except through `has_role()` inside a Class D utility.
- **Storing role on `profiles` / `users` / any table other than `user_roles`.** Enforcement per repo security guidance.

### 4.3 New roles

Adding an `app_role` value requires: business justification, at least one bundle binding in the same migration, DPO sign-off if the role touches regulated data, and an entry in `docs/RBAC_MATRIX.md`.

---

## 5. Authorization Decision Rules

Every authorization decision — frontend, RPC, RLS, edge function — MUST evaluate the following pipeline **in order**. Skipping a stage is a design bug.

```
Authentication  →  is auth.uid() present and valid?
       ↓
Permission      →  has_permission(auth.uid(), '<key>')
       ↓
Scope           →  tenant_id / branch_id match?
       ↓
Ownership       →  is the row owned/assigned to the actor when the permission requires it?
       ↓
Business Rules  →  domain invariants (e.g. invoice not locked)
       ↓
State           →  row is in a state that permits this action
       ↓
Approval        →  dual-control / four-eyes if the key demands it
       ↓
RLS             →  the row is visible under the RESTRICTIVE tenant/branch predicate
       ↓
Audit           →  the decision and its outcome are recorded
```

No exceptions. Any stage that is genuinely N/A for a given decision MUST be documented in the PR ("Ownership: N/A — global settings").

---

## 6. AUTHZ vs STATE Rule

**Permission logic answers "may this actor do X in principle?" State logic answers "is X allowed right now given the row's state?" They MUST be evaluated as separate clauses.**

Every policy or check that mixes them MUST refactor into an `AUTHZ ∧ STATE` split.

### 6.1 Bad (mixed)

```sql
CREATE POLICY invoice_edit ON invoices FOR UPDATE
USING (
  has_role(auth.uid(), 'finance_admin')
  AND status <> 'paid'
  AND locked_at IS NULL
);
```

### 6.2 Good (split)

```sql
CREATE POLICY invoice_edit ON invoices FOR UPDATE
USING (
  -- AUTHZ
  has_permission(auth.uid(), 'invoices.invoice.edit')
  AND
  -- STATE
  (status <> 'paid' AND locked_at IS NULL)
);
```

### 6.3 Frontend example

```ts
// BAD
const canEdit = authz.can('invoices.invoice.edit') && invoice.status !== 'paid';

// GOOD — same expression, but callers see the two facets explicitly:
const mayEdit  = authz.can('invoices.invoice.edit');           // AUTHZ
const editable = invoice.status !== 'paid' && !invoice.locked_at; // STATE
const canEdit  = mayEdit && editable;
```

State clauses MUST NOT call `has_permission` / `has_role`. Permission clauses MUST NOT reference row columns other than tenant/branch scope keys.

---

## 7. Registry Rules

The Permission Registry (`authz_permissions` + `docs/PERMISSION_CATALOG.md`) is the **single source of truth**.

### 7.1 The only allowed flow

```
Registry  →  Bundle  →  Role  →  Frontend  →  Backend  →  RLS
```

Every permission MUST originate in the Registry, be grouped in a Bundle, be bound to a Role, and only then be consumed by any frontend, backend, RPC, or RLS check. Every other flow is rejected.

### 7.2 Forbidden

- Frontend gate referencing a key that does not exist in `authz_permissions`.
- RLS policy referencing a permission key not in `authz_permissions`.
- Bundle granting a key not in `authz_permissions`.
- Role bound to a bundle that does not exist.
- Direct role checks (`has_role`) in client-callable RPCs (Class A/B).
- Any authorization decision that bypasses `has_permission()` — including "temporary" `if (isAdmin)` branches outside `AuthorizationService.isSuperAdmin()`.

### 7.3 Change ordering

In every PR that introduces a new key: **Registry migration first, then bundle grant, then role binding, then consumer.** The reverse order is a CI blocker.

---

## 8. Documentation Rules

### 8.1 Authoritative (hand-edited, versioned, board-approved)

- `docs/AUTHORIZATION_STANDARDS.md` — this file.
- `docs/governance/CHARTER.md`, `LIFECYCLE_POLICY.md`, `OWNERSHIP_MATRIX.md`, `PRODUCT_DECISIONS.md`.
- `docs/normalization/N1_PERMISSION_TAXONOMY_V2.md` — group registry + verb set.
- `docs/RBAC_MATRIX.md` — role ↔ bundle authoritative binding.
- `docs/BUSINESS_OPERATIONS_CATALOG.md` — business ops feeding permission design.
- `scripts/authz/rpc_manifest.yaml` — authoritative RPC classification.
- `scripts/authz/intentional_changes.txt` — labelled Golden Baseline diffs.

### 8.2 Derived (regenerated; never hand-edited)

- `docs/PERMISSION_CATALOG.md`
- `docs/normalization/N3_PERMISSION_COVERAGE_MATRIX.md`
- `docs/normalization/N5_AUTHORIZATION_DEPENDENCY_GRAPH.md`
- `docs/GOLDEN_AUTHORIZATION_BASELINE.md`
- `docs/execution/runtime/R3/R3_RPC_AUTHORIZATION_INVENTORY.md`
- `docs/execution/runtime/R4/R4_SECURITY_DEFINER_INVENTORY.md`
- Any file whose header contains "GENERATED — DO NOT EDIT".

### 8.3 Advisory (may be edited but non-binding)

- Wave execution reports, architecture reviews, readiness certifications.

### 8.4 Rule

When the authoritative and derived layers disagree, **the authoritative wins and the derived is regenerated**. Editing a derived file by hand is a CI blocker.

---

## 9. CI Rules (build blockers)

`scripts/authz/run_all.sh` with `GUARDRAILS_STRICT=1` MUST fail the build on any of the following:

1. **Invalid permission name** — key does not match the §1.1 regex.
2. **Permission not in registry** — a frontend gate, RPC, or RLS policy references a key absent from `authz_permissions`.
3. **Orphan bundle** — bundle bound to no role for >30d, or empty for >7d.
4. **Orphan permission** — permission granted to no bundle for >30d and not marked `Deprecated`.
5. **Duplicate permission** — two rows in `authz_permissions` with identical `key`.
6. **Duplicate bundle** — two bundles with identical permission sets.
7. **Undocumented RPC** — client-callable RPC not listed in `scripts/authz/rpc_manifest.yaml` (Class A/B).
8. **Undocumented RLS** — new policy on `public.*` without a corresponding entry in the migration description and coverage matrix regeneration.
9. **Undocumented role** — new `app_role` value without an `RBAC_MATRIX.md` row and at least one bundle binding.
10. **Undocumented bundle** — new bundle without a description or `OWNERSHIP_MATRIX.md` entry.
11. **Role check in client-callable RPC** — `has_role(...)` inside a Class A/B function.
12. **Client-supplied actor** — RPC parameter named `_by`, `_actor`, `_user_id`, `_uid` used for authorization instead of `auth.uid()`.
13. **Mixed AUTHZ ∧ STATE** — RLS `USING`/`WITH CHECK` combining `has_permission` and row-state predicates without the split delimiter comment.
14. **Public table without GRANT** — new `CREATE TABLE public.*` migration lacking `GRANT` statements.
15. **Public table without RLS** — new public table without `ENABLE ROW LEVEL SECURITY` and at least one policy.
16. **Hand-edited derived doc** — checksum mismatch on a `GENERATED — DO NOT EDIT` file.
17. **Golden Baseline drift** — diff vs snapshot not labelled in `intentional_changes.txt`.
18. **Direct `DELETE FROM authz_permissions`** — permission removal outside the lifecycle state machine.
19. **Wildcard permission** — any key containing `*`.
20. **Frontend authz outside `AuthorizationService`** — grep hits for `role ===`, `roles.includes(`, `isAdmin` outside `src/lib/authz/`.

Strict mode is mandatory for the entire R5 milestone and any branch touching `authz_*` tables or RLS.

---

## 10. Future Rules

### 10.1 Adding a new module

1. Register the group in `N1_PERMISSION_TAXONOMY_V2.md` §2.
2. Draft its permissions in the same PR using the §1 syntax.
3. Design at least one bundle (§3) grouping the new keys by responsibility.
4. Bind the bundle to existing roles or, if genuinely new, propose an `app_role` value (§4.3).
5. Migrate: Registry → Bundle → Role → RLS → Frontend consumers, in that order.
6. Update `RBAC_MATRIX.md`, `OWNERSHIP_MATRIX.md`, and regenerate derived docs.

### 10.2 Adding a new permission

1. Confirm no existing key covers the operation (grep the Registry).
2. Verify the verb is in the §1.2 closed set; if not, propose a verb-set amendment first.
3. Insert into `authz_permissions` (state `Draft`).
4. Add to a bundle in the same or a following PR (state → `Approved`).
5. Wire the first consumer (state → `Active`).

### 10.3 Adding a new bundle

1. Write a one-sentence responsibility. If it contains "and", stop.
2. Confirm no existing bundle covers it (§3.2 duplicate rule).
3. Create the bundle, grant permissions, bind to roles, all in one migration.

### 10.4 Removing a deprecated permission

1. Mark `deprecated = true`; announce in the weekly Board digest.
2. Weekly usage report must show 0 call sites for the dwell period (§2).
3. Full-quorum approval + DPO sign-off if Regulatory ≠ None.
4. Retire migration removes the key; archived under `docs/execution/retirements/`.
5. Regenerate derived docs.

---

## Authorization Contract — PR Checklist

Every Pull Request that touches authorization (permissions, bundles, roles, RLS, RPCs with SECURITY DEFINER, frontend gates, edge functions, or any file under `scripts/authz/`) MUST tick every box below before merge. Missing boxes = automatic reject.

```
[ ] 1.  Every new permission key matches the §1.1 regex.
[ ] 2.  Every new key is registered in authz_permissions BEFORE any consumer references it.
[ ] 3.  Every new key is placed in exactly one bundle with a single responsibility.
[ ] 4.  No new role added without an app_role migration + RBAC_MATRIX row + bundle binding.
[ ] 5.  No frontend authorization decision outside AuthorizationService.
[ ] 6.  No has_role() introduced in a client-callable RPC (Class A/B).
[ ] 7.  No client-supplied actor parameter used for authorization (auth.uid() only).
[ ] 8.  Every RLS policy expresses AUTHZ ∧ STATE as separate, commented clauses.
[ ] 9.  Every new public table has ENABLE ROW LEVEL SECURITY + GRANTs + at least one policy.
[ ] 10. Every new client-callable RPC is listed in scripts/authz/rpc_manifest.yaml.
[ ] 11. Golden Baseline diff is either zero OR labelled in scripts/authz/intentional_changes.txt.
[ ] 12. scripts/authz/run_all.sh passes with GUARDRAILS_STRICT=1.
[ ] 13. No derived doc (§8.2) hand-edited; regeneration commit included if content changed.
[ ] 14. Rollback artifact committed under docs/execution/.../ROLLBACK.{md,sql}.
[ ] 15. PR description records: decision pipeline stages exercised (§5), lifecycle state changes (§2), approval class (Charter §5), evidence (Charter §6).
[ ] 16. DPO sign-off attached if Regulatory ≠ None or change class ≥ C4.
[ ] 17. Authorization Regression Harness green on this branch.
[ ] 18. No key deprecated less than its dwell period before retirement.
[ ] 19. No wildcard, synonym, umbrella, or role-shaped key introduced.
[ ] 20. This document (AUTHORIZATION_STANDARDS.md) not modified without full-quorum Board approval recorded in CHARTER_HISTORY.md.
```

---

*This is the final constitution of the Authorization System. R5 and every subsequent wave inherit these rules unchanged. Amendments require the process in the header of this document.*
