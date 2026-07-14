# RC1 — Testing Report

## Suites in place

- **Playwright**: `tests/playwright/` — RBAC deep, RBAC surface,
  mobile smoke, and shadow suites for HR, Invoices, Medical,
  Patients, Settings (spec + validate pairs). Auth setup fixture at
  `tests/playwright/auth.setup.ts`.
- **Vitest**: `src/test/` — setup and example only; component
  parity test at `src/components/Can.parity.test.tsx`.

## Coverage (qualitative, based on file survey)

| Area                                         | Depth |
|----------------------------------------------|:-----:|
| Authorization / RBAC (frontend)              | High  |
| Shadow probe parity (HR, Invoices, Medical, Patients, Settings) | High |
| Auth flow smoke                              | Medium |
| Business libs (`invoicePdf`, `queueAlerts`, `insuranceContracts`) | Low (TD-06) |
| Edge functions                               | Manual only |

## RC1 changes

None. Tests were not rewritten or added under freeze rules.

## Recommendations (post-RC1)

- TD-06: add Vitest coverage on the three business libs above.
- Wire Playwright shadow suites into the CI required-checks list
  once the 30-day retirement gate closes (per
  `docs/sprint5/SHADOW_FINAL_ASSESSMENT.md`).
