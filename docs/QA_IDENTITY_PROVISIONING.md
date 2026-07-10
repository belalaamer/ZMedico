# QA Identity Provisioning

Infrastructure-only mechanism that provisions the four canonical QA users
consumed by the existing Settings Shadow QA Playwright framework. Nothing in
this document changes authorization, permissions, bundles, RLS, RPC gating,
or shadow logic.

## Purpose

The Settings Shadow QA suite (`tests/playwright/settings.shadow.spec.ts`)
drives the running application as four distinct role identities so the
authorization service records real shadow observations. Without those four
identities the shadow exit criteria cannot advance.

The canonical identities are:

| Env prefix        | Email                    | Role       |
| ----------------- | ------------------------ | ---------- |
| `TEST_ADMIN`      | `qa.admin@qa.local`      | admin      |
| `TEST_MANAGER`    | `qa.manager@qa.local`    | manager    |
| `TEST_ACCOUNTANT` | `qa.accountant@qa.local` | accountant |
| `TEST_STAFF`      | `qa.staff@qa.local`      | staff      |

All four are real Supabase Auth users bound to their business role via the
existing `admin-create-user` edge function — the same code path used by
Settings → Users. No bypass, no service-role exposure to the client, no
synthetic rows.

## Lifecycle

1. **Provision** (one-time per environment) via
   **Settings → QA Identities → Provision QA Identities**. The page is
   admin-only and calls `admin-create-user` for any of the four canonical
   emails that do not yet exist. Existing users are left untouched
   (idempotent).
2. **Consume** — copy the credentials into the eight `TEST_*` environment
   variables the Playwright suite reads (either via **Copy All** per card or
   **Download qa_credentials.txt**).
3. **Rotate** — use **Reset Password** on any card to mint a new password
   through `admin-reset-password`. The new value is shown once.
4. **Retire** — use **Delete QA Users** to remove every account whose email
   starts with `qa.`. The button is hard-guarded to that prefix.

## Provisioning

- Route: `/settings/qa` (admin-only, gated by `PermissionRoute adminOnly` and
  an in-page `useUserRole` guard).
- Backend: existing `admin-create-user` edge function. Role-scoped users
  (`manager`, `accountant`, `staff`) receive the first active branch as their
  `branch_id` — required by the existing function contract.
- Passwords: generated inside the edge function (`crypto.getRandomValues`,
  14 chars). Returned once in the response, rendered once in the browser,
  never persisted in the database and never logged.

## Reset

Click **Reset Password** on an existing card. The page calls
`admin-reset-password`; the new password is displayed once. Copy or export
before navigating away.

## Delete

**Delete QA Users** iterates the four canonical emails and calls
`admin-delete-user` for each. The client also enforces a
`startsWith("qa.")` guard so accidental misuse cannot delete non-QA accounts.

## How Playwright consumes `TEST_*`

`tests/playwright/helpers/shadowRoles.ts` reads eight environment variables:

```
TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD
TEST_MANAGER_EMAIL / TEST_MANAGER_PASSWORD
TEST_ACCOUNTANT_EMAIL / TEST_ACCOUNTANT_PASSWORD
TEST_STAFF_EMAIL / TEST_STAFF_PASSWORD
```

If any pair is missing the corresponding role is skipped — the framework
behavior is unchanged. Populate the eight variables from the exported
`qa_credentials.txt` (or by pasting **Copy All** values) into the Playwright
runner's environment before executing `settings.shadow.spec.ts`.

## Rollback

Documentation-only artifact plus a self-contained admin page. To roll back:

1. Click **Delete QA Users** (removes the four `qa.*` auth users, roles, and
   staff profiles through the existing admin delete path).
2. Remove the route entry `/settings/qa` and the sidebar item, delete
   `src/pages/settings/QAIdentities.tsx`, and delete this file.
3. No SQL, no migrations, no permission changes to revert.
