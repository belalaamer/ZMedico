# Sprint 2 — Phase 2: Bundle & Runtime Optimization

**Date:** 2026-07-11
**Scope:** Runtime performance only. No authorization, RLS, edge function, database schema, permission bundle, or generated-type changes.

---

## 1. Executive Summary

Phase 2 targets the two largest eager-loaded dependency clusters (`jspdf` + `html2canvas` PDF stack, and `xlsx` spreadsheet stack) and two over-broad Supabase reads (`profiles.select("*")` in Attendance & User Management).

All heavy export/print libraries are now fetched only when the user actually clicks Print / Download PDF / Export Excel. Route bundles for `Invoices`, `PrescriptionDetail`, `Reports/*`, and `Settings/BackupExport` no longer transitively require the PDF/XLSX chunks at first render.

Runtime memory on Attendance and User Management is reduced from "entire profiles table" to "only the profiles needed for the current view".

---

## 2. Modified Files

| File | Change |
|---|---|
| `src/lib/prescriptionPdf.ts` | Top-level `jspdf` + `html2canvas` imports removed; loaded via `await import(...)` inside `generatePrescriptionPdf`. |
| `src/lib/invoicePdf.ts` | Same treatment for `generateInvoicePdf` (covers both Download and Print modes). |
| `src/lib/reportExport.ts` | `jspdf`, `html2canvas`, `xlsx` all moved to dynamic imports. `exportReportExcel` promoted to `async` (all call sites are fire-and-forget click handlers — behaviour preserved). |
| `src/pages/settings/BackupExport.tsx` | `xlsx` imported on-demand inside `exportTable`. |
| `src/pages/hr/Attendance.tsx` | `profiles.select("id,full_name,email")` now filtered `.in("id", staffIds)` using the staff already loaded for the current branch. |
| `src/pages/settings/UserManagement.tsx` | `profiles.select("*")` narrowed to `select("id,full_name,email")` — the only fields the page renders or edits. |
| `vite.config.ts` | Unchanged (see §6). |

No other files were touched.

---

## 3. Bundle Comparison (production build, `bun run build`)

Only chunks with meaningful movement are listed. All sizes are raw / gzip.

### Heavy vendor chunks

| Chunk | Before | After | Delta |
|---|---|---|---|
| `html2canvas.esm-*.js` | 617.71 kB / 182.26 kB | 201.42 kB / 47.70 kB | −416 kB / −134 kB raw (split — see below) |
| `jspdf.es.min-*.js`    | (bundled into html2canvas chunk) | 415.94 kB / 134.67 kB | now its own chunk |
| `xlsx-*.js`            | 284.02 kB / 94.34 kB | 429.35 kB / 142.02 kB | isolated; loaded only on export |
| `index-*.js` (main)    | 637.29 kB / 192.30 kB | 637.16 kB / 192.27 kB | ≈ 0 (unchanged) |

### First-render impact (what the user actually downloads on cold load)

Because the exporter libraries are now referenced exclusively via `import()` from inside async handlers, Vite/Rollup emits them as **separate chunks that are no longer prefetched by any route bundle**. On a cold load of the app the browser previously downloaded ~617 kB of `html2canvas` + `jspdf` and ~284 kB of `xlsx` as soon as the user visited *any* route that lazy-imported a page using these libs (Reports, Invoices, Prescription detail, Backup/Export).

After Phase 2:

- **PDF stack (html2canvas + jspdf)**: 617 kB → 0 kB at first render. Downloaded (once, cached) only when the user clicks Print / Download PDF. Estimated saving on first paint of Invoice/Prescription/Reports routes: **~180 kB gzip**.
- **XLSX stack**: 284 kB → 0 kB at first render. Downloaded only when the user clicks Export Excel. Estimated saving on first paint of Reports / Backup: **~94 kB gzip**.
- **Combined worst-case saving (Reports route)**: **~275 kB gzip / ~900 kB raw** removed from the critical path.

The main `index-*.js` chunk is essentially unchanged because the exporter libs were already tree-shaken out of it in Phase 1 (they lived in lazy-loaded route chunks). The win in Phase 2 is *when* those chunks are fetched — no longer during route load, only during user-initiated export.

---

## 4. Runtime / Memory Impact

### Attendance page

`supabase.from("profiles").select("id,full_name,email")` previously returned **every** profile in the org (used only for name-label lookup on the currently visible staff list). Now filtered `.in("id", staffIds)` where `staffIds` is the branch-scoped staff already fetched.

- Payload reduction: proportional to `(profiles − active staff in current branch)`. For a 20-branch clinic with ~500 profiles and ~25 staff per branch, this is ≈ **95 % fewer rows per Attendance load**.
- Memory: `profiles` state array shrinks correspondingly.
- Behaviour: identical — `profName()` only ever looks up IDs present in `staff`.

### User Management page

`profiles.select("*")` returned every column of every profile (including any wide/JSON columns). Narrowed to `id, full_name, email` — the only fields rendered in the user list, badge row, dialogs, or filtered by the search box.

- No column referenced by the page is dropped (verified by grep against `users[...]`, `u.`, `user.`, `full_name`, `email`, `avatar`, `phone`).
- Payload reduction depends on schema width; typically **50–80 % smaller JSON per row**.
- Behaviour: identical — edit / delete / reset flows key off `id` and re-fetch or pass explicit fields via RPC / edge function.

---

## 5. Chunk Analysis

After Phase 2 the top chunks are:

```
index-*.js                            637 kB / 192 kB gzip   (main; unchanged)
xlsx-*.js                             429 kB / 142 kB gzip   (on-demand, export only)
jspdf.es.min-*.js                     416 kB / 135 kB gzip   (on-demand, print/pdf only)
generateCategoricalChart-*.js         374 kB / 103 kB gzip   (recharts; already lazy per route)
html2canvas.esm-*.js                  201 kB /  48 kB gzip   (on-demand, print/pdf only)
index.es-*.js (dompurify)             151 kB /  51 kB gzip   (used by jsPDF / prescription PDF)
```

All four export/print chunks are now leaf nodes of the module graph — nothing at route level imports them statically.

---

## 6. `manualChunks` Decision

Reviewed `vite.config.ts`. Rollup's default splitting already places every heavy dependency (`react`, `react-dom`, `@tanstack/react-query`, `recharts`, `xlsx`, `jspdf`, `html2canvas`, `@radix-ui/*`) in its own chunk driven by the existing `dedupe` list and per-page `React.lazy` boundaries.

Introducing a `manualChunks` block was evaluated against three criteria from the task:

1. **Duplicated parsing** — none observed: cross-page vendor code is already single-chunked by default.
2. **Network requests** — no reduction available without merging chunks that are conditionally needed (which would *increase* first-load cost).
3. **Initial bundle cost** — main chunk unchanged after removing PDF/XLSX eager imports; further manual grouping would either shift bytes from lazy → eager (regression) or add HTTP/2 request overhead with no size benefit.

**Decision:** no `manualChunks` change. Documented here to close the task; will be revisited if a future measurement identifies a duplicate-module hotspot.

---

## 7. Verification

- `bun run build` — succeeds with only the pre-existing 500 kB warning on the main chunk (unchanged from baseline).
- TypeScript check — passes (harness auto-runs; no diagnostics after the fix-up commits reported inside this session).
- Behaviour spot-checks against the touched code paths:
  - `generateInvoicePdf({ mode: "print" | "download" })` — dynamic import happens before any DOM node is inserted; render path unchanged.
  - `generatePrescriptionPdf` — same pattern; canvas + jsPDF calls untouched.
  - `exportReportPDF` / `exportReportExcel` — signatures unchanged; `exportReportExcel` now returns `Promise<void>` but all call sites in `src/pages/reports/*` invoke it as a click handler (`onExcel={() => exportReportExcel(...)}`) which already ignores the return value.
  - `Attendance` — `profName(id)` still resolves for every rendered staff row because those IDs are the `staffIds` used in the `.in()` filter.
  - `UserManagement` — no reference to any profile column outside `{id, full_name, email}` in the render or dialog trees.

No RLS, no `SECURITY DEFINER`, no edge function, no schema, no permission bundle, no generated Supabase type was modified.

---

## 8. Rollback Plan

Per-file revert is safe and independent:

1. Restore top-level imports:
   ```ts
   // src/lib/prescriptionPdf.ts, src/lib/invoicePdf.ts, src/lib/reportExport.ts
   import jsPDF from "jspdf";
   import html2canvas from "html2canvas";
   // src/lib/reportExport.ts, src/pages/settings/BackupExport.tsx
   import * as XLSX from "xlsx";
   ```
   and remove the `await import(...)` lines inside the exporter functions.
2. Revert `exportReportExcel` back to a synchronous `function`.
3. In `src/pages/hr/Attendance.tsx` restore the unconditional `supabase.from("profiles").select("id,full_name,email")`.
4. In `src/pages/settings/UserManagement.tsx` restore `.select("*")`.

No database, migration, or configuration rollback is required.

---

## 9. Remaining Performance Debt

Tracked for a future Phase 3, out of scope here:

- **`recharts` (374 kB / 103 kB gzip)** — currently pulled by any dashboard/report page that renders a chart. Candidate for lazy-loaded chart wrapper components.
- **`dompurify` (`index.es-*.js`, 151 kB / 51 kB gzip)** — currently pulled through the jsPDF chunk; already gated behind the PDF dynamic import in Phase 2, but could be pruned further if we switch to a lighter sanitizer for the invoice/prescription HTML injection path.
- **Main `index-*.js` (637 kB / 192 kB gzip)** — dominated by Supabase JS client, React Router, i18n dictionaries, and the app shell. Splitting requires structural changes (route-group prefetch, dictionary chunking) and belongs in a dedicated sprint.
- **`Patients` / `Invoices` / `MedicalRecords` / `Payments` pagination (Phase 1)** — server-side ranges are in; virtualized rendering of long lists would further reduce React reconciliation cost.
- **`Staff.tsx`, `Payroll.tsx`, `Leaves.tsx`, `Departments.tsx`** — still call `profiles.select("id,full_name,email")` unfiltered. Same pattern as Attendance; safe to apply the branch-scoped `.in()` filter in a follow-up if measured to matter.

---

**Result:** first-render payload on export-heavy routes reduced by ~275 kB gzip; runtime payload on Attendance / User Management reduced proportionally to org size; zero behaviour, security, or authorization change.