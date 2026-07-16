# 30 — Reporting Guide

## Structure
- Reports live under `src/pages/reports`.
- Definitions/templates stored in `report_templates`; saved snapshots in `saved_reports`; schedules in `report_schedules`.
- Export presets in `audit_export_presets`.

## Permissions
Namespaced per domain: `reports_finance.*`, `reports_hr.*`, `reports_inventory.*`, `reports_medical.*`, `reports_operational.*`. Umbrella `reports.view` / `reports.export` are flagged for deprecation (see `docs/normalization/N4_DEAD_PERMISSION_REPORT.md`).

## Export path
1. UI action wrapped in `<CanExport>` (checks `*.export` permission + `exportGuard`).
2. Small exports handled client-side.
3. Bulk exports invoke `admin-export` edge function; audit row written.

## Extending
- Add template row → surface in the reports page → wrap UI in `<Can permission="reports_<domain>.view">`.
- New export format: update `src/lib/reportExport.ts` and `admin-export`.
