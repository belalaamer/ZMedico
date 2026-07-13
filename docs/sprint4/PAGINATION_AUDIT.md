# Pagination Audit

Goal: identify large list pages that currently render unbounded rows
and would benefit from the existing `TablePager` component
(`src/components/TablePager.tsx`). **No code changes were made** — this
report enumerates candidates and prioritizes them for a follow-up
sprint.

## Pages already paginated (baseline)

Grep signal: `TablePager` import or Supabase `count: "exact"`:

- `src/pages/patients/Patients.tsx`
- `src/pages/invoices/Invoices.tsx`
- `src/pages/payments/Payments.tsx`
- `src/pages/medical/MedicalRecords.tsx`
- `src/pages/medical/{Diagnoses,Medications,Procedures}.tsx`
- `src/pages/treasury/Treasury.tsx`
- `src/pages/hr/{Payroll,Positions}.tsx`
- `src/pages/reports/{OperationalReports,ReportsDashboard}.tsx`
- `src/pages/physio/PhysioReports.tsx`
- `src/pages/dashboard/Dashboard.tsx`
- `src/pages/settings/SystemInfo.tsx`

These pages already use server-side pagination; no action required.

## Candidate pages for pagination (P1 — high user impact)

| Page | Reason | Est. row growth |
|------|--------|-----------------|
| `src/pages/hr/Staff.tsx` | Staff list may exceed 100 rows in multi-branch tenants | Medium |
| `src/pages/hr/Attendance.tsx` | Time-series records grow daily | High |
| `src/pages/hr/Leaves.tsx` | Historical leave requests grow monotonically | Medium |
| `src/pages/inventory/Products.tsx` | Full product catalog | Medium-High |
| `src/pages/inventory/PurchaseOrders.tsx` | PO history grows monotonically | Medium |
| `src/pages/invoices/OutstandingDebts.tsx` | Long-lived AR list | Medium |
| `src/pages/coupons/*` (list views) | Coupon audit trail | Medium |
| `src/pages/expenses/*` (list views) | Expense ledger | High |

## Candidate pages (P2 — moderate impact)

| Page | Reason |
|------|--------|
| `src/pages/inventory/Suppliers.tsx` | Bounded but growing |
| `src/pages/hr/Departments.tsx` | Usually small; only paginate if a tenant exceeds ~50 |
| `src/pages/hr/Positions.tsx` (verify) | Grep shows some pagination; confirm coverage |
| `src/pages/branches/BranchDashboard.tsx` sub-lists | Nested lists |

## Non-candidates

- Detail pages (`*Detail.tsx`, `*Profile.tsx`).
- Dialog components (`*Dialog.tsx`).
- Wizards and settings forms.
- Anything with intrinsic small row-cap (`≤ 20 rows` by domain rule).

## Recommended follow-up work item

**Title**: "Sprint 4.1 — Pagination retrofit (P1 pages only)"

**Scope**: mechanical retrofit of the 8 P1 pages above using the
existing `TablePager`. Pattern to reuse verbatim from
`src/pages/patients/Patients.tsx`:

```ts
const PAGE_SIZE = 50;
const [page, setPage] = useState(0);
const { data, count } = await supabase
  .from(table)
  .select("*", { count: "exact" })
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
```

**Risk**: Low. `TablePager` returns `null` when `total <= pageSize`, so
small tenants see identical UX. No API contract change.

**Not in scope for this sprint**: any redesign of filters, sorting, or
column model. That would violate the "no UX redesign" guardrail.
