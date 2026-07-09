# Settings Shadow QA — Operator Guide

Automated authorization QA for the Settings vertical slice. When the
four role credentials are present in the environment, the suite drives
every Settings subsection as each role, waits for the
`SettingsShadowProbe` RPCs to complete, then queries the shadow
reporting views and fails if the cutover gate is not green. When
credentials are absent the suite skips cleanly — no manual code changes
are required to enable it.

## Required environment variables

| Variable                        | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `BASE_URL`                      | Target origin (defaults to `http://localhost:8080`). |
| `VITE_SUPABASE_URL`             | Backend URL used by the validator to query the shadow views. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Backend anon key used with the admin JWT.     |
| `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`           | Admin QA account.        |
| `TEST_MANAGER_EMAIL` / `TEST_MANAGER_PASSWORD`       | Manager QA account.      |
| `TEST_ACCOUNTANT_EMAIL` / `TEST_ACCOUNTANT_PASSWORD` | Accountant QA account.   |
| `TEST_STAFF_EMAIL` / `TEST_STAFF_PASSWORD`           | Staff (denied) account.  |

No credentials are stored in the repository. Missing role vars cause
that role's walk to skip; missing admin vars cause the validator to
skip. Fabricating identities is never permitted.

## Run locally

```bash
# One-time
npx playwright install chromium

# End-to-end (setup + walk + validate)
BASE_URL=http://localhost:8080 \
VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... \
TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... \
TEST_MANAGER_EMAIL=... TEST_MANAGER_PASSWORD=... \
TEST_ACCOUNTANT_EMAIL=... TEST_ACCOUNTANT_PASSWORD=... \
TEST_STAFF_EMAIL=... TEST_STAFF_PASSWORD=... \
  npx playwright test \
    --project=setup:shadow \
    --project=settings-shadow-walk \
    --project=settings-shadow-validate
```

Playwright chains the three projects via `dependencies`, so the walk
cannot run before per-role login states exist, and the validator cannot
run before the walk has produced shadow traffic.

## Run in CI

Set the eight `TEST_*` variables plus the two `VITE_SUPABASE_*`
variables as CI secrets and add one step:

```yaml
- name: Settings shadow QA
  run: |
    npx playwright install --with-deps chromium
    npx playwright test \
      --project=setup:shadow \
      --project=settings-shadow-walk \
      --project=settings-shadow-validate
  env:
    BASE_URL: ${{ vars.PREVIEW_URL }}
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
    TEST_ADMIN_EMAIL: ${{ secrets.TEST_ADMIN_EMAIL }}
    TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
    TEST_MANAGER_EMAIL: ${{ secrets.TEST_MANAGER_EMAIL }}
    TEST_MANAGER_PASSWORD: ${{ secrets.TEST_MANAGER_PASSWORD }}
    TEST_ACCOUNTANT_EMAIL: ${{ secrets.TEST_ACCOUNTANT_EMAIL }}
    TEST_ACCOUNTANT_PASSWORD: ${{ secrets.TEST_ACCOUNTANT_PASSWORD }}
    TEST_STAFF_EMAIL: ${{ secrets.TEST_STAFF_EMAIL }}
    TEST_STAFF_PASSWORD: ${{ secrets.TEST_STAFF_PASSWORD }}
```

If any secret is missing the corresponding role or the validator skips
automatically — the job stays green but produces no cutover evidence.

## Expected output

On success the validator test logs four blocks — parity, matrix,
coverage, exit criteria — and finishes with `1 passed`.

```
===== SHADOW PARITY REPORT =====
[ ... ]
===== SHADOW MATRIX (settings) =====
[ ... ]
===== SHADOW KEY COVERAGE =====
[ ... ]
===== SHADOW EXIT CRITERIA =====
[ { ready_for_cutover: true, ... } ]
```

## Failure interpretation

| Failing assertion                          | Meaning                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `shadow regressions must be zero`          | The new model denies where legacy allowed — investigate the matrix row. |
| `unexpected expansions must be zero`       | The new model grants where legacy denied — privilege escalation risk.   |
| `ready_for_cutover must be true`           | Coverage / matrix / parity gates not all satisfied. Inspect exit view.  |
| `page errors for <role>`                   | Runtime error during the walk — the shadow data is untrustworthy.       |
| Query returns HTTP 401 / 403 / 404         | Reporting view not exposed to authenticated role, or admin token stale. |

Do not weaken any assertion. Migration 2 is approved only when the
validator passes with real traffic from all four roles.