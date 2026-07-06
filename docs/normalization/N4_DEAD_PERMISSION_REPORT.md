# N4 — Dead Permission Report & Naming Standard

**Status:** Analysis only.

## 1. Truly Dead Keys
No key in the current catalog is fully dead (every existing key is granted in ≥1 bundle and either used by RLS or planned for a wave). Formal delete list: **0**.

## 2. Umbrella / Overlap Analysis

### 2.1 `reports.view` / `reports.export` vs `reports_<domain>.*`
- `reports.view` is granted to admin, doctor, hr, manager.
- Domain-specific `reports_<domain>.view` are granted to the same roles plus targeted subsets (e.g., accountant only on `reports_finance`).
- Frontend uses `reports.view` in one wrapper component and `reports_finance.export` in a dedicated finance report.
- **Effect:** every consumer that checks `reports.view` accepts everyone who holds any `reports_<domain>.view`. The umbrella is genuinely redundant.

**Recommendation:**
1. Add `reports.<domain>.view/export` as canonical (already present).
2. Deprecate `reports.view` / `reports.export`: mark `deprecated=true`, set `replaced_by='reports_<domain>.view'` (multi-value note in description).
3. Migrate the single frontend consumer to check for `any(reports_*.view)`.
4. Delete umbrella keys in a later hygiene wave (post-Wave-3H).

### 2.2 `settings.export` misuse
`settings.export` is currently used on `audit_logs`, `user_activity_logs`, `system_backups`, `report_schedules`. Only the first two are audit-domain; the others are legitimately "settings". Introduce `audit.read` (N1) and repoint `audit_logs`, `user_activity_logs` policies to it. This is a *behavior* change; treat as its own mini-migration wave, not part of N4.

### 2.3 Verb overlaps
- `.edit` vs `.approve`: currently `.edit` covers both mutation and workflow advancement on `leave_requests`, `purchase_orders`, `performance_reviews`, `invoices`. N1 introduces `.approve` to split them. Do not remove `.edit`; both are needed.
- `.view` vs `.export`: kept distinct; export operations produce persistent PII artifacts and need separate audit gating.
- `patients.delete` vs soft-delete flag: `patients.delete` is used only for soft deletion in current UI. Rename **not** recommended — soft/hard distinction handled by RLS predicate, not by the key.

### 2.4 Group overlaps
- `medical_records` currently umbrellas `dental_chart`, `diagnoses`, `procedures`, `vital_signs`. N1 splits them out. Decision: **split**, because clinicians and admins need finer control (e.g., a dental hygienist should get `dental.edit` without `medical_records.edit`). Keep `medical_records.*` for the parent note record.
- `treasury` vs `patient_wallet`: separate — different subjects and audit lifecycles.
- `inventory` vs `products`: separate — SKU catalog editing is a merchandising op, stock counting is an ops op.

## 3. Naming Standard (canonical)

Restated from N1 §1 for enforcement:

1. `<group>.<verb>[.<qualifier>]` — lowercase, `.`-separated, no plural inconsistencies.
2. Verb from closed set (`view, create, edit, delete, export, approve, configure` + documented customs).
3. `group_key` = leftmost segment; must appear in the group registry (N1 §2).
4. Deprecations tracked via `deprecated=true` + `replaced_by`. No silent deletions.
5. No wildcards (`*`) in keys or RLS.
6. Every new key requires: business operation reference, at least one bundle grant, and a target RLS wave.

## 4. Redundancy Score

- Umbrella redundancy: 2 keys (`reports.view`, `reports.export`).
- Misuse redundancy: 1 key on 2 tables (`settings.export` on audit tables).
- True duplicates: 0.

**Naming Compliance Score: 100 %** for the current 67 keys; N1's 84 proposals all comply by construction.
