# ZMedico — Scope, Ownership & Resource Security Model

**Status:** Phase 3 — Authorization Refactoring. Documentation only.
**Version:** 1.0-draft
**Depends on:** `AUTHORIZATION_ARCHITECTURE.md`, `PERMISSION_CATALOG.md`, `ROLE_ARCHITECTURE.md`
**Non-goals:** No code, DB, RLS, permission, role, or migration changes are introduced by this document.

This document defines *where* data lives, *who* owns it, and *how far* an authenticated principal's authority reaches. It is the canonical companion to the Permission Catalog (which defines *what* actions exist) and the Role Architecture (which defines *who* is assigned bundles of permissions). A permission check in ZMedico is only complete when **(permission, scope, ownership, classification)** all resolve to *allow*.

---

## 1. Scope Model

A **scope** is the horizontal reach of a granted permission. Scope is orthogonal to the permission verb: `patients.record.view` may be granted at `own`, `branch`, `organization`, or `global` scope without changing its meaning — only its blast radius.

### 1.1 Canonical scopes

| Scope | Symbol | Reach | Typical grantee | Storage of scope |
|---|---|---|---|---|
| **Own** | `own` | Rows where the acting user is the direct owner (creator, primary provider, subject, or assignee) | Any authenticated user for self-service; providers for their patients | Derived at query time from `created_by`, `provider_id`, `user_id`, `assignee_id` |
| **Assigned** | `assigned` | Rows explicitly linked to the user via an assignment table (care team, task assignee, secondary provider) | Nurses on a care team, covering physicians, assigned case workers | Explicit link tables (e.g. `care_team_members`, `case_assignees`) |
| **Department** | `department` | Rows belonging to a department/specialty the user is a member of | Head of specialty, nursing supervisor | `staff_departments` link + `resource.department_id` |
| **Branch** | `branch` | Rows whose `branch_id` is in the user's `staff_branches` set | Branch manager, receptionist, branch accountant | `staff_branches(user_id, branch_id)` |
| **Organization** | `organization` | Rows whose `organization_id` matches the user's home org | Regional director, org-level HR, corporate accountant | `staff_organizations(user_id, organization_id)` (future) |
| **Global** | `global` | All rows, all orgs | System owner, platform SRE, security auditor with break-glass | Role flag + hard audit |

### 1.2 Scope hierarchy & implication

Scopes form a strict lattice. A higher scope **implies** every lower scope for the same permission:

```text
global  ⊇  organization  ⊇  branch  ⊇  department  ⊇  assigned  ⊇  own
```

Implication is one-directional. `branch` grants access to *all* branch rows regardless of ownership; `own` never grants access to a sibling's rows even inside the same branch.

### 1.3 Scope interaction rules

1. **Union across grants.** If a user has `patients.record.view@own` from role A and `patients.record.view@branch` from role B, the effective scope is `branch` (the maximum).
2. **Intersection with data residency.** Effective reach = `min(user_scope, resource_residency)`. A `global`-scoped auditor still cannot see rows that live in an organization they are not enrolled in unless a `cross_org` grant exists.
3. **Scope is per-permission, not per-role.** The same role may hold `view@branch` and `delete@own` on the same resource; scope narrowing is expected and desired.
4. **Denies short-circuit.** A SoD conflict, break-glass revocation, or classification block terminates the check regardless of scope.
5. **Scope never widens through joins.** Reading `patients` at `branch` does not permit reading joined `medical_records` at `branch`; each resource re-checks scope.

---

## 2. Ownership Model

Every persisted resource has exactly one **primary owner** relationship, may have zero or more **secondary owners**, and always resolves to a **branch** and (future) **organization**. Ownership is the substrate on which `own` and `assigned` scopes are computed.

| Resource family | Primary owner | Secondary owner(s) | Branch ownership | Organization ownership |
|---|---|---|---|---|
| **Patient (demographic record)** | Registering branch (`patients.branch_id`) — patients are institutional, not personal | Primary physician (soft link) | `patients.branch_id` (branch of registration) | `patients.organization_id` (future) |
| **Appointment** | Assigned provider (`appointments.provider_id`) | Booking receptionist (`created_by`), care team | `appointments.branch_id` | Derived from branch |
| **Queue entry** | Front-desk operator on shift; provider once called | Nurse assigned to room | Branch of the queue | Derived |
| **Medical record / consultation** | Authoring provider (`medical_records.created_by` = provider) — *inviolable clinical authorship* | Co-signer, supervising physician | Branch at time of encounter (immutable) | Derived, immutable |
| **Prescription** | Prescribing provider | Dispensing pharmacist (future) | Branch of issuance (immutable) | Derived, immutable |
| **Vitals / observations** | Recording nurse or device | Supervising provider | Encounter branch | Derived |
| **Treatment plan** | Owning provider | Care team, patient (read-only via portal, future) | Branch of plan | Derived |
| **Physio case** | Assigned physiotherapist | Referring provider | Case branch | Derived |
| **Invoice** | Issuing branch (institutional) | Cashier (`created_by`), accountant of record | `invoices.branch_id` (immutable after post) | Derived |
| **Payment** | Receiving cashier (`payments.created_by`) | Reconciling accountant | `payments.branch_id` (immutable) | Derived |
| **Refund / adjustment** | Approving accountant | Requesting cashier | Branch of original transaction | Derived |
| **Coupon** | Issuing branch or org (per coupon scope) | — | `coupons.branch_id` or `NULL` for org-wide | Explicit |
| **Treasury account** | Branch | Treasury custodian (`custodian_user_id`) | `treasury.branch_id` (immutable) | Derived |
| **Treasury transaction** | Cashier who executed it | Accountant who reconciled | Branch of the account | Derived |
| **Expense** | Requesting user | Approving manager, paying accountant | Branch of expense | Derived |
| **Inventory item (SKU)** | Organization catalog | — | Org-wide definition; stock is per branch | Org |
| **Stock level** | Branch (`stock.branch_id`) | Warehouse manager | Branch | Derived |
| **Purchase order** | Requesting branch | Approving finance, receiving warehouse | `purchase_orders.branch_id` | Derived |
| **Supplier** | Organization | — | Shared across branches | Org |
| **Staff (user profile)** | The user themself | HR of record, direct manager | Home branch (`profiles.home_branch_id`) + assigned branches (`staff_branches`) | Org |
| **Attendance / leave** | The employee | Approving manager, HR | Branch of shift | Derived |
| **Payroll run** | HR / accountant | — | Branch or org depending on run scope | Explicit |
| **Report (saved / scheduled)** | Creator | Distribution list recipients | Branch if branch-scoped, else org | Explicit at creation |
| **Audit log entry** | System (immutable) | Security admin (custodial read) | Branch of the audited action | Derived |
| **Settings — branch** | Branch manager (write), all branch staff (read subset) | — | Branch | Derived |
| **Settings — org** | System owner / org admin | Security admin (read) | — | Org |
| **API token** | Creating principal | Security admin (revocation) | Token's declared scope | Org |

**Ownership is a first-class column, not a computed convenience.** Every resource table must carry the fields required to answer *"who owns this row?"* in a single lookup, so RLS and application checks never diverge.

---

## 3. Resource Classification

Classification determines the *baseline* protection floor. A `restricted` resource cannot be exposed by a `low` classification role even if a permission bug exists — classification acts as a defense-in-depth ceiling.

| Class | Definition | Examples | Baseline protection |
|---|---|---|---|
| **Public** | Anonymous consumption permitted by design | Landing pages, public branch directory, published price list (if enabled) | No auth, cacheable, no PII |
| **Internal** | Any authenticated staff may read; no PII/PHI | Service catalog, room list, non-financial settings, holiday calendar | Auth required, no classification-based deny |
| **Sensitive (PII)** | Contains personally identifiable info but no clinical/financial detail | Patient demographics, contact info, staff profiles, appointment metadata | Least privilege + branch scope + audit on export |
| **Highly Sensitive (PHI / Financial)** | Clinical facts, prescriptions, diagnostic imaging, invoices, payments | Medical records, prescriptions, vitals, invoices, payments, physio notes | Scoped role, immutable authorship, mandatory audit, export requires `pii_touch`/`phi_touch` permission |
| **Restricted** | Regulated or fiduciary; disclosure is legally/financially material | Treasury balances, payroll, insurance contracts, RBAC configuration, secrets, audit logs | Named individuals only, MFA on write, dual control on high-risk verbs, immutable audit |
| **Critical (Break-glass)** | System integrity — corruption is catastrophic | Role definitions, permission catalog, RLS policies, security memory, admin edge functions, service-role keys | Restricted to `security_admin` / `system_owner`, break-glass workflow, session recording, tamper-evident audit |

### Why classification exists separately from scope

A branch manager legitimately has `branch` scope on many things but must **never** reach `restricted` payroll for another employee even inside their branch. Classification prevents scope from being the only gate.

---

## 4. Resource Governance

For each resource family, the table below specifies the operational policy. This becomes the input to Phase 4 (RLS policy design) and Phase 5 (application guards).

Legend for scopes: `O` = own, `A` = assigned, `D` = department, `B` = branch, `Org` = organization, `G` = global. `—` = not permitted at any scope. Delete/Archive/Export columns describe *policy*, not implementation.

| Resource | View | Edit | Delete policy | Archive policy | Export policy | Audit requirement |
|---|---|---|---|---|---|---|
| Patient demographics | B / Org | B (front desk, HR-of-record) | Admin-only, soft-delete, reason required, dual control | Auto-archive after N years inactive (org policy) | `patients.export` permission; row-count logged | Every write; export bytes + row count |
| Appointment | B | B (front desk, provider owner) | Cancel-by-status only; hard delete admin-only | Auto-archive after visit + retention window | `appointments.export`, branch-scoped | Status changes always audited |
| Medical record | O / A / B (clinical roles only) | O only until finalized; amendments append-only after | Never hard-deleted; retract flag admin-only + regulatory hold check | Retained per regulatory tag (HIPAA-equivalent) | `medical_records.export.phi`; watermark + audit | Every read of finalized record audited (PHI access log) |
| Prescription | O / A / B (clinical) | O until dispensed; void with reason | Never deleted; void state only | Retained per controlled-substance regs | `prescriptions.export`; audit incl. drug schedule | Every issuance + view audited |
| Vitals | B (clinical) | O (nurse who recorded) within 24h; provider amend | Admin + reason | Retained with encounter | Bulk export requires `phi_touch` | Amend audit trail retained |
| Treatment plan | O / A / B | O / A | Retract only, no hard delete | Archived on completion | Export with plan permission | Version history immutable |
| Physio case | O / A / B | O / A | Retract with reason | Archive on discharge | `physio.export` | Case status changes audited |
| Invoice | B (finance + reception) | Draft: creator; Posted: accountant + reason | Void-only after post; hard delete admin + dual control | Auto-archive after fiscal close | `invoices.export`; PDF audit | Every state change audited |
| Payment | B (finance) | Cashier during shift; accountant after | Never deleted; reversal only, dual control | Retained per fiscal regs | `payments.export` | Every payment + reversal audited |
| Refund | B (finance) | Accountant with approval | Never deleted | Retained per fiscal regs | With payments | Dual approval logged |
| Coupon | B or Org (per coupon) | Issuer branch or org admin | Deactivate; no hard delete of used coupons | Archive on expiry | Coupon report export | Redemption audited |
| Treasury account | B (finance) | Admin + custodian | Admin-only; only when zeroed | Archive on close | `treasury.export` restricted | Every txn audited |
| Treasury transaction | B (finance) | Never edited; reversing entry only | Never deleted | Fiscal retention | Restricted | Every txn immutable + audited |
| Expense | B / Org (per expense) | Requester until submitted; approver after | Admin-only after payment | Fiscal retention | With finance report | Approval chain audited |
| Inventory SKU | Org (all staff read) | Org catalog admin | Deprecate; no hard delete with history | Deprecation flag | Org export | Catalog change audited |
| Stock level | B | B warehouse role | Adjustment entry only, no delete | With SKU | With inventory report | Adjustments audited |
| Purchase order | B (originating) + Org finance | Creator until submitted; approver during approval | Cancel-only after approval | Archive on close | With inventory report | Approval + receipt audited |
| Supplier | Org | Org catalog admin | Deactivate | Archive | Org export | Catalog change audited |
| Staff profile | O / D (manager) / Org (HR) | O for self-service fields; HR for HR fields | Deactivate; hard delete admin + retention exception | Deactivation on termination | HR export permission | Role/perm changes audited |
| Attendance / leave | O / D (manager) / Org (HR) | O for own submission; manager/HR for adjudication | Never deleted; correction entries only | Archive per HR retention | HR export | Every state change audited |
| Payroll | Restricted — HR + accountant only | HR / accountant with dual control | Never deleted; reversal only | Retained per tax regs | Restricted; MFA on export | Every access audited |
| Saved / scheduled report | O / recipients | O | Owner + admin | Auto-archive on schedule end | Per underlying data class | Distribution audited |
| Audit log | Security admin, org admin (read); system (write) | Immutable | Never deleted; append-only | Tamper-evident retention | Restricted; watermark on export | Access to audit log itself audited |
| Branch settings | B (read subset), branch admin (write) | Branch admin | Admin | Version history retained | Not exported | Every setting change audited |
| Org settings | Org admin | Org admin | System owner | Version history retained | Not exported | Every change audited + notified to security |
| API token | Creator + security admin | Creator (rotate); security admin (revoke) | Revoke only | Retained metadata after revoke | Never exported | Issuance, use, revocation audited |

---

## 5. Cross-Branch Rules

Default posture: **branch is a hard boundary.** Crossing branches requires an explicit permission qualifier (`.cross_branch`) or an org-scoped grant. The table lists the *only* legitimate cross-branch flows.

| Resource | May cross branches? | Under what conditions | Who authorizes |
|---|---|---|---|
| Patient demographics | **Yes** (single-patient continuity) | Patient physically presents at another branch; explicit patient-linkage flag; audit entry per cross-branch read | Any staff with `patients.record.view.cross_branch`; receptionist during check-in |
| Patient medical history | **Yes, read-only, audited** | Follows patient linkage; providers with `medical_records.view.cross_branch` | Provider on active encounter only |
| Appointment | **No** unless multi-branch provider | A provider practicing at multiple branches sees their own appointments across those branches | Automatic when `staff_branches` covers both |
| Queue | **No** | Queue is a branch-local operational artifact | — |
| Prescriptions | **Read-only cross-branch** | Continuity of care; write remains at issuing branch | `prescriptions.view.cross_branch` |
| Invoice / payment | **No** | Financial locality is regulatory | Only org-level finance roles see aggregated cross-branch reporting |
| Treasury | **No** | Each branch balances independently | Transfers between treasuries handled by explicit `treasury.transfer` action with dual-branch entries |
| Inventory transfer | **Yes, by design** | Explicit `inventory.transfer` transaction referencing source + destination branch | Warehouse manager at both branches or org-level inventory admin |
| Reports | **Yes, aggregated only** | Cross-branch views require `reports.*.cross_branch` or org scope; row-level drill-down re-checks scope | Org-scoped roles |
| Staff records | **Yes** for HR | HR sees org-wide staff; managers see only their branch staff | HR role |
| Insurance contracts | **Yes** | Contracts are org-level; usage recorded per branch | Org admin owns; branches consume |
| Coupons | **Depends on coupon scope** | Branch-issued coupons redeemable only at issuer; org-issued coupons redeemable anywhere | Coupon issuer defines scope at creation |
| Audit logs | **Yes** for security admin | Cross-branch investigation | `security_admin` |

**Cross-branch reads MUST be individually audit-logged** with `(actor_user_id, actor_branch_id, target_branch_id, resource, resource_id, reason_code)`.

---

## 6. Cross-Organization Rules

ZMedico today is effectively single-organization. This section pre-commits the model for multi-org so the schema evolves without breaking authorization.

### Principles
1. **Organization is the highest data residency boundary** below `global`. Nothing crosses organizations without an explicit `cross_org` permission qualifier.
2. **No implicit cross-org visibility from `global` scope.** A `system_owner` uses break-glass with per-org audit, not silent enumeration.
3. **Patient records may follow the patient across orgs only via explicit consent record** (`patient_consents.cross_org_share`) — for future franchise / referral networks.
4. **Finance, treasury, payroll, HR NEVER cross organizations.** Each org is a fiscal island.
5. **Catalogs (services, SKUs, insurance contracts) MAY be shared** through a designated "master org" pattern, subscribed to by member orgs. Shared rows are read-only downstream.
6. **Audit is per-org**; cross-org actions produce entries in both orgs' logs.
7. **API tokens carry `organization_id`**; a token issued for org A cannot address org B even if the principal is a member of both.

### Cross-org permission qualifiers reserved
`.cross_org` — explicit intent to reach outside home org. Attached to specific permissions only (e.g. `patients.record.view.cross_org`, `reports.consolidated.view.cross_org`). Never granted by default bundles.

---

## 7. Data Residency

Every resource is classified into one residency tier. This is a **property of the resource type**, not of an individual row.

| Residency | Meaning | Resources |
|---|---|---|
| **Branch Local** | Row belongs to exactly one branch; queries always filter by branch | Appointments, queue, invoices, payments, treasury accounts/transactions, expenses, stock levels, purchase orders, branch settings, attendance, branch-scoped reports, branch coupons |
| **Organization Shared** | Row belongs to an organization; visible across branches per role scope | Patient demographics + clinical history, staff profiles, service catalog, SKU catalog, suppliers, insurance contracts, org coupons, org reports, payroll, org settings, audit logs |
| **Global** | Row is platform-level; identical for every tenant | Permission catalog, bundle catalog, role catalog, system feature flags, platform audit config, schema migrations |

### Consequences
- Branch-local tables **must** carry `branch_id NOT NULL`; org-shared tables **must** carry `organization_id NOT NULL` (once multi-org lands).
- Any join that crosses residency tiers re-checks scope on the higher tier.
- A single API request may only mutate rows of one branch (except explicit multi-branch actions such as inventory transfer, which are transactional across two branches).

---

## 8. Ownership Resolution

How a query determines "does this actor own this row?" — expressed as **logic, not SQL/functions**.

### General resolver

```text
function owns(actor, resource):
    if resource.primary_owner_user_id == actor.user_id: return OWN
    if resource has assignment_link(actor.user_id):     return ASSIGNED
    if resource.department_id in actor.departments and actor.role_grants_department_scope(resource.type): return DEPARTMENT
    if resource.branch_id in actor.branches and actor.role_grants_branch_scope(resource.type):           return BRANCH
    if resource.organization_id == actor.organization_id and actor.role_grants_org_scope(resource.type): return ORGANIZATION
    if actor.role_grants_global_scope(resource.type):                                                    return GLOBAL
    return NONE
```

Effective ownership = **the highest tier that matches**. Permission checks compare the required scope against this resolved tier.

### Family-specific rules

| Family | Primary-owner column | Assignment link | Notes |
|---|---|---|---|
| Patients | `patients.branch_id` (institutional), `patients.primary_provider_id` (soft) | `care_team_members(patient_id, user_id)` | Patient is *institutionally* owned; provider ownership is advisory for `assigned` scope |
| Appointments | `appointments.provider_id` | `appointment_participants` (future) | Booker via `created_by` is a secondary owner only for cancel/reschedule within `created_by == user AND status == scheduled` |
| Medical records | `medical_records.created_by` | `co_signers(record_id, user_id)` | Authorship immutable; amendments create new rows |
| Prescriptions | `prescriptions.prescriber_id` | Dispenser link (future) | Prescriber immutable |
| Invoices | `invoices.branch_id` (owner), `invoices.created_by` (creator) | Accountant of record (soft) | Branch is owner; creator is bounded by status |
| Payments | `payments.created_by`, `payments.branch_id` | Reconciler (soft) | Cashier can view own during shift; branch scope after |
| Treasury txn | `treasury_transactions.created_by`, `.account_id → branch_id` | — | Immutable |
| Inventory stock | `stock.branch_id` | Warehouse role | SKU catalog resolved separately at org level |
| Staff | `profiles.user_id` (self), `profiles.home_branch_id` | `staff_branches`, manager relation | Self-owns self; HR org-owns for HR fields |
| Reports | `reports.created_by` | `report_recipients(user_id)` | Recipients get view-only |
| Audit log | System | `security_admin` (custodial) | No user owns audit entries |

### Resolution invariants
1. Ownership resolution **must** run before permission check; the check consumes the resolved scope.
2. Ownership resolution **must** be deterministic; ties (very rare) resolve to the **highest** tier that matches.
3. Ownership resolution **must** be branch-safe: a `branch` match only counts if `actor.staff_branches` contains `resource.branch_id`.
4. Ownership resolution **must** be identical in the DB (RLS) and in the app layer (guards). Divergence is a bug.

---

## 9. Scope Conflict Resolution

When multiple facts about the same actor+resource pair disagree, the following deterministic rules apply. **Deny always wins** unless a break-glass grant is presented and audited.

### 9.1 Precedence order (top wins)

1. **Classification block** — actor's max classification clearance < resource classification → **DENY** (no scope can override).
2. **SoD conflict** — action is on a permission listed in the actor's active SoD conflict set → **DENY**.
3. **Explicit deny** — negative grant (revocation, temporary block) → **DENY**.
4. **Break-glass allow** — active, time-boxed, audited elevation → **ALLOW** (still classification-gated).
5. **Positive grant with matching scope + ownership** → **ALLOW**.
6. **Default** → **DENY**.

### 9.2 Canonical conflict scenarios

| Scenario | Facts | Resolution | Reason |
|---|---|---|---|
| Doctor owns patient but branch mismatch | Doctor is `primary_provider_id`; patient's current `branch_id` is not in doctor's `staff_branches` | **ALLOW read** via `own`/`assigned` scope on clinical resources; **DENY branch-scoped views** (queue, appointments today) | Clinical continuity outranks branch locality; operational locality preserved |
| Manager has branch scope but no permission verb | Manager holds `branch` scope on `hr`; requests `payroll.run.execute` | **DENY** | Scope without permission is meaningless; permission is the axis, scope is the qualifier |
| Admin has permission but organization mismatch | System owner acts in an org they are not enrolled in | **DENY unless break-glass** (`admin.crossorg.breakglass`) with reason + audit | Organization is a hard tenancy boundary |
| Nurse recorded vitals in branch A, now works in branch B | `own` scope on the vitals row | **ALLOW read** (`own` persists); **DENY edit after 24h** per governance | Ownership is immutable; edit is time-boxed |
| Cashier posted payment, later transferred to another branch | `own` on payment row; branch no longer in `staff_branches` | **ALLOW read** for own historical rows; **DENY branch-wide view** | Immutable authorship survives transfer |
| Two roles grant different scopes | Role A: `view@own`, Role B: `view@branch` | Effective = `branch` (max) | Union across grants |
| One role grants `view@branch`, another explicitly revokes | Revoke wins | **DENY** | Deny > allow |
| Cross-branch patient read without qualifier | Actor has `view@branch` only; patient's branch differs | **DENY** unless `.cross_branch` qualifier present | Explicit intent required to cross branches |
| Classification exceeds clearance | Manager holds `payroll.view@branch` (misconfig); payroll is `restricted` and manager lacks `restricted` clearance | **DENY** | Classification is a floor beneath permissions |
| Assigned care-team member vs owning provider | Both hold `own`/`assigned`; conflict on edit | Highest-priority owner wins by resource rule (owning provider > care team member for clinical writes) | Documented per resource family |

### 9.3 Diagnostics requirement
Every deny must be **explainable**: the check that failed (classification / SoD / scope / ownership / missing verb) must be captured in structured logs so support can answer "why can't I…?" without reproducing the request.

---

## 10. Future Compatibility

### Telemedicine
- Encounters have no physical branch; introduce `branch.virtual` per organization that hosts virtual encounters and inherits org-level policies.
- Provider-branch assignment extends to virtual branches; patients acquire `assigned` scope automatically for their booked virtual provider.
- Recording/consent artifacts are `restricted` regardless of origin branch.

### AI Assistant
- The AI is a **subject principal** with its own service identity, bundles, and audit trail — never a shortcut around scope.
- AI runs at the **minimum scope of the invoking user, intersected with a hard-coded AI clearance ceiling** (never `restricted` writes, never cross-org).
- Every AI-issued query passes through the same ownership resolver as human callers.

### API integrations
- Every API token is issued for `(subject, organization, scope_set, expiry)`.
- Tokens cannot exceed the issuer's scope at time of use (dynamic re-check, not baked in).
- Machine tokens are never granted `global` scope. Break-glass is human-only.

### Franchises
- Franchises map onto the multi-org model: each franchise is an organization; the franchisor is a distinct org with `cross_org.read` on aggregate reporting only.
- Shared catalogs (services, SKUs) originate in the franchisor org and are subscribed (read-only) by franchisees.
- Financial data never crosses franchise boundaries.

### International deployment
- Data residency tier extends with a `region` axis (EU, MENA, US) enforced at the organization level.
- Cross-region reads require both `cross_org` and `cross_region` qualifiers.
- Classification tags carry regulatory tags (`GDPR`, `HIPAA`, `PDPL`) so residency logic can refuse egress to non-compliant regions.

---

## Appendix A — Field checklist for every new resource

When introducing any new persisted resource, its schema MUST include:

1. `id` (uuid, pk)
2. `organization_id` (uuid, not null — required once multi-org lands; today defaulted to the single org)
3. `branch_id` (uuid, nullable only for org-shared or global residency)
4. `created_by` (uuid → auth.users)
5. `created_at`, `updated_at`
6. Primary-owner column per resource family (e.g., `provider_id`, `custodian_user_id`) — even if identical to `created_by`, name it semantically
7. `deleted_at` (soft delete) unless resource is append-only
8. Classification and residency documented in this file **before** the migration is written

No resource ships without an entry in Section 2 (Ownership) and Section 4 (Governance) of this document.

---

**Nothing was modified.** This document is the canonical Scope & Ownership specification and is the required input for Phase 4 (RLS Policy Design) and Phase 5 (Application-layer Guard Refactor).