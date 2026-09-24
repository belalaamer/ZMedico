# QA Identity Provisioning

Infrastructure-only mechanism for the canonical QA users consumed by the
Playwright authorization suites. Nothing in
this document changes authorization, permissions, bundles, RLS, RPC gating,
or shadow logic.

## Purpose

The authorization QA uses dedicated Supabase Auth identities so UI route guards
and backend RLS are exercised with real sessions. Settings Shadow QA consumes a
subset; `rbac.spec.ts` and `rbac.deep.spec.ts` cover all seven operational roles.

The canonical identities are:

| Env prefix          | Email                       | Role         |
| ------------------- | --------------------------- | ------------ |
| `TEST_ADMIN`        | `qa.admin@qa.local`         | admin        |
| `TEST_MANAGER`      | `qa.manager@qa.local`       | manager      |
| `TEST_DOCTOR`       | `qa.doctor@qa.local`        | doctor       |
| `TEST_NURSE`        | `qa.nurse@qa.local`         | nurse        |
| `TEST_RECEPTIONIST` | `qa.receptionist@qa.local`  | receptionist |
| `TEST_ACCOUNTANT`   | `qa.accountant@qa.local`    | accountant   |
| `TEST_HR`           | `qa.hr@qa.local`            | hr           |

All seven are real Supabase Auth users bound to their business role via the
existing `admin-create-user` edge function — the same code path used by
Settings → Users. No bypass, no service-role exposure to the client, no
synthetic rows.

## Lifecycle

1. **Provision** (one-time per environment) via
   **Settings → QA Identities → Provision QA Identities**. The page is
   admin-only and calls `admin-create-user` for any canonical
   email that do not yet exist. Existing users are left untouched
   (idempotent).
2. **Consume** — copy/export the one-time credentials. Local shadow tests can consume the
   `TEST_*_EMAIL` / `TEST_*_PASSWORD` pairs; GitHub CI uses the canonical
   emails and therefore needs only the seven `TEST_*_PASSWORD` secrets.
3. **Rotate** — use **Reset Password** on any card to mint a new password
   through `admin-reset-password`. The new value is shown once.
4. **Retire** — use **Delete QA Users** to remove every account whose email
   starts with `qa.`. The button is hard-guarded to that prefix.

## Provisioning

- Route: `/settings/qa` (admin-only, gated by `PermissionRoute adminOnly` and
  an in-page `useUserRole` guard).
- Backend: existing `admin-create-user` edge function. Role-scoped users
  (`manager`, `doctor`, `nurse`, `receptionist`, `accountant`, `hr`) receive an active branch as their
  `branch_id` — required by the existing function contract.
- Passwords: generated inside the edge function (`crypto.getRandomValues`,
  32 chars). Returned once in the response, rendered once in the browser,
  never persisted in the database and never logged.

## Reset

Click **Reset Password** on an existing card. The page calls
`admin-reset-password`; the new password is displayed once. Copy or export
before navigating away.

## Delete

**Delete QA Users** iterates the seven canonical emails and calls
`admin-delete-user` for each. The client also enforces a
`startsWith("qa.")` guard so accidental misuse cannot delete non-QA accounts.

## How Playwright consumes `TEST_*`

The canonical emails are fixed in the RBAC suites, so GitHub Actions only needs
these repository secrets:

```
TEST_ADMIN_PASSWORD
TEST_MANAGER_PASSWORD
TEST_DOCTOR_PASSWORD
TEST_NURSE_PASSWORD
TEST_RECEPTIONIST_PASSWORD
TEST_ACCOUNTANT_PASSWORD
TEST_HR_PASSWORD
```

The older per-slice shadow helpers still support `TEST_*_EMAIL` overrides for
local/custom environments. Missing passwords cause the corresponding local
slice to skip; the PR CI gate first checks that all seven password secrets are
present before it runs the protected-route, UI-RBAC, and deep-RLS suites.

## Rollback

Documentation-only artifact plus a self-contained admin page. To roll back:

1. Click **Delete QA Users** (removes the seven operational `qa.*` auth users, roles, and
   staff profiles through the existing admin delete path).
2. Remove the route entry `/settings/qa` and the sidebar item, delete
   `src/pages/settings/QAIdentities.tsx`, and delete this file.
3. No SQL, no migrations, no permission changes to revert.
