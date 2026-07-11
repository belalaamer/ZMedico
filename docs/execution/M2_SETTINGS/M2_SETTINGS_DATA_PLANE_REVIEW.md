# Migration 2 — Settings Data-Plane Architecture & Security Review

Status: Design proposal — no code yet. Awaiting approval before implementation.
Scope: Settings slice write cutover only. Legacy authorization, RLS policies,
permission bundles, and shared shadow infrastructure remain untouched.

## 1. Executive summary

The prior Batch-1 note assumed the Settings cutover required ~15 SECURITY
DEFINER RPCs — one per write-bearing table. A full inventory of the current
data plane shows this is unnecessary and actively harmful to maintainability.

Every Settings write table already:

1. Has RLS enabled, and
2. Has a write policy that binds admin (and in some cases manager) through
   either has_role(...) or has_permission(auth.uid(), 'settings.edit').

The data plane already enforces exactly the authorization contract the
frontend cutover needs. The cutover is therefore almost entirely a frontend
rename from legacy `<Can module="settings" action="edit">` to the canonical
permission keys (settings.org.update, settings.pricing.update,
settings.catalog.update, settings.integrations.manage,
settings.branch.update). No new SQL surface is required for the common case.

Two — and only two — write paths genuinely need a SECURITY DEFINER RPC:

- User linking / role assignment (user_roles + staff_profiles +
  employee_id_counter, driven from UserManagement.tsx).
- Role-permission matrix save (role_permissions bulk upsert): a partial write
  leaves the tenant with an inconsistent authorization state and must be
  transactional + audit-logged.

Everything else stays behind RLS with a direct supabase.from(...) call.

**Recommended surface: 2 RPCs, not 15.**

## 2. Complete Settings write inventory (grouped by capability)

### 2.1 Organization / clinic profile — settings.org.update

| Table | Op | Caller | Current authz check | RLS write policy |
|---|---|---|---|---|
| clinic_profile | upsert | GeneralSettings.tsx | legacy Can settings.edit (route gate) | cp_admin: has_permission(uid,'settings.edit') |
| system_languages | insert/update | Languages.tsx | route admin gate | admin-only |

### 2.2 Branch / scheduling — settings.branch.update

| Table | Op | Caller | Current authz check | RLS write policy |
|---|---|---|---|---|
| appointment_settings | upsert | AppointmentSettings.tsx | route gate | as_admin: has_permission(uid,'settings.edit') |
| notification_settings | upsert | NotificationSettings.tsx, RemindersSettings.tsx, AutomatedCommunication.tsx | route gate | ns_admin: has_permission(uid,'settings.edit') |

### 2.3 Pricing / billing — settings.pricing.update

| Table | Op | Caller | Current authz check | RLS write policy |
|---|---|---|---|---|
| invoice_settings | upsert | InvoiceSettings.tsx | route gate | is_admin: has_role(uid,'admin') |
| payment_methods | insert/update/toggle | PaymentMethods.tsx | route gate | pm_admin: has_role(uid,'admin') |

### 2.4 Catalog — settings.catalog.update

| Table | Op | Caller | Current authz check | RLS write policy |
|---|---|---|---|---|
| services | insert/update/soft-delete/toggle | Services.tsx | route gate | admin/manager |
| service_categories | insert/update/soft-delete/toggle | Services.tsx | route gate | admin/manager |

### 2.5 Integrations & templates — settings.integrations.manage

| Table | Op | Caller | Current authz check | RLS write policy |
|---|---|---|---|---|
| insurance_companies | insert/update/delete | InsuranceCompanies.tsx | UI isSuperAdmin + route gate | ic_write_admin: has_role(uid,'admin') |
| insurance_contracts | insert/update/delete | InsuranceContracts.tsx | route gate | admin/manager |
| insurance_contract_rules | insert/update/delete | InsuranceContracts.tsx | route gate | admin/manager |
| communication_templates | upsert/delete | AutomatedCommunication.tsx | route gate | admin/manager |
| email_templates / sms_templates / whatsapp_templates | update | Templates.tsx | route gate | has_permission(uid,'settings.edit') |
| system_backups | insert | BackupExport.tsx | route gate | admin |

### 2.6 Identity & authorization — the only genuinely privileged group

| Table | Op | Caller | Current authz | RLS | DEFINER? |
|---|---|---|---|---|---|
| user_roles | insert/delete | UserManagement.tsx (link/edit/unlink/create) | UI admin gate | admin | Yes — multi-step, must be atomic with staff_profiles |
| staff_profiles | update branch_id | UserManagement.tsx (create flow) | UI admin gate | admin | Bundled with user_roles write |
| employee_id_counter | upsert | UserManagement.tsx (create flow) | UI admin gate | admin | Bundled with user_roles write |
| allowed_signup_emails | insert/delete | UserManagement.tsx | UI admin gate | admins manage allowlist | No — single-row, safe under RLS |
| audit_logs | insert | UserManagement.tsx (client-side audit) | UI admin gate | admin | Server-side only — should be written by the identity RPC |
| role_permissions | bulk upsert | RolePermissions.tsx | canEditMatrix + route gate | admin | Yes — transaction + audit + authz-version bump |

## 3. Proposed RPC catalogue (final: 2 RPCs)

### 3.1 settings_assign_user_role(target_user_id uuid, new_role app_role, branch_id uuid default null)

- Why DEFINER: replaces the current 2–3 sequential client writes
  (delete user_roles → insert user_roles → optional update staff_profiles →
  optional upsert employee_id_counter) with a single transactional call.
  Client-side sequencing today can leave a user with no role if the second
  call fails — a privilege-integrity bug.
- Authorization: assert has_role(auth.uid(),'admin') at function entry.
- Audit: writes audit_logs row inside the same transaction (removing the
  client-side audit insert).
- Least privilege: REVOKE ALL FROM public; GRANT EXECUTE TO authenticated.
- Replaces UserManagement.tsx lines 168, 205–218, 250, 372–377, plus the
  client-side audit_logs insert at line 39.

### 3.2 settings_save_role_permissions(matrix jsonb)

- Why DEFINER: bulk upsert of N×M rows. Partial failure today produces an
  inconsistent authorization state visible to every user in the tenant — the
  single highest-blast-radius write in the product.
- Authorization: assert has_permission(auth.uid(),'settings.edit') at entry
  (matches existing RLS).
- Audit: writes one audit_logs row summarizing the change (roles/modules,
  actor, diff hash).
- Transaction: single INSERT ... ON CONFLICT inside the function's implicit
  transaction.
- Replaces RolePermissions.tsx lines 87–100.

### 3.3 Explicitly NOT wrapped in DEFINER

| Group | Rationale |
|---|---|
| Org / branch / pricing / catalog / integrations / templates | Single-table upsert or CRUD. RLS already binds writes to admin/manager via has_role or has_permission('settings.edit'). A DEFINER wrapper would duplicate the check and remove Postgres's row-level enforcement — a net regression. |
| allowed_signup_emails | Single-row insert/delete gated by has_permission('settings.edit'). No cross-table invariant. |
| system_backups | Insert-only, admin-gated, no cross-table invariant. |
| Soft deletes on services / service_categories | Simple update deleted_at; RLS binds to admin/manager. |

## 4. Required UI changes (frontend / presentation only)

1. Can prop cutover — every Settings page using `<Can module="settings" ...>`
   switches to the canonical key:
   - settings.org.update → GeneralSettings, Languages
   - settings.branch.update → AppointmentSettings, NotificationSettings,
     RemindersSettings, AutomatedCommunication (branch-scoped writes)
   - settings.pricing.update → InvoiceSettings, PaymentMethods
   - settings.catalog.update → Services
   - settings.integrations.manage → InsuranceCompanies, InsuranceContracts,
     Templates, BackupExport, AutomatedCommunication (template list writes)
2. UserManagement.tsx — replace inline user_roles / staff_profiles /
   employee_id_counter / audit_logs sequences with one
   supabase.rpc('settings_assign_user_role', {...}). Remove client audit insert.
3. RolePermissions.tsx — replace the role_permissions upsert with
   supabase.rpc('settings_save_role_permissions', { matrix }).
4. Flip Settings slice status in src/lib/authz/slices/completedSlices.ts from
   shadow to complete, last, after 1–3 land and tests pass.

No changes to route gates, PermissionRoute, AuthorizationService, or the
shadow probe.

## 5. Required integration tests

### 5.1 Vitest
- Extend settings.slice.parity.test.ts with post-cutover assertions: admin
  holds all 5 keys, non-admin holds none.
- Add settings.cutover.invariant.test.ts asserting no source file under
  src/pages/settings/ still contains `<Can module="settings"`.

### 5.2 Playwright (extend settings.shadow.validate.spec.ts)
- Admin calls settings_assign_user_role → row appears in user_roles, audit
  row exists, staff_profiles.branch_id updated.
- Non-admin same call → permission denied.
- Admin calls settings_save_role_permissions with a minimal matrix diff →
  rows persisted, audit entry created.
- Non-admin same call → permission denied.
- RLS regression: direct client insert on user_roles / role_permissions as
  non-admin still fails (proves RLS was not weakened by adding the RPC).

### 5.3 Postgres linter
- search_path = public on both functions.
- SECURITY DEFINER with REVOKE ALL FROM public; GRANT EXECUTE TO authenticated.
- No SET role inside functions.

## 6. Rollback plan

1. Slice flag flip back to shadow — instant, pure frontend.
2. UI Can rename — revert commit; legacy settings.edit bundle is still
   populated for admins throughout the shadow phase.
3. RPC call sites — revert UserManagement.tsx and RolePermissions.tsx to the
   direct-table writes. RLS keeps them working.
4. DEFINER functions — DROP FUNCTION in
   docs/execution/M2_SETTINGS/M2_SETTINGS_ROLLBACK.sql. Because RLS was never
   loosened, dropping the functions cannot open a hole.

No data migration; no destructive schema change; no policy change.

## 7. Security risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| DEFINER function bypasses RLS unintentionally | Medium | Explicit has_role/has_permission guard as first statement; search_path=public; REVOKE ALL, GRANT EXECUTE TO authenticated. |
| Client relies on RPC and forgets legacy RLS still works | Low | RLS policies unchanged; both paths continue to enforce admin. |
| Audit-log tampering by moving audit into DEFINER | Low | Moving audit into the function is a hardening — client can no longer skip it. |
| Matrix RPC allows privilege escalation via role enum injection | Low | app_role is a Postgres enum; invalid values fail parse. Function additionally validates each row. |

No new attack surface vs. the current supabase.from('user_roles').insert(...)
which already runs with the caller's admin privilege.

## 8. Performance impact

- settings_assign_user_role: 3 round-trips → 1. Net faster.
- settings_save_role_permissions: unchanged (single bulk upsert) + one audit
  insert. Negligible.
- All other Settings writes: unchanged direct-table calls.

## 9. Auditability & consistency

- All privileged mutations funnel through 2 named functions — grep-friendly,
  loggable, single source of truth for the two invariants that matter
  (identity assignment, permission matrix).
- Non-privileged Settings edits continue to be audited via existing table
  triggers where present.

## 10. Legacy components removable after cutover

Once Settings flips to complete and stabilises:
- `<Can module="settings" ...>` usages inside src/pages/settings/** (matches
  the Batch-1 removal set for the other four slices).
- The settings.edit / settings.create / settings.delete / settings.export
  entries in the legacy per-module map become dead reads (their RLS functions
  has_permission(uid,'settings.edit') still evaluate them, so the DB rows must
  stay until Migration 3 rewrites the policies to canonical keys). Do NOT
  drop them in this batch.

The shadow probe, telemetry, and non-influence tests remain until every slice
is complete and Migration 3 (policy rewrite) closes the loop.

## 11. Final recommendation

Approve the 2-RPC design (settings_assign_user_role,
settings_save_role_permissions) over the previously-scoped ~15-RPC design:

- 13 fewer functions to write, review, monitor, and eventually deprecate.
- Strictly safer: RLS remains the primary boundary for ~90% of Settings
  writes; DEFINER is used only where the current code has a real
  transactional or auditability gap.
- Rollback-trivial: two DROP FUNCTIONs and a UI revert.

If approved, implementation proceeds in this order:
1. Migration adding the 2 DEFINER functions (linter pass).
2. UI Can prop rename across src/pages/settings/**.
3. UserManagement.tsx + RolePermissions.tsx switched to RPC calls.
4. Vitest + Playwright suites extended and green.
5. Flip Settings slice to complete in completedSlices.ts.
6. Final Migration 2 completion report.
