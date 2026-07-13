# Performance Audit

Goal: identify Supabase query patterns that are known or likely
performance bottlenecks, and recommend narrow SQL-view or index
follow-ups **only where a bottleneck is proven**. No code, migrations,
or schema changes are emitted by this sprint.

## Method

- Static grep across `src/` for patterns known to cause N+1s or
  full-table fetches: multiple sequential `.from(...).select(...)` in
  one component, missing `.range(...)`, and client-side reductions
  over server rows.
- Cross-reference to already-identified hot paths in
  `docs/performance/SPRINT2_PHASE1_REPORT.md` and
  `docs/performance/SPRINT2_PHASE2_REPORT.md`.
- **Note**: no runtime profiling was executed (Sprint 4 is
  audit-only). The list below is *candidate* work, not confirmed
  regressions.

## Confirmed hot paths (from prior sprints)

Already addressed in Sprint 2 phase reports; no further action needed:

- Dashboard KPI aggregation
- Reports dashboard filters
- Global search fan-out

## New candidate hot paths (Sprint 4)

### P1 — client-side aggregation over unbounded rows

| File | Pattern | Suggested fix |
|------|---------|--------------|
| `src/pages/reports/DoctorPerformance.tsx` | Fetches raw appointments + invoices, aggregates in JS | Introduce a **read-only SQL view** `v_doctor_performance` that returns pre-aggregated rows per doctor + period. No change to underlying tables. |
| `src/pages/reports/DoctorCommissions.tsx` | Same shape as above over `doctor_commissions` | Introduce `v_doctor_commissions_summary`. |
| `src/pages/invoices/OutstandingDebts.tsx` | Client-side `reduce` over full AR set | Introduce `v_outstanding_debts` scoped by branch. |
| `src/pages/patients/PatientFinancialCard.tsx` | Multiple sequential queries per patient (wallet + invoices + payments) | Consider a single RPC returning the composite; **do not** change RLS. |

### P2 — potential N+1

| File | Notes |
|------|-------|
| `src/pages/hr/Payroll.tsx` | Loops payroll rows and re-queries adjustments per row in some flows. Verify with EXPLAIN before acting. |
| `src/pages/patients/PatientTreatmentPlans.tsx` | Sequential fetches for plan + sessions + procedures. |

### P3 — indexing candidates

Do **not** add indexes speculatively. Confirm via
`supabase--slow_queries` before recommending any `CREATE INDEX`.
Sprint 4 explicitly does not emit SQL.

## Guardrails

- Any SQL view proposed above must be **`SECURITY INVOKER`** and rely
  on existing RLS — no `SECURITY DEFINER` shortcuts.
- Views must not shadow public tables (`v_` prefix is mandatory).
- Client migration to a view is a two-step change:
  1. Ship the view + `GRANT SELECT` to `authenticated`.
  2. Switch the page to read from the view.
- Both steps require explicit approval; **neither is performed in
  Sprint 4**.

## Recommended follow-up work items

- **Sprint 4.2**: create `v_doctor_performance`,
  `v_doctor_commissions_summary`, `v_outstanding_debts` and switch the
  three consumer pages to read from them. Estimated effort: ~1 day.
- **Sprint 4.3 (conditional)**: composite RPC for
  `PatientFinancialCard` **only if** slow-query telemetry confirms it
  is a top offender.

## Risk

Low, and only realized once follow-ups are approved. Views over
existing tables inherit their RLS, so no policy change is required.
