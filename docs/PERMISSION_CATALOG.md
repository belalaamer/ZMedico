# ZMedico — Permission Catalog (v1.0-draft)

> **Status:** Specification. Not yet implemented. Nothing in code, DB, or RLS
> has been changed. This document is the single source of truth for all
> future authorization work in ZMedico. Any deviation between this catalog,
> `role_permissions`, `DEFAULT_PERMISSIONS`, and `docs/RBAC_MATRIX.md` is a
> bug in the layer that diverges — not in this document.

---

## 0. Purpose & Scope

The Permission Catalog defines **what a caller can be authorized to do** in
ZMedico, independent of **who** they are (roles) and **which rows** they may
touch (scope/ownership/RLS). It is the atomic vocabulary that every
authorization layer consumes:

- Frontend `can(permission_key)` mirror.
- Backend `has_permission(uid, permission_key)` SECURITY DEFINER.
- RLS policy templates.
- Edge function guards.
- Approval workflow rules.
- Audit log tags.
- Regression test coverage matrix.

---

## 1. Permission Groups

Permissions are partitioned into **business domains**. A permission belongs
to exactly one group. Groups map to the sidebar / IA the user sees, but the
authorization decision is always at the permission level, never the group
level.

| # | Group key | Display name | Business rationale |
|---|---|---|---|
| 1 | `patients` | Patients | Demographics, wallet, documents, merges — front-desk + clinical read surface |
| 2 | `appointments` | Appointments | Calendar, booking, reminders — scheduling domain |
| 3 | `queue` | Queue | Waiting-room state machine, alerts — real-time ops |
| 4 | `clinical` | Clinical | Records, vitals, treatment plans, dental, diagnoses catalog — protected health information |
| 5 | `prescriptions` | Prescriptions | Rx issue, print, controlled substances — regulated clinical output |
| 6 | `physio` | Physiotherapy | Cases, sessions, reassessments — parallel clinical vertical |
| 7 | `finance.invoices` | Invoices | Draft/edit/void/discount — accounts receivable |
| 8 | `finance.payments` | Payments | Collect/refund — cash movement |
| 9 | `finance.coupons` | Coupons | Issue/redeem — pricing |
| 10 | `finance.treasury` | Treasury | Tx, transfer, day close/reopen — cash controls |
| 11 | `finance.expenses` | Expenses | Record/approve — accounts payable |
| 12 | `finance.commissions` | Commissions | Doctor payouts — split from invoices for SoD |
| 13 | `inventory` | Inventory | Products, categories, suppliers, stock — supply chain |
| 14 | `inventory.po` | Purchase Orders | Create/approve/receive — procurement sub-domain that requires SoD |
| 15 | `hr.staff` | Staff | Directory + identity/employment — people master data |
| 16 | `hr.attendance` | Attendance | Clock-in, overrides — daily HR ops |
| 17 | `hr.leave` | Leave | Request/approve — workflow domain |
| 18 | `hr.payroll` | Payroll | Run/pay — high-risk financial-adjacent |
| 19 | `hr.performance` | Performance | Reviews, targets, bonuses — sensitive HR |
| 20 | `reports` | Reports | Cross-domain read/export; sub-scoped per family |
| 21 | `notifications` | Notifications | Templates, channels, secrets — outbound comms |
| 22 | `branches` | Branches | Multi-branch topology + schedules |
| 23 | `settings` | Settings | General configuration surfaces |
| 24 | `settings.catalog` | Catalogs | Services, procedures, medications, diagnoses — reference data |
| 25 | `settings.insurance` | Insurance | Companies, contracts, rules — pricing-sensitive |
| 26 | `settings.i18n` | Languages | Locale configuration |
| 27 | `security.identity` | Identity | User create/delete/reset/impersonate |
| 28 | `security.rbac` | Roles & Permissions | Role assign, bundle edit, permission catalog changes |
| 29 | `security.audit` | Audit | View + export audit logs |
| 30 | `system.backup` | Backup & Restore | Data export-all, restore |
| 31 | `system.selfaudit` | Self-Audit | Run system/queue/expense self-audits |
| 32 | `system.jobs` | Background Jobs | Trigger cron/edge functions manually |
| 33 | `integrations` | Integrations | Per-channel (SMS/WhatsApp/Email/Storage) — future-ready |
| 34 | `dashboard` | Dashboard | Per-widget-family visibility |
| 35 | *reserved* `telemedicine`, `ai`, `booking_public`, `crm`, `api_tokens`, `multi_org` | Future | See §8 |

### Why these groups

- **Split of `finance`** into invoices/payments/treasury/coupons/expenses/commissions is required to encode SoD (create ≠ collect ≠ refund ≠ close).
- **`prescriptions` and `physio`** are separated from `clinical` because they have their own regulatory/reporting posture.
- **`inventory.po`** is separated from `inventory` to allow the create ≠ approve ≠ receive split.
- **`hr.*`** is split by workflow (staff / attendance / leave / payroll / performance) so that a payroll officer never inherits identity edits.
- **`security.*`** is separated from `system.*` so a `security_admin` role can manage identity/RBAC without gaining backup/restore.
- **`settings.*`** is split so a `finance_manager` can edit invoice templates without touching insurance contracts.
- **`dashboard`** is a group so per-widget visibility is a first-class concern, not an emergent property of other reads.

---

## 2. Permission Naming Standard

### 2.1 Grammar

```
<group>.<resource>.<action>[.<qualifier>]
```

- `<group>` — from §1 (may itself contain a dot, e.g. `finance.invoices`).
- `<resource>` — the noun the action operates on inside the group. Omitted only when the group is the resource (e.g. `queue.call`).
- `<action>` — a verb from the closed vocabulary below.
- `<qualifier>` — optional scope/state modifier from the closed vocabulary below.

All lowercase. Dots only. `snake_case` inside a segment. No abbreviations
that aren't already established in the codebase (`po`, `rx`, `hr`, `sms`,
`wa`, `pdf` are allowed).

### 2.2 Closed verb vocabulary

| Verb | Meaning |
|---|---|
| `view` | Read a list or a row |
| `view_sensitive` | Read PII/PHI/financial columns hidden from ordinary `view` |
| `create` | Insert a new row |
| `update` | Modify a row in an editable state |
| `delete` | Hard-delete a row (reserved almost exclusively for `security_admin`) |
| `archive` / `restore` | Soft-lifecycle |
| `void` / `cancel` | State transition to a terminal non-deleted state |
| `sign` / `amend` | Clinical immutability transitions |
| `assign` / `unassign` | Link/unlink resources (doctor↔patient, staff↔branch) |
| `approve` / `reject` | Workflow decisions |
| `submit` | Send for approval |
| `close` / `reopen` | Period control (treasury day, payroll run) |
| `issue` / `redeem` | Coupons, controlled Rx |
| `receive` | Inventory receiving |
| `adjust` | Manual quantity/amount override |
| `override` | Bypass a business rule (past-slot, discount cap) |
| `refund` | Reverse a paid movement |
| `transfer` | Move between accounts/branches |
| `run` / `pay` | Payroll two-step |
| `export` | Download subset the user can already read |
| `export_bulk` | Download the entire dataset (reason-logged) |
| `import` | Bulk create |
| `print` | Generate physical/PDF output |
| `configure` | Change settings within a resource |
| `rotate` | Rotate secrets/keys |
| `impersonate` | Act as another user |
| `invoke` | Manually trigger an edge/background job |
| `send` | Trigger outbound comms |

### 2.3 Closed qualifier vocabulary

| Qualifier | Meaning |
|---|---|
| `.own` | Only rows the caller owns (created_by / doctor_id / user_id = uid) |
| `.branch` | Only rows in caller's assigned branches |
| `.org` | Any row in caller's tenant |
| `.global` | Any row across tenants — reserved for platform/support tooling |
| `.draft` / `.posted` / `.paid` / `.void` / `.closed` | State-restricted |
| `.self` | Applies to the caller's own subject row (own staff_profile, own leave) |
| `.controlled` | Regulated subset (controlled Rx) |

If a permission has no qualifier it defaults to its **Default Scope** in the
metadata (§3).

### 2.4 Examples

```
patients.record.view
patients.record.view_sensitive
patients.record.merge
patients.wallet.adjust

appointments.slot.book
appointments.slot.cancel
appointments.slot.override.past

queue.call
queue.force_call
queue.bulk_reset
queue.settings.configure

clinical.record.view
clinical.record.create.own
clinical.record.sign
clinical.record.amend_after_sign

prescriptions.issue
prescriptions.issue.controlled
prescriptions.print

finance.invoices.create
finance.invoices.update.draft
finance.invoices.void
finance.invoices.discount.override
finance.payments.collect
finance.payments.refund
finance.treasury.transaction.create
finance.treasury.transfer
finance.treasury.day.close
finance.treasury.day.reopen
finance.coupons.issue
finance.coupons.redeem
finance.expenses.approve
finance.commissions.cancel

inventory.item.update
inventory.stock.adjust
inventory.po.create
inventory.po.approve
inventory.po.receive

hr.staff.view_sensitive
hr.staff.update.employment
hr.staff.assign_branch
hr.leave.approve
hr.payroll.run
hr.payroll.pay

reports.finance.view
reports.finance.export
reports.finance.export_bulk

notifications.templates.update
notifications.secrets.rotate
notifications.channel.send.sms

security.identity.user.create
security.identity.user.reset_password
security.identity.user.impersonate
security.rbac.role.assign
security.rbac.permission.update
security.audit.view
security.audit.export

system.backup.run
system.backup.restore
system.selfaudit.run
system.jobs.invoke

dashboard.finance.view
dashboard.clinical.view
dashboard.hr.view
```

### 2.5 Anti-patterns (rejected)

- `manage_*` — too broad, hides the actual action.
- `admin_*` — role names must not appear in permission keys.
- Camel or Pascal case, plurals inconsistent (`patient` vs `patients`).
- Domain-specific verbs (`archivePatient`, `voidTheInvoice`).
- Compound actions (`create_and_send`) — split into two permissions.

---

## 3. Permission Metadata Model

Every permission has the following metadata. This is the schema of the
future `permissions` catalog table but is documented here as the canonical
specification.

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | string, PK | yes | Fully-qualified key per §2 grammar |
| `display_name` | string | yes | Short human label (UI + docs) |
| `description` | string | yes | One sentence: what allowing this lets the caller do |
| `group` | enum (§1) | yes | Business domain |
| `risk_level` | enum `low\|medium\|high\|critical` | yes | See §3.1 |
| `default_scope` | enum `own\|branch\|org\|global` | yes | The scope used when no qualifier is present |
| `audit_required` | bool | yes | Emit `audit_logs` row on every use |
| `approval_capable` | bool | yes | May be flagged `requires_approval=true` at policy time (future-ready) |
| `mfa_candidate` | bool | yes | Should trigger step-up MFA when policy exists (future-ready) |
| `dual_control` | bool | yes | Cannot be exercised without a second holder confirming (future-ready) |
| `reason_required` | bool | yes | UI must capture a free-text reason (stored in audit) |
| `pii_touch` | bool | yes | Reads/writes PII columns |
| `phi_touch` | bool | yes | Reads/writes protected health info |
| `financial_impact` | bool | yes | Changes money or money-adjacent balances |
| `regulatory_tag` | string[] | no | e.g. `hipaa`, `gdpr`, `pci`, `local_health_ministry` |
| `deprecated` | bool | yes | `true` = do not grant to new bundles; still enforced |
| `deprecated_since` | version | no | Catalog version that deprecated it |
| `replaced_by` | key[] | no | Successor permission(s) |
| `introduced_in` | version | yes | Catalog version that introduced it |
| `sod_conflicts_with` | key[] | no | Permissions that MUST NOT co-exist in one role |
| `implies` | key[] | no | Holding this implies holding the listed permissions (view usually implied by create/update) |
| `notes` | string | no | Free text |

### 3.1 Risk levels

| Level | Definition | Example |
|---|---|---|
| **Low** | Read-only, no PII/PHI/financial | `dashboard.clinical.view`, `queue.call` |
| **Medium** | Writes non-sensitive data or reads PII/PHI at row level | `appointments.slot.book`, `patients.record.update` |
| **High** | Financial impact, PHI writes, workflow decisions | `finance.invoices.create`, `clinical.record.sign`, `hr.leave.approve` |
| **Critical** | Money movement/reversal, identity/RBAC, deletes, secrets, immutability breach, bulk export | `finance.payments.refund`, `security.rbac.role.assign`, `system.backup.restore`, `security.audit.export`, `clinical.record.amend_after_sign`, `notifications.secrets.rotate` |

All **critical** permissions default to `audit_required=true`,
`approval_capable=true`, `mfa_candidate=true`, `reason_required=true`.

### 3.2 Example metadata rows

```yaml
- key: finance.invoices.void
  display_name: Void Invoice
  description: Cancel a posted or paid invoice, triggering wallet, treasury, and commission reversal.
  group: finance.invoices
  risk_level: critical
  default_scope: branch
  audit_required: true
  approval_capable: true
  mfa_candidate: true
  dual_control: true
  reason_required: true
  pii_touch: false
  phi_touch: false
  financial_impact: true
  regulatory_tag: [local_health_ministry]
  sod_conflicts_with: [finance.payments.refund]
  implies: [finance.invoices.view]
  introduced_in: 1.0

- key: clinical.record.amend_after_sign
  display_name: Amend Signed Clinical Record
  description: Modify a clinical record after it has been signed. All amendments are audit-logged with reason.
  group: clinical
  risk_level: critical
  default_scope: own
  audit_required: true
  approval_capable: false
  mfa_candidate: true
  dual_control: false
  reason_required: true
  pii_touch: true
  phi_touch: true
  financial_impact: false
  regulatory_tag: [hipaa, local_health_ministry]
  introduced_in: 1.0

- key: dashboard.finance.view
  display_name: View Finance Dashboard Widgets
  description: See revenue, outstanding, and cash KPIs on the dashboard.
  group: dashboard
  risk_level: low
  default_scope: branch
  audit_required: false
  approval_capable: false
  mfa_candidate: false
  dual_control: false
  reason_required: false
  pii_touch: false
  phi_touch: false
  financial_impact: false
  introduced_in: 1.0
```

---

## 4. Group Membership Rationale (Why Each Permission Lives Where)

A permission belongs to the group whose **owner team** is accountable for
its behavior and whose **regulatory posture** matches its impact. Rules of
thumb:

1. **Data ownership** — where the underlying table lives conceptually.
   `patients.wallet.adjust` lives in `patients` (patient owns their wallet)
   even though it moves money, because the *authorizing party* is the
   patient-facing team.
2. **Regulatory tag** — anything HIPAA/PHI goes to `clinical`, `prescriptions`,
   or `physio` even if a front-desk role executes it.
3. **Workflow ownership** — approvals go to the group of the workflow owner,
   not the requester. `hr.leave.approve` belongs to HR even though every
   role can `hr.leave.submit`.
4. **SoD boundary** — if two actions must be split for four-eyes, they must
   live in separate groups or separate sub-groups. This forced the
   `finance.invoices` / `finance.payments` / `finance.treasury` split and
   the `inventory` / `inventory.po` split.
5. **Blast radius** — anything that can escalate privileges, break audit
   immutability, or exfiltrate at scale goes to `security.*` or `system.*`,
   never to a functional group.

---

## 5. Bundle Strategy

Bundles are **immutable, versioned, named collections of permission keys**.
Roles are composed of one or more bundles; they never reference individual
permissions. This kills the N × M explosion in `role_permissions`.

### 5.1 Bundle metadata

| Field | Description |
|---|---|
| `key` | e.g. `bundle.finance.ops` |
| `display_name` | "Finance Operations" |
| `description` | What a holder can do |
| `permissions` | Set of permission keys |
| `implicit_bundles` | Bundles included by reference (composition) |
| `sod_conflicts_with` | Bundles that must not co-exist in one role |
| `version` | Bundle version (bumps on any content change) |
| `deprecated` | Do not attach to new roles |

### 5.2 Canonical bundles (initial set — not yet assigned to roles)

| Bundle | Intent | Contains (illustrative — full list per bundle in follow-up) |
|---|---|---|
| `bundle.reception.core` | Front-desk day-to-day | `patients.record.view/create/update`, `appointments.slot.*`, `queue.call`, `finance.invoices.create`, `finance.payments.collect`, `finance.coupons.redeem` |
| `bundle.clinical.read` | Any clinician read | `patients.record.view/view_sensitive`, `clinical.record.view`, `prescriptions.view`, `treatment_plans.view` |
| `bundle.clinical.write.own` | Doctor writing own patients | `bundle.clinical.read`, `clinical.record.create/update.own`, `clinical.record.sign`, `prescriptions.issue`, `treatment_plans.create/update.own` |
| `bundle.clinical.write.controlled` | Controlled substances | `prescriptions.issue.controlled` |
| `bundle.nursing.core` | Vitals + assist | `bundle.clinical.read`, `clinical.vitals.create/update`, `appointments.slot.book/update` |
| `bundle.physio.write` | Physiotherapy | Physio equivalents of clinical.write.own |
| `bundle.finance.view` | Read-only finance | `finance.*.view`, `reports.finance.view` |
| `bundle.finance.ops` | Accountant | `bundle.finance.view`, `finance.invoices.create/update.draft/void`, `finance.payments.collect`, `finance.expenses.create/update`, `finance.coupons.issue/redeem` |
| `bundle.finance.approver` | Finance manager | `bundle.finance.ops`, `finance.payments.refund`, `finance.treasury.day.close/reopen`, `finance.invoices.discount.override`, `finance.expenses.approve` |
| `bundle.cashier.core` | Collect-only | `finance.payments.collect`, `finance.coupons.redeem` |
| `bundle.inventory.ops` | Stock + items | `inventory.item.*`, `inventory.stock.adjust`, `inventory.po.create/receive` |
| `bundle.inventory.approver` | PO approver (SoD partner) | `inventory.po.approve` |
| `bundle.hr.view` | HR read | `hr.staff.view`, `hr.leave.view`, `hr.attendance.view` |
| `bundle.hr.write` | HR specialist | `bundle.hr.view`, `hr.staff.create/update.employment`, `hr.attendance.*`, `hr.leave.approve`, `hr.performance.*` |
| `bundle.hr.identity` | HR manager | `bundle.hr.write`, `hr.staff.update.identity`, `hr.staff.assign_branch` |
| `bundle.payroll.run` | Payroll officer | `hr.payroll.run` |
| `bundle.payroll.pay` | Payroll pay (SoD partner) | `hr.payroll.pay` |
| `bundle.reporting.core` | Reports viewer | `reports.*.view` |
| `bundle.reporting.export` | Report exporter | `reports.*.export` |
| `bundle.reporting.bulk` | Bulk export w/ reason | `reports.*.export_bulk` |
| `bundle.security.identity` | User admin | `security.identity.user.create/reset_password/delete` |
| `bundle.security.rbac` | RBAC admin | `security.rbac.role.assign`, `security.rbac.permission.update` |
| `bundle.security.audit` | Compliance auditor | `security.audit.view`, `security.audit.export` |
| `bundle.system.backup` | Backup operator | `system.backup.run` |
| `bundle.system.restore` | Restore operator (SoD partner) | `system.backup.restore` |
| `bundle.administration.settings` | Operational settings | `settings.*.configure`, `notifications.templates.update`, `settings.insurance.*`, `settings.catalog.*` |
| `bundle.administration.branches` | Branches | `branches.*` |

### 5.3 Bundle composition rules

- **Additive only.** A bundle can `implicit_bundles` other bundles; it cannot subtract.
- **SoD at bundle level.** If any two permissions conflict per §3, at least one bundle in every role composition must respect the split.
- **No role directly holds a permission.** Always via a bundle. Custom roles = pick bundles.
- **Bundle version bumps** on any permission set change; roles that reference a bundle must be re-validated on bump.
- **Bundle deprecation** never deletes; new roles cannot attach a deprecated bundle.

### 5.4 Deliberately NOT defined here

Role → bundle assignment. That is Phase 2 (Role Redesign). Defining it here
would couple the catalog to a specific role model and defeat reuse.

---

## 6. Permission Lifecycle

```
 proposed ─▶ draft ─▶ active ─▶ deprecated ─▶ removed
                                  │
                                  └─▶ replaced_by
```

| Stage | Rules |
|---|---|
| **Proposed** | Opened as a PR against this document. Must include: key, metadata row, rationale, migration note, test coverage plan. |
| **Draft** | Approved into the doc but not seeded to DB. Safe to reference in design work. |
| **Active** | Seeded into `permissions` catalog + at least one bundle. Enforceable end-to-end. |
| **Deprecated** | `deprecated=true`. Not attachable to new bundles. Existing holders continue to work. Deprecation notice must include `replaced_by` and a target removal version. |
| **Removed** | Only permissible ≥ 2 catalog minor versions after deprecation AND after telemetry proves zero denials/uses for a rolling 60 days AND after all bundles referencing it have been re-versioned. |

### 6.1 Review cadence

- Quarterly catalog review: enumerate all permissions with zero uses in
  telemetry → candidate deprecation.
- Any new SECURITY DEFINER function, new table, or new edge function must
  ship with its permission entry in the same PR.

---

## 7. Permission Governance

### 7.1 Adding a permission

A PR MUST include:
1. A new metadata row in this document.
2. Bundle assignment(s) OR explicit note "no bundle — reserved".
3. Backend enforcement plan (RLS policy / definer function / edge fn).
4. Frontend mirror plan (`can(key)` call sites).
5. Test cases (positive + negative) added to the RBAC test spec.
6. Approval from a **security_admin** *and* the group owner.

### 7.2 Renaming a permission

**Forbidden.** Permissions are append-only identifiers.
To rename, deprecate the old key and introduce a new one; hold both during
the deprecation window; grant both in bundles until removal.

### 7.3 Removing a permission

See §6 lifecycle. Never remove in the same catalog version that
deprecates. Removal is a **breaking** change and bumps the catalog **major**
version.

### 7.4 Backward compatibility

- Old keys resolve to their `replaced_by` set during the deprecation window
  via a compatibility view (`v_permission_aliases`).
- Client `can('old.key')` continues to return the union of old + new until
  the removal version.
- Bundles list both keys during transition.
- No client release may drop calls to a permission still marked `active` or
  `deprecated` in the current catalog version.

### 7.5 Versioning

Catalog uses **SemVer** independent of the app version.
- **MAJOR** — removal of any active or deprecated permission; incompatible
  bundle restructure.
- **MINOR** — new permissions; new bundles; new metadata fields (nullable);
  deprecations.
- **PATCH** — description/display-name edits, doc fixes, non-behavioral.

Every change is tagged in this document's changelog section (to be added on
first amendment).

### 7.6 Governance roles

- **Catalog owner** — `security_admin` role holders. Merge rights on this
  document.
- **Group owner** — the functional lead for each group in §1. Sign-off
  required for changes affecting their group.
- **Compliance reviewer** — required sign-off when `regulatory_tag` is set
  or changed.

---

## 8. Future Compatibility

The catalog must accept new domains without restructure. Reserved
placeholders:

| Reserved group | Anticipated permissions | Notes |
|---|---|---|
| `telemedicine` | `telemedicine.session.host/join/record`, `telemedicine.session.share.phi` | Reuse `clinical.record.*` for underlying data |
| `ai` | `ai.assistant.invoke`, `ai.assistant.train_with_phi`, `ai.suggestions.accept`, `ai.model.configure` | High/critical risk by default |
| `booking_public` | `booking_public.slot.view`, `booking_public.slot.book`, `booking_public.patient.self_register` | Anonymous-friendly qualifier `.anon` |
| `crm` | `crm.lead.*`, `crm.campaign.*`, `crm.communication.send` | Distinct from `notifications` (which is transactional) |
| `insurance` (expanded) | `settings.insurance.claim.submit/approve`, `settings.insurance.eligibility.check` | Under existing `settings.insurance` group |
| `multi_org` | `multi_org.tenant.create/switch/impersonate`, `multi_org.billing.view` | Requires new `.global` scope and separate audit stream |
| `api_tokens` | `security.api_token.create/revoke/list`, `security.api_token.scope.assign` | Under `security.identity` |
| `public_api` | `public_api.<resource>.<action>` mirroring internal keys | Grants are on **tokens**, not user roles; catalog reused |

### 8.1 Design constraints preserved for the future

- **Scope enum extensible** without breaking (`own\|branch\|org\|global` +
  future `.tenant_group`).
- **Token subject** — the same `has_permission(subject_id, key)` function
  works whether the subject is a user or an API token because subjects are
  identified by opaque UUID.
- **Public/anon** — introduce `anon` as a pseudo-role whose bundles are
  restricted to `booking_public.*` and read-only catalog reads.
- **Multi-org** — a `.global` qualifier + a `platform_admin` bundle. Never
  granted to tenant admins.

---

## 9. Migration Considerations (from Current Model)

No SQL here — this is the *contract* the migration must uphold. Full plan
lives in the Authorization Architecture doc (Phases P1–P12).

### 9.1 Invariants during migration

1. **No user loses any capability** unless it was explicitly identified as
   over-privileged and remediated in the same change set.
2. **Legacy `role_permissions` remains readable** and continues to feed
   `usePermissions.can()` until the catalog fully replaces it.
3. **Every legacy `(role, module, action)` tuple must map to exactly one
   permission key** in this catalog. The mapping table is authoritative
   and lives at `docs/PERMISSION_MIGRATION_MAP.md` (to be produced in the
   next step).
4. **`has_role(uid, 'admin')`** continues to evaluate true for legacy admin
   users; new bundles inherit the same privileges initially.
5. **RLS is not rewritten** in this phase — only `has_permission` is added
   as an *additional* callable helper. Policy migration is a later phase.
6. **Client `can()` returns the union** of legacy result and new catalog
   result during transition, so a permission granted through either path
   works.

### 9.2 Mapping strategy (legacy → catalog)

| Legacy | Catalog |
|---|---|
| `(module=patients, action=view)` | `patients.record.view` |
| `(module=patients, action=create)` | `patients.record.create` (implies `.view`) |
| `(module=patients, action=update)` | `patients.record.update` |
| `(module=patients, action=delete)` | `patients.record.delete` |
| `(module=patients, action=export)` | `patients.record.export` |
| `(module=invoices, action=edit)` | Fan-out: `finance.invoices.update.draft` + `finance.invoices.void` (both granted to holders of legacy `edit` during transition; split enforced when phase P6 lands) |
| `(module=treasury, action=edit)` | Fan-out: `finance.treasury.transaction.create` + `.transfer` + `.day.close` + `.day.reopen` |
| `(module=hr, action=edit)` | Fan-out per §2.4 hr split |
| `(module=settings, action=edit)` | Fan-out to `settings.*.configure` + `settings.insurance.*` + `notifications.*` |
| `isAdmin` FE checks | Mapped to specific permission keys (wallet.adjust, backup.run, etc.); admin bundles initially grant all so behavior identical |
| `roles.includes('hr')` | `hr.staff.view_sensitive` etc. |
| Direct RLS `has_role(...,'admin')` | Left in place; a parallel policy using `has_permission(...)` is added additively; legacy clause removed only after telemetry clean |

### 9.3 Telemetry gates before each removal

No legacy key/policy/clause is removed until:
- 60 days of `can()` telemetry show the *new* key covers every legitimate
  call site.
- Zero RLS denials on new policies for legitimate traffic.
- Regression suite green across all roles.
- Compliance review sign-off if any `regulatory_tag` is affected.

### 9.4 Deliverables produced by this phase (documentation only)

- This document — `docs/PERMISSION_CATALOG.md` — canonical catalog.
- Follow-up: `docs/PERMISSION_MIGRATION_MAP.md` — exhaustive legacy→catalog
  mapping table (one row per legacy tuple + one row per FE role-name
  occurrence).
- Follow-up: `docs/BUNDLE_ASSIGNMENTS.md` — bundle → role composition (Phase
  2 of RBAC refactor).

---

## Appendix A — Closed Vocabularies (Quick Reference)

**Groups:** `patients, appointments, queue, clinical, prescriptions, physio,
finance.invoices, finance.payments, finance.coupons, finance.treasury,
finance.expenses, finance.commissions, inventory, inventory.po, hr.staff,
hr.attendance, hr.leave, hr.payroll, hr.performance, reports, notifications,
branches, settings, settings.catalog, settings.insurance, settings.i18n,
security.identity, security.rbac, security.audit, system.backup,
system.selfaudit, system.jobs, integrations, dashboard`
*(reserved: telemedicine, ai, booking_public, crm, multi_org, api_tokens,
public_api)*

**Verbs:** `view, view_sensitive, create, update, delete, archive, restore,
void, cancel, sign, amend, assign, unassign, approve, reject, submit, close,
reopen, issue, redeem, receive, adjust, override, refund, transfer, run,
pay, export, export_bulk, import, print, configure, rotate, impersonate,
invoke, send`

**Qualifiers:** `own, branch, org, global, draft, posted, paid, void,
closed, self, controlled`

**Risk levels:** `low, medium, high, critical`

**Scopes:** `own, branch, org, global`

**Lifecycle stages:** `proposed, draft, active, deprecated, removed`

---

## Appendix B — Non-Goals of This Document

- Assigning bundles to roles (Phase 2).
- Writing SQL for the `permissions`, `permission_bundles`, `bundle_permissions`, `role_bundles` tables (Phase P1 implementation).
- Rewriting RLS policies (Phase P4+).
- Removing legacy `role_permissions` (Phase P12).
- Choosing an approval workflow implementation (Phase P8).
- Selecting MFA provider (out of scope for RBAC refactor).

---

*End of Permission Catalog v1.0-draft.*