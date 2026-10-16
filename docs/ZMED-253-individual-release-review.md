# ZMED-253 — individual inventory finite-value release review

P0data-integrity exposure, not known current Production corruption. Exact reviewed old shared stock core accepts numeric NaN and locally persisted invalid stock/cost. Production read-only scans found0non-finite stock/reservation rows and0non-finite ledger quantity/cost rows at observation time.

## Exact candidate

`supabase/migrations/20261015213250_guard_finite_inventory_values.sql`

SHA256: `e5d3f29ec0be88a961ae10f7f1c0e6020ecea7887a545009c13e4f10312386cb`.

Required old function MD5: `9eab0ab0d1df589f7cb65c0b8f883a21`.

Expected candidate function MD5: `c8ca403209aae36cd19e5d52ef1072e3`.

Same inventory_tx_core signature; only non-finite quantity/cost rejection added before writes. Existing tenant, stock lock, reservations, negative balance, actor, ledger, execute ACL and function ownership preserved. No grants/policies/tables/data repaired or changed. No250/251dependency or frontend publication. Apply one migration only, transactionally, after explicit approval and fresh prerequisite/ACL review. Never db push or history repair. A changed body/replay fails the preflight.

## Evidence

- Baseline6/6configured authenticated SQL checks prove actual NaN quantity/cost corruption locally with rollback.
- Candidate35/35configured authenticated SQL checks, including finite operations, negative/zero/null/reserved/insufficient cases, manager transfer/receipt, receptionist/branch denials, atomic later-line receipt failure, replay guard and exact restoration.
- Candidate35/35native HTTP checks including cleanup: separate real Auth manager/receptionist sessions; bad numeric strings rejected without stock/ledger mutation; correct valid adjustment actor despite spoofed_by; balanced two-branch transfer; partial purchase receipt; atomic invalid later line; branch/receptionist denials.
- Security advisors clear while candidate installed; owner/ACL/all RLS policies unchanged. Production core explicitly not executable by anon/authenticated; existing service-role permission not widened and not used for tested business actions.
- Focused source/related regression15/15and scoped lint passed. Previous735-test application baseline is250/251, not a fresh253suite;253does not change frontend production source.
- Failed cleanup attempt was recovered with exact fixture ownership checks (stock alert FK); final rerun verifies product/stock/ledger/PO/items/supplier/alerts/notifications absent, sessions/roles/memberships removed, accounts retained banned and audit retained. Original function restored exactly locally.

## Postflight after any separately approved application

Check exact candidate MD5 and unchanged original owner/ACL/policies. Compare business snapshots and non-finite row counts without issuing mutations to real stock. Migration deployment itself must not create/update/delete inventory rows. Preserve the exact old function definition and metadata for reviewed rollback if needed. No unrelated migration or frontend change included.

## Remaining scope

Native API verifies backend manager inventory actions; full screen/browser duplicate submission, stale absolute stock-count handling, broader185active-session coverage and every stock-producing workflow remain separate. Do not mark the whole system Production-ready from this release.
