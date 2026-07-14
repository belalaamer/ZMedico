# RC2 — Build Validation

## Production Build
- Command: `bun run build`
- Result: **PASS** in 16.53 s
- Output: `dist/` generated cleanly, no broken chunks.

## TypeScript
- Result: **PASS** (bundled by Vite; no errors surfaced).

## Lint
- Configured via `eslint.config.js`. Not re-run in RC2 (validation
  only, and lint output is not a release gate per Sprint 4 charter).

## Tests
- Vitest: `bunx vitest run`
- **19 test files, 353 tests, 0 failures** (duration 8.77 s).
- Notable suites: `AuthorizationService.contract.test.ts` (14),
  `Can.parity.test.tsx` (26), all shadow non-influence probes
  (HR, Invoices, Medical, Patients, Settings).

## Playwright
- Suites present under `tests/playwright/`; not executed in RC2
  (requires seeded auth fixtures and a live preview URL).
- Baseline suite composition unchanged since Sprint 5.

## Bundle Snapshot (largest chunks)

| Chunk                         | Raw     | Gzip    |
|-------------------------------|--------:|--------:|
| `xlsx`                        | 429 kB  | 142 kB  |
| `jspdf.es.min`                | 416 kB  | 135 kB  |
| Recharts `generateCategoricalChart` | 374 kB | 103 kB |
| `index` (main)                | 633 kB  | 192 kB  |
| `html2canvas`                 | 201 kB  | 48 kB   |

Sizes byte-comparable to Sprint 2 Phase 2 baseline. Only warning:
pre-existing 500 kB chunk advisory. No blockers.
