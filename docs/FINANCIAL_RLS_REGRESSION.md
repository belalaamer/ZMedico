# Financial RPC and RLS Regression

This document records the server-side hardening completed after the live E2E review.

## Scope

The `financial_rpc_reference_guards` migration hardens `add_treasury_tx(...)`. A `payment` reference must belong to the same branch and treasury, must match the payment amount and income direction, must match cash classification, must be live, and may create only one ledger entry. An `expense` reference must belong to the same branch, must post as an expense, and the cumulative split entries may not exceed the source expense amount. Any other reference type, including manual adjustments, transfers, and reversals, still requires `treasury.tx.write` and branch access.

The same migration removes the permissive manager write policies for invoices, invoice items, payments, and expenses. This aligns database enforcement with `rolePermissions.ts` and `docs/RBAC_MATRIX.md`, where manager has finance view/export access but no financial mutation access. The trigger helper functions are not intended as public RPC endpoints, so direct `anon`/`authenticated` execute access is revoked while trigger-owned execution remains available.

## Verification performed

The migration was applied to Supabase project `rqcmnfzfytyyicelvifk`. Before the change, live financial data had zero active payments without a branch, zero non-wallet payments without a treasury, zero active expenses without a branch or treasury, and zero treasuries without a branch.

A transactional negative test impersonating the QA receptionist attempted to call `add_treasury_tx` with an existing payment reference and a forged amount of `4001.00` instead of `4000.00`. The result was `PASS: forged payment amount rejected`; the transaction did not commit.

The existing database financial regression suite was then run again. All 12 tests passed: overpayment blocking, cancelled-invoice blocking, non-negative invoice arithmetic, positive line-item quantity, append-only treasury ledger, payment-to-treasury settlement, invoice void reversal, reminder count, branch invoice numbering, paid-amount reconciliation, invoice arithmetic reconciliation, and payment-to-treasury orphan detection.

The regression-suite actor was corrected in `financial_regression_system_owner_actor` because branch isolation intentionally allows cross-branch access only to `system_owner`; selecting an arbitrary `admin` identity made the suite itself fail when that admin had no branch assignment.

## Reproduction commands

Run the existing financial suite in the Supabase SQL editor:

```sql
SELECT test, result, detail
FROM public.run_financial_regression_tests()
LIMIT 20;
```

The expected result is twelve rows with `result = 'PASS'`. The negative reference test should be executed in a transaction or savepoint and must assert that a payment-derived ledger call with a mismatched amount raises an exception.

## Remaining security gate

A complete pre-GA security campaign should still exercise every table through the PostgREST API with separate user sessions and multiple branches. The current migration closes the confirmed treasury-reference forgery and manager financial mutation gaps; it does not claim that every Supabase advisor warning about legacy SECURITY DEFINER routines or SECURITY DEFINER views has been resolved.
