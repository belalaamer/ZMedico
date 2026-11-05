# Treasury custody cycle + cancelled-invoice default — Production apply receipt (2026-11-05)

Owner-approved COMMIT of three SQL files to Production `rqcmnfzfytyyicelvifk`, then a
read-only re-run of the financial regression suite. Every number below is measured, not
recalled: the apply gate was taken at apply time and **re-measured live on 2026-11-05 after
the front-end work**, so this document describes the database as it stands now.

Authorization: the owner named these three files and no others. Nothing else on Production
was written, and no row of `patients`, `invoices`, `invoice_items`, `payments`, services or
settings was touched.

| File | What it does |
| --- | --- |
| `20261105120000_search_invoices_page_hide_cancelled.sql` | adds `p_include_cancelled` (default `false`) to `search_invoices_page`, and makes `total_count` a window over the same filtered set so the pager cannot offer a page of rows the desk was never shown |
| `20261105130000_treasury_shift_cycle.sql` | the shift table, open/close/handover RPCs, state and report readers, immutability + audit triggers, and the `treasury.shift.use` permission grant to receptionist / manager / accountant / admin |
| `20261105131000_treasury_close_rigour_optional.sql` | recomputes a daily close's `opening_cash` / `expected_cash` / `non_cash_total` server-side instead of trusting the browser, refuses a future-dated close, and guards manual treasury rows inside a closed period |

The three files in `supabase/migrations/` carry the exact function bodies that were applied —
that is what the `prosrc` length + `md5` gate below proves. The only lines added to them after
the apply are header comments (the status paragraphs and the pointers to this file), and a
comment never reaches `prosrc`, so the gate still covers everything that executes. The reviewed
design work papers, which contain the pre-apply header text, hash
`dc6edff1a0c057df08edb780e178c887`, `8dedc52aabdf0e78ae1e0398d6ad8874` and
`b8657972736564abb04b04a979db600d`.
Per [docs/OPERATIONS.md](OPERATIONS.md) §2 the folder is the source of truth and there is no
automatic migration step, so nothing was recorded in
`supabase_migrations.schema_migrations` for these three versions (measured: 0 rows). That is
the documented shape of a deliberate apply, not an oversight.

## Byte-fidelity gate

Function bodies are the part that executes, so `prosrc` length and `md5` are the fidelity
test. Both columns below were re-read from `pg_proc` on Production after everything else in
this batch was done, and every row matches the value the dry run predicted.

| Function | `length(prosrc)` | `md5(prosrc)` |
| --- | --- | --- |
| `search_invoices_page` | 2401 | `bf72bdf35a8b209337e183d7941d6844` |
| `fn_treasury_shift_state` | 2080 | `90be6e2f2fa72542f7725572a294aab1` |
| `fn_treasury_shift_open` | 1648 | `7926c5ef68da2166357ac6a8674196e5` |
| `fn_treasury_shift_close` | 3183 | `2c724d1345a52f2f5fef8b11ae7430ec` |
| `fn_treasury_shift_handover_candidates` | 771 | `2f020363b64a9c19cb4a2c013f4f563e` |
| `fn_treasury_shift_report` | 1479 | `ce9b6fa2895dae38c603061a0303f2fd` |
| `_treasury_shift_authorize_branch` | 865 | `7941d0cf0345843e4dbd5f4cad299088` |
| `_treasury_shift_authorize_treasury` | 332 | `30ee2940212ca0f4555959bf5cc03974` |
| `_treasury_shift_window_totals` | 1067 | `c83270059ebdb799b1a14fe0fbeb452e` |
| `_tg_treasury_shift_immutable` | 1373 | `563032aa400c2c19e60232b80568f980` |
| `audit_treasury_shift_v1` | 1135 | `b7f7d63944e8f24f3b85fc5ac1ee6604` |
| `_tg_daily_close_recompute` | 1919 | `0813fa4cedb1b910fc83cc71889dc99e` |
| `_tg_treasury_manual_period_guard` | 528 | `cffcfd24923742566cac11ef022c74e3` |

## Schema and privilege state now on Production

Measured live:

- `treasury_shifts` exists with 20 columns. Triggers attached: 4 on `treasury_shifts`,
  4 on `treasury_transactions`, 6 on `treasury_daily_closes`.
- `EXECUTE` is granted to `authenticated` on exactly the six client-facing functions:
  `search_invoices_page`, `fn_treasury_shift_state`, `fn_treasury_shift_open`,
  `fn_treasury_shift_close`, `fn_treasury_shift_handover_candidates` and
  `fn_treasury_shift_report` (the owner-facing history reader).
- The seven internals (`_treasury_shift_authorize_branch`, `_treasury_shift_authorize_treasury`,
  `_treasury_shift_window_totals`, `_tg_treasury_shift_immutable`, `audit_treasury_shift_v1`,
  `_tg_daily_close_recompute`, `_tg_treasury_manual_period_guard`) are executable by
  `postgres` and `service_role` only. No `authenticated`, no `anon`, and no `PUBLIC` entry
  appears in any of their ACLs.
- `authenticated` has no table privilege on `treasury_shifts`. This is why
  `src/pages/treasury/Shift.tsx:115` reads the desk through
  `rpc("fn_treasury_shift_state")` and never `from("treasury_shifts")` — a table read would
  fail with `42501`, and `Shift.test.tsx` asserts `supabase.from` is never called.

## Who can actually open the till

`treasury.shift.use` is in the canonical catalog (`authz_permissions`, display name
"Open and close the till shift") and is carried by the four role bundles. Effective
permissions, read from `v_authz_effective_permissions` on Production:

- 11 users hold `treasury.shift.use` — 8 admin, 2 receptionist, 1 accountant, which is every
  staff user in those roles. No receptionist is left out.
- The legacy `role_permissions` rows for `treasury` were not edited (`admin=view,create,edit,
  delete,export`, `manager=view,export`, `accountant=view,create,edit,export`). The new duty
  lives only in the canonical store, so the front end has to resolve permissions canonically.
  It does: the tracked `.env` sets `VITE_AUTHZ_CANONICAL="true"`, and
  `src/lib/authz/canonicalFlag.ts:58` makes a production build take that value and ignore any
  browser override. A build with that flag off would hide the shift desk from everyone except
  an admin — the flag is part of this feature's contract, not an unrelated setting.

## Financial regression suite

`SELECT * FROM public.run_financial_regression_tests();` — read-only from the caller's point
of view (its own writes are inside a transaction it rolls back). Three runs total: twice on
apply day and once again on 2026-11-05 after the front-end batch. All three returned 12/12
PASS; the table below is the most recent run.

| # | Test | Result | Detail as reported |
| --- | --- | --- | --- |
| 1 | overpayment is blocked | PASS | Overpayment blocked: invoice total 1000.00, already paid 0, this payment 5000.00 exceeds t |
| 2 | payment on a cancelled invoice is blocked | PASS | Cannot record a payment against a cancelled invoice |
| 3 | negative invoice total is blocked | PASS | violates check constraint `invoices_discount_within_bounds` |
| 4 | zero-quantity line item is blocked | PASS | violates check constraint `invoice_items_quantity_pos` |
| 5 | treasury ledger is append-only | PASS | `treasury_transactions is append-only (op=UPDATE)` |
| 6 | payment settles invoice and posts to treasury | PASS | `status=paid paid=300.00 cash 0.00 -> 300.00` |
| 7 | voiding an invoice reverses the treasury | PASS | `cash returned to 0.00` |
| 8 | appointment reminders match branch config | PASS | `2 reminders, expected 2 from branch settings` |
| 9 | invoice number is per-branch | PASS | `INV-BR001-2026-0001` |
| 10 | paid_amount reconciles with payments | PASS | 0 invoice(s) disagree |
| 11 | invoice total = subtotal - discount + tax | PASS | 0 invoice(s) disagree |
| 12 | every live payment has a treasury entry | PASS | 0 orphan payment(s) |

## Zero-residue census

The runner and the apply must not have changed any live figure. Row counts were read
immediately before and immediately after the regression run above, and are identical:

| Measure | Before | After |
| --- | --- | --- |
| `treasury_transactions` rows | 85 | 85 |
| `treasury_daily_closes` rows | 0 | 0 |
| `treasury_shifts` rows | 0 | 0 |
| `invoices` rows | 52 | 52 |
| cancelled invoices | 19 | 19 |
| `payments` rows | — | 54 |
| `audit_logs` rows | 1304 | 1304 |

`treasury_daily_closes` and `treasury_shifts` are both still empty: nothing in this batch
moved money, and the desk opens its first shift when a receptionist first presses Open.
From that first close onward, the stored `expected_cash` is what the server recomputed, not
what the browser posted.

## What the front end does with it

- `src/pages/treasury/Shift.tsx` — the till desk: one state read per branch, per-treasury
  Open / Close / Hand-over, and the opening gap shown separately from the day's own movement
  so a cashier is never asked to explain money that arrived before their shift.
- `src/App.tsx:206` mounts it behind `PermissionRoute permission="treasury.shift.use"`, and
  `src/components/layout/Sidebar.tsx:150` offers it in the flat day list on the same key —
  so the link, the route gate and the database grant are one decision, not three.
- `src/pages/invoices/Invoices.tsx` wires the "Show cancelled" switch to
  `p_include_cancelled` and resets to page 0 on toggle, which is the client half of file (أ).
