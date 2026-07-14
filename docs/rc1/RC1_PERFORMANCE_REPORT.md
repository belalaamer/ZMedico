# RC1 — Performance Report

**Baseline:** Sprint 2 Phase 2 bundle snapshot; unchanged.

| Optimization                                                | Status |
|-------------------------------------------------------------|:------:|
| Route-level `React.lazy` + `Suspense` (`src/App.tsx`)       | INTACT |
| Server-side pagination: Patients, Invoices, MedicalRecords, Payments | INTACT |
| `TablePager` component in use                               | INTACT |
| Dynamic `jspdf` + `html2canvas` import                      | INTACT |
| Dynamic `xlsx` import (reports, backup, user mgmt)          | INTACT |
| Narrowed Supabase selects (Attendance, UserManagement, MedicalRecords) | INTACT |

**Bundle sizes** are byte-comparable to the Sprint 2 Phase 2
baseline captured in `docs/final/FINAL_RELEASE_SIGNOFF.md`. No
regression.

## Deferred (tracked, not RC1)

- TD-01: expand server-side pagination to Appointments, HR,
  Inventory list pages.
- TD-05 / L5: replace client-side aggregation in Treasury / Reports
  with SQL views (`v_doctor_performance`, …).
- M5 / M6: further Recharts and main-entry chunk splitting.
- L6: memoization / virtualization for long tables.

## RC1 fixes applied

None. No production-blocking performance regression observed.
