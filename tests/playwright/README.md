# Playwright — Seeded Auth QA

Deterministic authenticated QA (desktop + mobile) using a real seeded
account and Playwright `storageState`. No app code is touched.

## Files

- `../../playwright.config.ts` — projects (`setup:admin`, `admin-desktop`, `admin-mobile`) and the shared `storageState` path.
- `auth.setup.ts` — logs in once via `/auth` with `ADMIN_EMAIL` / `ADMIN_PASS` and writes `tests/playwright/.auth/admin.json`.
- `.auth/` — generated storage state files. Gitignored.

## Required environment variables

| Var           | Purpose                                                        |
| ------------- | -------------------------------------------------------------- |
| `BASE_URL`    | Target origin. Defaults to `http://localhost:8080`. Set to the preview URL for sandbox QA. |
| `ADMIN_EMAIL` | Seeded QA Admin account email.                                 |
| `ADMIN_PASS`  | Seeded QA Admin account password.                              |

## Usage

```bash
# One-time (per machine): install browser
npx playwright install chromium

# 1. Run auth setup only (produces .auth/admin.json)
BASE_URL=https://<preview-host> ADMIN_EMAIL=... ADMIN_PASS=... \
  npx playwright test --project=setup:admin

# 2. Run authenticated suite — setup runs automatically as a dependency.
#    Authenticated specs must be named `*.admin.spec.ts`.
BASE_URL=https://<preview-host> ADMIN_EMAIL=... ADMIN_PASS=... \
  npx playwright test --project=admin-desktop

BASE_URL=https://<preview-host> ADMIN_EMAIL=... ADMIN_PASS=... \
  npx playwright test --project=admin-mobile
```

## Adding more roles later

1. Add another `STORAGE_STATE_<ROLE>` constant in `playwright.config.ts`.
2. Add a matching `setup:<role>` project pointing at a new
   `<role>.setup.ts` file that reads role-specific env vars.
3. Add a per-role authenticated project that depends on that setup
   and uses the corresponding `storageState`.