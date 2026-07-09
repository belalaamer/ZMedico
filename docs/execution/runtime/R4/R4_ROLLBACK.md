# R4 — Rollback Procedure

R4 introduced no SQL, no code, and no catalog changes. It is a
verification / documentation wave over the state produced by R3 + H3-1 +
H3-2. To revert the SECURITY DEFINER migration to the pre-R3 state, run
the underlying rollbacks in reverse dependency order:

1. `docs/execution/runtime/R3/R3_ROLLBACK.sql` — restores the pre-R3
   bodies of `add_treasury_tx`, `apply_coupon_code`, `apply_inventory_tx`,
   `check_expiry_alerts`, `fn_treasury_day_cash_summary`,
   `receive_po_item`. Leaves the new permission keys in place (idempotent,
   unused after rollback).
2. `docs/security/H3_2_APPLY_WALLET_TX_ROLLBACK.sql` — restores the
   pre-H3-2 body of `apply_wallet_tx`.
3. `docs/security/H3_1_MERGE_STAFF_POSITION_ROLLBACK.sql` — restores the
   pre-H3-1 body of `merge_staff_position`.

After rollback:

*   Re-run `bash scripts/authz/run_all.sh` and confirm the diff report
    matches the pre-R3 Golden Baseline snapshot.
*   `GUARDRAILS_STRICT=0` remains the safe default; the R3.5 guardrails
    do not require R3/R4 state and continue to protect the codebase.

R4 itself is code-only in `docs/`; no further steps are required to
revert the documentation.
