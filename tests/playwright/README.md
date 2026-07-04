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

## Mobile smoke suite

File: `mobile.smoke.spec.ts`. Runs against the four required mobile
viewports as separate Playwright projects so a failure tells you *which*
size broke:

- `mobile-smoke:iphone-se` (375×667)
- `mobile-smoke:iphone-14` (390×844)
- `mobile-smoke:pixel` (360×800)
- `mobile-smoke:ipad-mini` (768×1024)

Each project reuses the seeded Admin `storageState`, so the same
`ADMIN_EMAIL` / `ADMIN_PASS` env vars are required — `setup:admin` runs
automatically as a dependency.

Per route the spec asserts:

1. `documentElement.scrollWidth <= clientWidth` — no horizontal overflow.
2. `html[dir=rtl][lang^=ar]` — Arabic RTL stays intact.
3. Zero uncaught page errors during load.
4. Bottom tab bar (phone widths only) does not overlap any card on `/`.
5. Each critical area (`/patients`, `/calendar`, `/invoices`,
   `/payments`, `/treasury`, `/medical/quick-consult`, `/medical/records`,
   `/physio`, `/inventory/products`, `/hr/staff`, `/settings`) exposes a
   visible primary CTA with a tappable height (≥32 px). No mutations.

### Run

```bash
# All four viewports:
BASE_URL=https://<preview-host> ADMIN_EMAIL=... ADMIN_PASS=... \
  npx playwright test mobile.smoke.spec.ts

# One viewport:
BASE_URL=https://<preview-host> ADMIN_EMAIL=... ADMIN_PASS=... \
  npx playwright test --project=mobile-smoke:iphone-14
```