# ZMedico — Role Architecture Specification

**Version:** 1.0-draft
**Status:** Documentation only. No code, DB, RLS, roles, permissions, or migrations were modified.
**Depends on:** `docs/PERMISSION_CATALOG.md` (Phase 1)
**Supersedes:** ad-hoc role definitions in `src/lib/rolePermissions.ts` and `docs/RBAC_MATRIX.md` (only after Phase 5 implementation).

---

## 1. Design Principles

The Role Architecture is governed by seven non-negotiable principles. Every
future change to roles, bundles, or scopes MUST be evaluated against them.

1. **Roles represent job functions, not people and not features.**
   A role answers *"what does this person do at the clinic?"* — never
   *"which screens should they see?"* Screens are a consequence of the
   bundles a role carries, not the reason a role exists. If a proposed role
   cannot be described in one sentence about a real job, it is not a role.

2. **Permissions are never assigned directly to users.**
   The only user-facing grant surface is `user_roles(user_id, role, scope)`.
   Direct permission grants (`user_permissions`, ad-hoc overrides, feature
   flags standing in for permissions) are forbidden — they defeat auditing,
   review, and revocation. Exceptions (temporary elevation) are modeled
   explicitly in §7 and are still role-shaped, not permission-shaped.

3. **Roles inherit Bundles. Bundles contain Permissions.**
   The resolution chain is strictly three layers:
   `user → role(s) → bundle(s) → permission(s)`.
   No layer may skip. A role never lists raw permissions; a bundle never
   references another role; a user never references a bundle.

4. **Bundles are the unit of reuse.**
   Any capability shared by two or more roles MUST live in a bundle. If a
   role needs "just one extra permission," the correct action is to move
   that permission into an appropriately named bundle (possibly a new
   micro-bundle) and assign the bundle — never to sprinkle exceptions.

5. **Scope is independent from Role.**
   A "Doctor" is a Doctor whether they practice at one branch, three
   branches, or the whole organization. Role identity is orthogonal to
   reach. Scope is expressed as `(scope_type, scope_id[])` on the
   `user_roles` assignment, not by inventing `doctor_branch_a`,
   `doctor_branch_b`, etc.

6. **Avoid Role Explosion.**
   The canonical role list is bounded (§2, target ≤ 15 roles). Requests for
   new roles are rejected by default; the preferred answers are (a) a new
   bundle, (b) a scope adjustment, or (c) a temporary elevation grant.
   A new role is justified only when it represents a genuinely new job
   function with distinct SoD, approval authority, or regulatory posture.

7. **Least privilege by default, explicit elevation always.**
   Every role starts from zero and adds bundles. No role inherits "all
   permissions minus X." Elevation above a role's baseline is always
   time-bound, logged, reason-required, and reviewable (§7).

---

## 2. Canonical Role List

Fifteen enterprise roles cover every current and near-future ZMedico job
function. Roles are grouped by domain for readability only — grouping has
no runtime meaning.

### 2.1 Governance & Administration

#### `role.system_owner`
- **Purpose:** Ultimate accountability for the tenant. Owns the contract with ZMedico and can grant/revoke every other role, including admins.
- **Responsibilities:** Tenant lifecycle, billing, top-level organizational settings, security_admin appointment, break-glass approval.
- **Typical User:** Clinic owner, medical director, or CEO of the practice group.
- **Default Scope:** `organization`.
- **Assigned Bundles:** `bundle.administration.full`, `bundle.security.governance`, `bundle.reports.executive`, `bundle.settings.organization`.
- **Sensitive Operations:** Assigning `security_admin`, disabling MFA policies, initiating tenant export, approving break-glass sessions.
- **Approval Authority:** Final approver for every high-risk request; no one approves the system_owner.
- **Restrictions:** MUST have MFA. Cannot simultaneously hold `accountant` or `hr_manager` (SoD, §6). Every action is audit-logged with `actor_role_context = system_owner` and immutable.

#### `role.security_admin`
- **Purpose:** Custodian of the authorization system itself. Owns roles, bundles, permissions catalog, audit review, and RLS posture.
- **Responsibilities:** Manage user_roles assignments, review audit logs, run access reviews, approve permission catalog changes, respond to security incidents.
- **Typical User:** IT/security lead, compliance officer.
- **Default Scope:** `organization`.
- **Assigned Bundles:** `bundle.security.governance`, `bundle.security.audit`, `bundle.settings.organization` (read), `bundle.reports.security`.
- **Sensitive Operations:** Editing role bundles, force-terminating sessions, revoking API tokens, exporting audit logs.
- **Approval Authority:** Approves role grants for all roles except `system_owner`; approves permission catalog changes; approves break-glass sessions jointly with `system_owner`.
- **Restrictions:** MFA required. Cannot hold `accountant`, `hr_manager`, or any clinical role (avoids self-approval of own privileges on those surfaces).

#### `role.administrator`
- **Purpose:** Day-to-day operational admin. Executes what governance authorizes; does not set governance policy.
- **Responsibilities:** Branch management, service catalog, pricing, integration configuration, user provisioning within already-approved roles.
- **Typical User:** Operations manager, IT operations.
- **Default Scope:** `organization` (typical) or `branch` (multi-branch chains delegating one admin per site).
- **Assigned Bundles:** `bundle.administration.settings`, `bundle.branches.manage`, `bundle.users.provisioning`, `bundle.reports.operational`, `bundle.integrations.manage`.
- **Sensitive Operations:** Creating users (within approved roles), editing branch config, editing service pricing.
- **Approval Authority:** May approve routine access requests within pre-approved roles; cannot grant `security_admin`, `system_owner`, or itself.
- **Restrictions:** Cannot edit its own role assignment. Cannot access clinical PHI beyond metadata. MFA required.

### 2.2 Clinical

#### `role.physician` *(replaces legacy `doctor`)*
- **Purpose:** Licensed clinician responsible for diagnosis, prescriptions, and treatment plans.
- **Responsibilities:** Consultations, medical records, prescriptions, treatment plans, own commissions review.
- **Typical User:** Doctor, dentist, specialist.
- **Default Scope:** `branch` (assigned branches) with `own` qualifier on doctor-owned records.
- **Assigned Bundles:** `bundle.clinical.core`, `bundle.prescriptions.author`, `bundle.treatment_plans.author`, `bundle.appointments.clinical`, `bundle.reports.clinical.own`, `bundle.patients.read`.
- **Sensitive Operations:** Signing prescriptions (controlled substances gated by `bundle.prescriptions.controlled` add-on), amending signed records (dual-control), viewing other physicians' commissions (denied).
- **Approval Authority:** Approves treatment plan changes on own patients; countersigns nurse/assistant entries where regulation requires.
- **Restrictions:** No financial writes. No HR access. Cannot delete signed clinical records — amendments only. Own commissions only.

#### `role.senior_physician`
- **Purpose:** Physician with supervisory scope — reviews colleagues' records, countersigns residents, resolves clinical escalations.
- **Typical User:** Head of department, medical director's clinical delegate.
- **Default Scope:** `branch` or `organization`.
- **Assigned Bundles:** everything in `physician` **plus** `bundle.clinical.supervise`, `bundle.reports.clinical.department`, `bundle.prescriptions.controlled` (if licensed).
- **Sensitive Operations:** Countersigning, unlocking amendment windows, viewing department-level clinical reports.
- **Approval Authority:** Approves clinical amendments beyond the standard edit window; approves controlled-substance protocol exceptions.
- **Restrictions:** Same financial/HR restrictions as `physician`. Supervisory scope is per-department; not a substitute for `administrator`.

#### `role.nurse`
- **Purpose:** Assistant clinician. Owns vitals; assists with records under a physician's authority.
- **Typical User:** Registered nurse, medical assistant.
- **Default Scope:** `branch`.
- **Assigned Bundles:** `bundle.vitals.author`, `bundle.clinical.read`, `bundle.appointments.clinical`, `bundle.patients.read`, `bundle.inventory.read`.
- **Sensitive Operations:** Recording vitals (final, immutable after physician review).
- **Approval Authority:** None.
- **Restrictions:** No prescription authoring. No treatment plan authoring. No financial access.

#### `role.physiotherapist`
- **Purpose:** Physio-specific clinician for physio cases and follow-ups.
- **Default Scope:** `branch` with `own` on assigned cases.
- **Assigned Bundles:** `bundle.physio.core`, `bundle.clinical.read`, `bundle.appointments.clinical`, `bundle.patients.read`, `bundle.reports.physio.own`.
- **Restrictions:** Cannot author general medical records outside physio scope; cannot prescribe controlled substances.

### 2.3 Front Office

#### `role.receptionist`
- **Purpose:** Front desk. Owns patient intake, scheduling, and initial invoicing.
- **Typical User:** Front desk staff, patient coordinator.
- **Default Scope:** `branch`.
- **Assigned Bundles:** `bundle.reception.core`, `bundle.patients.demographics`, `bundle.appointments.desk`, `bundle.invoices.create`, `bundle.coupons.apply`, `bundle.queue.manage`.
- **Sensitive Operations:** Creating patient records (PII), applying coupons.
- **Approval Authority:** None. Cancels appointments via status update, not delete.
- **Restrictions:** No invoice edits after creation. No refunds. No clinical writes. No expenses. Read-only on treatment plans.

#### `role.front_office_lead`
- **Purpose:** Shift supervisor for reception. Coordinates queue, handles escalations, edits invoices *pre-post*.
- **Default Scope:** `branch`.
- **Assigned Bundles:** everything in `receptionist` **plus** `bundle.invoices.edit_draft`, `bundle.queue.supervise`, `bundle.reports.reception.branch`.
- **Approval Authority:** Approves reception-side coupon overrides within policy limits.
- **Restrictions:** Cannot void posted invoices. Cannot access clinical PHI beyond scheduling metadata.

### 2.4 Finance

#### `role.cashier`
- **Purpose:** Receives payments, closes daily till.
- **Default Scope:** `branch`.
- **Assigned Bundles:** `bundle.payments.receive`, `bundle.treasury.till`, `bundle.invoices.read`, `bundle.reports.cashier.own`.
- **Sensitive Operations:** Daily close.
- **Approval Authority:** None.
- **Restrictions:** Cannot edit invoices. Cannot void. Cannot issue refunds.

#### `role.accountant`
- **Purpose:** Owns the finance ledger. Invoices, treasury, coupons, expenses, refunds.
- **Default Scope:** `organization` (typical) or `branch` (multi-entity chains).
- **Assigned Bundles:** `bundle.invoices.manage`, `bundle.treasury.manage`, `bundle.coupons.manage`, `bundle.expenses.manage`, `bundle.reports.finance`, `bundle.payments.reconcile`.
- **Sensitive Operations:** Voiding invoices, treasury transfers, refunds, expense approvals within threshold.
- **Approval Authority:** Approves refunds up to policy threshold; escalates beyond.
- **Restrictions:** No clinical, HR, or authorization writes. Cannot hard-delete finance rows — void/reversal only (immutable audit trail).

#### `role.finance_manager`
- **Purpose:** Senior finance authority. Approves large refunds, reviews accountant work, owns period close.
- **Default Scope:** `organization`.
- **Assigned Bundles:** everything in `accountant` **plus** `bundle.finance.oversight`, `bundle.reports.finance.executive`, `bundle.finance.period_close`.
- **Approval Authority:** Approves refunds above the accountant threshold; approves period close.
- **Restrictions:** MFA required for period close and high-value refunds. Cannot hold `cashier` or `receptionist` simultaneously.

### 2.5 People

#### `role.hr_specialist`
- **Purpose:** Employee records, attendance, leave.
- **Default Scope:** `organization`.
- **Assigned Bundles:** `bundle.hr.core`, `bundle.hr.attendance`, `bundle.hr.leaves`, `bundle.reports.hr.operational`.
- **Restrictions:** No payroll writes, no salary edits.

#### `role.hr_manager`
- **Purpose:** HR authority. Owns payroll, salary bands, hiring, terminations.
- **Default Scope:** `organization`.
- **Assigned Bundles:** everything in `hr_specialist` **plus** `bundle.hr.payroll`, `bundle.hr.compensation`, `bundle.hr.lifecycle`, `bundle.reports.hr.executive`.
- **Sensitive Operations:** Salary changes, terminations.
- **Approval Authority:** Approves salary changes; approves HR-side role changes (in tandem with `security_admin`).
- **Restrictions:** Cannot hold `accountant` or `finance_manager` (SoD: payroll authorization vs. payroll disbursement).

### 2.6 Inventory

#### `role.inventory_clerk`
- **Purpose:** Day-to-day stock movements, receiving, counts.
- **Default Scope:** `branch`.
- **Assigned Bundles:** `bundle.inventory.movements`, `bundle.inventory.read`, `bundle.suppliers.read`.
- **Restrictions:** No PO approval, no supplier onboarding.

#### `role.inventory_manager`
- **Purpose:** Owns purchasing, suppliers, stock policy.
- **Default Scope:** `organization` or `branch`.
- **Assigned Bundles:** `bundle.inventory.full`, `bundle.suppliers.manage`, `bundle.purchase_orders.manage`, `bundle.reports.inventory`.
- **Approval Authority:** Approves POs within threshold.

### 2.7 Read-Only / Auxiliary

#### `role.auditor`
- **Purpose:** External or internal auditor. Read-only across finance, clinical (metadata only), HR (metadata only), audit logs.
- **Default Scope:** `organization`.
- **Assigned Bundles:** `bundle.audit.read`, `bundle.reports.executive.read`, `bundle.security.audit` (read only).
- **Restrictions:** No writes anywhere. No PHI beyond metadata. Session time-boxed (§7).

#### `role.staff` *(minimal baseline)*
- **Purpose:** Any employee whose only need is to see their own schedule.
- **Default Scope:** `own`.
- **Assigned Bundles:** `bundle.appointments.read.own`, `bundle.profile.self`.
- **Restrictions:** Everything else denied.

### 2.8 Non-human principals *(future — §9)*

#### `role.service_account`
- **Purpose:** API integrations and edge functions acting on their own behalf.
- **Default Scope:** As narrow as possible; explicit per grant.
- **Assigned Bundles:** Composed per integration; never inherits human role bundles.
- **Restrictions:** No interactive login. MFA replaced by token rotation + IP allowlist. Every action attributed to a specific token; token rotation on schedule.

---

## 3. Role Hierarchy (Conceptual Only)

The hierarchy is **conceptual**, used for review workflows, SoD reasoning,
and access-review escalation paths. It is **not** implemented as bundle
inheritance at runtime — each role explicitly lists its bundles (§4).
Runtime "senior includes junior" is achieved by the senior role explicitly
carrying the same bundles plus its own additions.

```text
                        system_owner
                             |
                       security_admin
                             |
                       administrator
           ______________________|______________________
          |            |             |            |     |
     Clinical      Front Office   Finance        HR   Inventory
          |            |             |            |     |
   senior_physician  fo_lead    finance_manager  hr_mgr inv_manager
          |            |             |            |     |
     physician    receptionist   accountant    hr_spec  inv_clerk
          |                          |
        nurse                     cashier
     physiotherapist

   Cross-cutting: auditor (read-only, all domains, metadata)
                  staff (baseline self-only)
                  service_account (non-human, per-integration)
```

**Notes on the hierarchy:**
- Arrows read as "reviews / can escalate to" — a physician's exceptional
  access request is reviewed by senior_physician, then administrator.
- A senior role does NOT automatically get a junior role's bundles at
  runtime. If `senior_physician` needs everything `physician` has, its
  bundle list explicitly includes the physician bundles.
- The `administrator` sits above the domain leads for governance
  escalation only — administrators do NOT get clinical, finance, or HR
  writes by virtue of position.

---

## 4. Bundle Assignment Strategy

**Rules:**
1. A role's authorization = the union of its assigned bundles' permissions,
   evaluated at the assignment's scope. No role lists raw permissions.
2. Every bundle is defined in `docs/PERMISSION_CATALOG.md` §5 (Bundle
   Strategy). Roles reference bundle keys; bundles are versioned.
3. When two roles share a capability, that capability MUST live in a
   shared bundle. Duplication across bundles is forbidden.
4. A role should typically carry **3–8 bundles**. More than ~10 signals
   that either the role is too broad (split it) or the bundles are too
   narrow (merge them).
5. `implicit_bundles` (declared in a bundle's metadata) resolve
   transitively at grant time but are still visible in the effective
   permission set for auditing.

**Assignment matrix (role → bundles):**

| Role | Assigned Bundles |
|---|---|
| `system_owner` | `administration.full`, `security.governance`, `reports.executive`, `settings.organization` |
| `security_admin` | `security.governance`, `security.audit`, `settings.organization.read`, `reports.security` |
| `administrator` | `administration.settings`, `branches.manage`, `users.provisioning`, `reports.operational`, `integrations.manage` |
| `senior_physician` | `clinical.core`, `clinical.supervise`, `prescriptions.author`, `prescriptions.controlled`*, `treatment_plans.author`, `appointments.clinical`, `patients.read`, `reports.clinical.department` |
| `physician` | `clinical.core`, `prescriptions.author`, `treatment_plans.author`, `appointments.clinical`, `patients.read`, `reports.clinical.own` |
| `nurse` | `vitals.author`, `clinical.read`, `appointments.clinical`, `patients.read`, `inventory.read` |
| `physiotherapist` | `physio.core`, `clinical.read`, `appointments.clinical`, `patients.read`, `reports.physio.own` |
| `front_office_lead` | `reception.core`, `patients.demographics`, `appointments.desk`, `invoices.create`, `invoices.edit_draft`, `coupons.apply`, `queue.manage`, `queue.supervise`, `reports.reception.branch` |
| `receptionist` | `reception.core`, `patients.demographics`, `appointments.desk`, `invoices.create`, `coupons.apply`, `queue.manage` |
| `finance_manager` | `invoices.manage`, `treasury.manage`, `coupons.manage`, `expenses.manage`, `payments.reconcile`, `finance.oversight`, `finance.period_close`, `reports.finance.executive` |
| `accountant` | `invoices.manage`, `treasury.manage`, `coupons.manage`, `expenses.manage`, `payments.reconcile`, `reports.finance` |
| `cashier` | `payments.receive`, `treasury.till`, `invoices.read`, `reports.cashier.own` |
| `hr_manager` | `hr.core`, `hr.attendance`, `hr.leaves`, `hr.payroll`, `hr.compensation`, `hr.lifecycle`, `reports.hr.executive` |
| `hr_specialist` | `hr.core`, `hr.attendance`, `hr.leaves`, `reports.hr.operational` |
| `inventory_manager` | `inventory.full`, `suppliers.manage`, `purchase_orders.manage`, `reports.inventory` |
| `inventory_clerk` | `inventory.movements`, `inventory.read`, `suppliers.read` |
| `auditor` | `audit.read`, `reports.executive.read`, `security.audit.read` |
| `staff` | `appointments.read.own`, `profile.self` |
| `service_account` | *composed per integration; no default* |

\* `prescriptions.controlled` is a licensing add-on; not every senior_physician holds it.

---

## 5. Scope Strategy

Scope answers **"over what data does this role's authority extend?"** —
never *"what actions?"* (actions belong to the bundle) and never *"which
role am I?"* (identity is fixed).

### 5.1 Supported scopes

| Scope | Meaning | Storage on assignment | Typical use |
|---|---|---|---|
| `own` | Only rows the user owns (`owner_id = auth.uid()`, `doctor_id = auth.uid()`, `linked_user_id = auth.uid()`). | `(scope_type='own', scope_ids=NULL)` | Staff self-schedule; physician on their own commissions. |
| `branch` | Rows whose `branch_id` is in the assigned set. Requires branch membership check. | `(scope_type='branch', scope_ids=uuid[])` | Reception, nurse, cashier, physician at specific branches. |
| `organization` | All branches within the tenant. | `(scope_type='organization', scope_ids=NULL)` | Accountant, HR, administrator (typical). |
| `global` | Cross-tenant; reserved for platform operators and never issued to customer users. | `(scope_type='global', scope_ids=NULL)` | ZMedico support (out of scope for this document). |

### 5.2 Rules

- **A user may hold multiple assignments** of the same role at different
  scopes (e.g., `physician` at branch A + `physician` at branch B). The
  effective permission set is the union, evaluated per row.
- **A user may hold multiple different roles** (e.g., `physician` +
  `nurse`), subject to SoD (§6). Union rules still apply.
- **Scope narrows, never widens.** A bundle that grants `patients.view`
  at `org` scope is filtered to `branch` if the assignment is `branch`.
  RLS is the authoritative filter.
- **Qualifiers in the permission key** (e.g., `.own`, `.branch`) are hints
  for UI and analytics; the assignment scope is the enforced boundary.
- **`own` is derivable** from any assignment via `auth.uid()`; it does not
  need to appear as a separate assignment for role logic that already
  filters by ownership. It is used explicitly for roles whose *only*
  authority is over their own records (e.g., `staff`).

### 5.3 When to pick which scope

- Front-line clinical/reception/cashier work → **`branch`** with an
  explicit list of assigned branches; never `organization` "for
  convenience."
- Finance, HR, administration → **`organization`** by default; **`branch`**
  when the customer runs multiple legal entities.
- Physician viewing own commissions → **assignment stays `branch`**;
  ownership is enforced by the permission (`reports.clinical.own`), not by
  a separate scope.
- Auditor → **`organization`** read-only, time-boxed via §7.

---

## 6. Separation of Duties (SoD)

Roles that must never be combined on the same active user. Enforcement is
two-layer: UI warning at grant time + hard denial in the
`user_roles` insert trigger (implementation deferred to Phase 5).

| Role A | Role B | Conflict | Reason |
|---|---|---|---|
| `accountant` / `finance_manager` | `cashier` | Payment receipt + reconciliation | Person receiving cash cannot also reconcile it (embezzlement path). |
| `accountant` / `finance_manager` | `hr_manager` | Payroll authorization + disbursement | Same person setting salaries and paying them enables ghost employees. |
| `security_admin` | `hr_manager` | Role governance + employment control | Same person controlling both digital access and employment lifecycle. |
| `security_admin` | `system_owner` | Self-approval loop | Break-glass approval requires two distinct principals. |
| `administrator` | `auditor` | Configuration + audit of configuration | Auditors must be independent from the system they audit. |
| `receptionist` / `front_office_lead` | `accountant` / `finance_manager` | Invoice creation + invoice void | Person creating invoices cannot also void them (self-cover fraud). |
| `physician` | `accountant` / `finance_manager` | Clinical services + financial recording | Prevents inflated billing for own services. |
| `inventory_manager` | `accountant` / `finance_manager` | Purchasing + accounts payable | Same person approving POs and paying vendors enables kickbacks. |
| `service_account` | *any human role* | Attribution | Service accounts must never share identity with humans. |

**Rules for exceptions:**
- Small clinics may legitimately need one person to hold conflicting
  roles. SoD exceptions are granted per-tenant, require `system_owner` +
  `security_admin` sign-off, are recorded with justification, and force
  compensating controls (higher approval thresholds, mandatory second
  signature on high-value operations, monthly access review).

---

## 7. Temporary Access

Every elevation beyond a user's steady-state assignments is modeled as a
**time-bound grant**, never a permanent role change and never a raw
permission override.

### 7.1 Break-glass emergency access
- **Purpose:** Life-safety or business-continuity events where a clinician
  needs data outside their normal scope (e.g., cross-branch patient
  arriving in ER).
- **Mechanism:** A pre-defined bundle (`bundle.emergency.clinical.readall`)
  is granted to the requester at `organization` scope with a hard TTL
  (default 60 minutes, max 4 hours).
- **Controls:** Reason required, two-person approval (`system_owner` or
  `security_admin` + on-call clinical lead), MFA re-challenge on entry,
  every action tagged `break_glass=true` in the audit log, post-incident
  review within 72 hours.

### 7.2 Emergency admin access
- **Purpose:** Recovery from operational incidents (e.g., primary admin
  unavailable, urgent config change).
- **Mechanism:** Time-boxed grant of `administrator` to a pre-designated
  backup user, TTL 4 hours, reason + ticket reference required.
- **Controls:** Notifies `system_owner` and `security_admin` on grant and
  on every high-risk action; auto-revokes at TTL.

### 7.3 Delegation (planned absence)
- **Purpose:** Vacation or leave coverage for approver roles.
- **Mechanism:** Delegating user nominates a delegate; grant is a copy of
  the delegator's role at the same scope, with `delegation_of=<user_id>`
  metadata, TTL up to 30 days.
- **Controls:** Delegation cannot cross SoD boundaries (a delegate must
  already be eligible to hold the role). Actions taken under delegation
  are attributed both to the delegate (actor) and the delegator (context)
  in the audit log. Delegator can revoke at any time.

### 7.4 Just-in-time (JIT) elevation
- **Purpose:** Routine but sensitive tasks (e.g., accountant needing
  finance_manager approval authority for one refund).
- **Mechanism:** Request → approval by holder of the target role → grant
  scoped to a specific resource with TTL (default 15 minutes).
- **Controls:** Auto-revokes; single-use where possible; logged with the
  business reason and approver identity.

### 7.5 Universal rules
- All temporary grants have a **mandatory TTL**; no "revoke later"
  grants exist.
- All temporary grants require a **reason string** stored with the grant.
- All temporary grants are **auditable in aggregate** — the access-review
  process (§8) includes a monthly report of every temporary grant, its
  duration, and its post-hoc necessity assessment.
- Temporary grants **cannot bypass SoD**; the same conflict rules apply
  during the elevation window.
- Temporary grants of `security_admin` or `system_owner` require joint
  approval by the other of the two.

---

## 8. Role Governance

### 8.1 Creating a new role
A new role is created only when:
1. A genuinely new job function exists in the customer's operations, and
2. No combination of existing role + scope + bundle can express it, and
3. The proposed role has a clear owner, SoD analysis, and access-review plan.

**Process:** RFC in `docs/rfcs/role-<name>.md` → review by
`security_admin` + relevant domain lead → approval by `system_owner` →
entry added to §2 and §4 of this document → catalog entries for any new
bundles → migration plan (backward-compatible; §9).

### 8.2 Retiring a role
A role is retired when:
1. No user has held it for 90 days, or
2. Its responsibilities have been absorbed by another role, or
3. A regulatory change makes it non-compliant.

**Process:** Mark `deprecated_since` and `replaced_by` in this document →
migrate remaining assignments to the replacement → maintain read-only
compatibility for 2 release cycles → remove from the canonical list with
a major version bump of this document.

### 8.3 Review frequency
- **Quarterly:** Access review of every human assignment. Owners of each
  role confirm current holders are appropriate.
- **Quarterly:** SoD violation report (should always be empty; exceptions
  reconfirmed).
- **Monthly:** Temporary grants report (§7).
- **Annually:** Full architecture review of §§2–6. Any change follows the
  RFC process.
- **Ad-hoc:** After every security incident involving privilege.

### 8.4 Ownership
- **Document owner:** `security_admin`.
- **Per-role owner:** Named in §2 (implicit via domain). Each role has a
  named business owner accountable for its scope, membership, and reviews.
- **Bundle owner:** Named in the catalog (`PERMISSION_CATALOG.md`).

### 8.5 Documentation requirements
Every role in §2 MUST have: purpose, responsibilities, typical user,
default scope, assigned bundles, sensitive operations, approval authority,
and restrictions. A role change is not merged without a diff against
these fields. Bundle assignments in §4 MUST match §2. Drift is caught by
the CI matrix-drift check (planned Phase 6).

---

## 9. Future Compatibility

### 9.1 Multi-branch
Already supported via `branch` scope with `scope_ids` array. No role
change needed as branches grow — assignments are updated.

### 9.2 Multi-organization
Introduces an `organization_id` on `user_roles`. Roles are unchanged;
scope gains a new dimension `(organization, branch)`. A user active in
two organizations holds two independent assignments; SoD is evaluated
per-organization. No cross-org data leakage; RLS extended with an org
filter in Phase 7.

### 9.3 Telemedicine
No new role needed. `physician` scope may be `organization` when a
telemedicine physician serves the whole tenant; a new bundle
`bundle.telemedicine.session` gates video/consult surfaces. The role is
still "physician," their reach is expressed via scope + bundles.

### 9.4 AI Assistant
AI actions are performed by a `service_account` role assigned per
feature, with narrowly scoped bundles (e.g.,
`bundle.ai.summarize.records.read`). Every AI action is logged with
`ai_agent=<model_id>` context; sensitive writes require a human
approver bundle attached to the same action.

### 9.5 API integrations
`service_account` per integration, each with its own token, IP allowlist,
and rotation schedule. Never reuses human bundles. High-privilege API
scopes require dual control (§7.4-style JIT) at grant time.

### 9.6 Franchises
Same as multi-organization plus a franchisor "read-only across franchises"
role composed as `auditor` at `organization` scope for each franchise the
franchisor owns. No new role required; the architecture already permits
it via multi-assignment.

### 9.7 International expansion
- **Regulatory tags** on bundles (`hipaa`, `gdpr`, `saudi_moh`, etc.,
  defined in the catalog) let country-specific policies gate specific
  bundles without new roles.
- **Data residency** is a tenant-level property, not a role property.
- **Language and locale** live in user preferences, not in the role model.

### 9.8 Anti-patterns explicitly rejected
- Country-specific role variants (`physician_ksa`, `physician_uae`).
- Feature-specific roles (`telemedicine_user`, `ai_beta_user`).
- Per-branch role variants (`accountant_branch_a`).
- Personal roles (`role.dr_smith`).
All of these are expressed via scope, bundle, or preference — never a
new role.

---

**End of specification.** No code, DB, RLS, roles, permissions, or
migrations were modified. This document, once approved, becomes the
authoritative Role Architecture for ZMedico and the input to Phase 3
(Bundle Assignments) and Phase 4 (Scope & SoD implementation planning).