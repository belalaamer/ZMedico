
# Global Search 2.0 — v1 Analysis & Plan (no code yet)

## 1. Current state

### Search entry point
- `src/components/layout/Topbar.tsx` already renders a search `Input` (desktop, line 159) and a mobile sheet variant (lines 161-183). **Both are visually present but wired to nothing** — no state, no handler, no results dropdown. This is the natural mounting point for v1.

### How each module currently "searches"
All list pages load up to N rows from Supabase, then filter **client-side** by `.toLowerCase().includes(query)`. There is no server-side text search and no shared search service.

| Module | File | Loaded fields used for matching | Notes |
|---|---|---|---|
| Patients | `src/pages/patients/Patients.tsx` (line 126) | `first_name_en`, `last_name_en`, `first_name_ar`, `last_name_ar`, `phone`, `email` | Also displays `patient_code` (numeric, not matched) |
| Invoices | `src/pages/invoices/Invoices.tsx` (line 75) | `invoice_number` + joined patient name | `patient_code` shown but not matched |
| Payments | `src/pages/payments/Payments.tsx` | joined patient + invoice number for display | No text filter input today |
| Appointments / Calendar | `src/pages/calendar/CalendarPage.tsx` | filters by doctor / room / status only | No free-text search |
| Medical records | `src/pages/medical/MedicalRecords.tsx` | patient name + `patient_code` | Client-side |
| Prescriptions | `src/pages/medical/Prescriptions.tsx` (line 40) | patient name + `patient_code` | Client-side |
| Staff | `src/pages/hr/Staff.tsx` | (no search currently) | Profiles + staff_profiles |

### Best search keys per entity (v1 target)
- **patients**: `first_name_en/ar`, `last_name_en/ar`, `phone`, `phone2`, `email`, `patient_code` (numeric exact)
- **invoices**: `invoice_number`, joined `patients` name + `patient_code`
- **payments**: joined `invoices.invoice_number`, joined `patients` name/code, `amount` (NICE)
- **appointments**: joined `patients` name/code, `procedure`, `room`
- **medical records**: joined `patients` name/code, `visit_date` (NICE)
- **prescriptions**: joined `patients` name/code, `prescription_number` if present
- **staff**: `profiles.full_name`, `staff_profiles.employee_id`, `staff_profiles.phone`

## 2. Gaps / UX issues
- The Topbar search box is **decorative only**.
- Even the per-page filters only see the locally-loaded page of rows (typically 50–200), so users cannot find older records by name without paginating manually.
- Arabic users can search Arabic names on Patients/Invoices but not on Payments/Appointments/Records consistently.
- No way to jump straight from anywhere in the app to a specific patient or invoice by typing `#1234` or part of a phone.

## 3. Proposed Global Search v1

A single command-palette-style popover anchored to the Topbar input, querying Supabase per entity with `.or(... ilike ...)` filters, capped at small limits, grouped by entity, keyboard-navigable, click-to-navigate.

### UX
```text
┌──────── Topbar search ───────────────────────────────┐
│ 🔎  ahmad                                   ⌘K       │
└──────────────────────────────────────────────────────┘
  ┌─ Popover (max-h-[70vh], scroll) ───────────────────┐
  │ Patients (3)                                       │
  │   • Ahmad Ali   #1024   +20 100 …                  │
  │   • Ahmad Hassan #1156  +20 122 …                  │
  │ Invoices (2)                                       │
  │   • INV-2026-0312  Ahmad Ali   1,200 EGP  pending  │
  │ Appointments today/upcoming (1)                    │
  │   • Tue 16 Jun · 10:30 · Ahmad Ali · Dr. Hany      │
  │ Medical records (1) · Prescriptions (0)            │
  │ Staff (0)                                          │
  │ ──                                                 │
  │ Press ↵ to open · Esc to close                     │
  └────────────────────────────────────────────────────┘
```

### Behavior
- Trigger: typing in the existing Topbar input opens the popover; `⌘K` / `Ctrl+K` focuses it; `Esc` closes; `↑/↓/Enter` navigate results.
- Debounce 250 ms, min query length **2** (or **1** when input is purely digits — to support `#1024` patient/invoice codes).
- Parallel queries with `Promise.all`, each capped at `limit(5)` per entity, total ≤ ~35 rows.
- Branch scope: respect `currentBranchId` from `BranchContext` (same convention as list pages); fall back to all branches when none selected (matches existing pattern).
- Empty groups hidden; "No results" state when all groups empty.
- Permission filter: hide a group entirely if `usePermissions()` says the current user lacks `view` on that module (e.g. hide Payments group for non-finance users).

### Per-entity Supabase query shape (no schema changes)
- patients
  ```ts
  .from("patients")
    .select("id,patient_code,first_name_en,last_name_en,first_name_ar,last_name_ar,phone,phone2,email")
    .is("deleted_at", null)
    .or([
      `first_name_en.ilike.%${q}%`,
      `last_name_en.ilike.%${q}%`,
      `first_name_ar.ilike.%${q}%`,
      `last_name_ar.ilike.%${q}%`,
      `phone.ilike.%${q}%`,
      `phone2.ilike.%${q}%`,
      `email.ilike.%${q}%`,
      ...(digitsOnly ? [`patient_code.eq.${q}`] : []),
    ].join(","))
    .limit(5)
  ```
- invoices: `.or("invoice_number.ilike.%q%")` + a name-based sub-query via embedded patient (or two parallel queries unioned client-side: one on `invoice_number`, one on joined patient name through a server-side view IS NOT needed — use PostgREST's `.or(...)` with `patients!inner(...)` filter via `patients.first_name_en.ilike.*` syntax).
- payments: by joined `patients` name/code and joined `invoices.invoice_number`.
- appointments: scope to `scheduled_at >= today - 7d` to keep it relevant; match joined patient.
- medical_records, prescriptions, staff: analogous joined-patient/profile filters.
- All reads rely on **existing RLS** — no policy changes.

### Navigation targets
- Patient → `/patients/:id`
- Invoice → `/invoices/:id`
- Payment → `/payments?focus=:id` (or `/invoices/:invoice_id`)
- Appointment → `/calendar?date=YYYY-MM-DD&appt=:id` (already supported by `CalendarPage` per existing `?appt=` handler)
- Medical record → `/medical/records/:id`
- Prescription → `/medical/prescriptions/:id`
- Staff → `/hr/staff/:id`

## 4. Files to touch

| File | Change | MUST/NICE |
|---|---|---|
| `src/components/layout/Topbar.tsx` | Replace inert search `Input` with a `<GlobalSearch />` trigger that opens the popover; wire `⌘K` shortcut. | MUST |
| `src/components/search/GlobalSearch.tsx` *(new)* | Popover + debounced state + result groups + keyboard nav + navigate-on-select. Reuses shadcn `Command` primitives already in `src/components/ui/command.tsx`. | MUST |
| `src/lib/globalSearch.ts` *(new)* | Pure functions: one per entity returning `{ id, label, sub, to }[]` from Supabase; honours `branchId`. No new state library, no React in this file. | MUST |
| `src/lib/i18n.ts` | Add a handful of keys: `searchPlaceholder`, `noResults`, group labels (`resultsPatients`, etc.). | MUST |
| `src/components/layout/Topbar.tsx` (mobile sheet) | Mobile variant: same component opened full-width. | MUST |

No edits to: schema, RLS, migrations, sidebar, wallet, treasury, audit, automated comm, inventory, HR business logic, insurance.

## 5. MUST vs NICE

### MUST (v1)
- Functional Topbar search box opening a grouped popover.
- Live server-side search across: patients, invoices, payments, appointments (last 7 + future), medical records, prescriptions, staff.
- Bilingual (EN + AR) matching for entities that store both name variants.
- Branch scope respected; permission-based group hiding.
- Click result → navigate to the right page; Enter on highlighted row works.
- `Esc` to close, debounce 250 ms, per-entity `limit(5)`.

### NICE (later)
- `⌘K` global keyboard shortcut and `↑/↓/Enter` navigation polish.
- Recent searches (localStorage, last 5).
- Fuzzy ranking / typo tolerance (would need Postgres `pg_trgm` extension and a SECURITY DEFINER RPC).
- "Search in this module" scoped mode.
- Inline status/amount badges (pending invoice in red, etc.).
- Full-page `/search?q=` results view when popover is too narrow.
- Phone number normalization (strip spaces/dashes before `ilike`).
- Caching of frequent searches in React Query.

## 6. Verification checklist (after build, when approved)
- Typing `ahm` shows matching patients across Arabic and English names within 300 ms.
- Typing `#1024` or `1024` jumps straight to patient code `1024` (when digits-only mode activates).
- Typing an invoice number returns the invoice and clicking it opens `/invoices/:id`.
- Branch switch re-scopes results.
- A non-finance user does not see the Payments group.
- `Esc` closes; clicking outside closes; selecting a result navigates and closes.

Awaiting approval to implement v1.
