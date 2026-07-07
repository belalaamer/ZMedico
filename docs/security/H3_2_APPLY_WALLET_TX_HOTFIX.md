# H3-2 — `apply_wallet_tx` Hotfix Report

**Status:** Applied. Migration executed and verified.
**Scope:** `public.apply_wallet_tx` only.
No other SECURITY DEFINER function touched.
**Follows H3-1A architecture:** confirmed — exactly one `has_permission`
gate, no `has_role`, no `OR admin`, actor derived from `auth.uid()`,
auth-check runs before any business write.

## Implementation summary

Replaced the multi-branch role check with the H3-1A single-gate pattern.
Signature, return type, `SECURITY DEFINER` context, `search_path`,
direction map, wallet lock, balance guard, and audit fields on
`patient_wallet_transactions` are all preserved.

Permission key selection is business data (driven by `_tx_type`) but the
authorization *decision* is a single call to `public.has_permission`.
The interim key mapping preserves the pre-hotfix role set exactly:

| Transaction type | Required permission | Roles that hold it today |
|---|---|---|
| `topup`, `refund`, `spend`, `referral_reward` | `patients.edit` | admin, manager, receptionist |
| `adjustment_credit`, `adjustment_debit` | `patients.delete` | admin |

These are the exact role sets the previous `has_role` gate allowed.
Verified live against `authz_role_bundles`:

```
admin        → patients.edit ✅
manager      → patients.edit ✅
receptionist → patients.edit ✅
accountant   → patients.edit ❌
doctor       → patients.edit ❌
hr           → patients.edit ❌
nurse        → patients.edit ❌
staff        → patients.edit ❌
```

Re-keying to `patient_wallet.credit / .debit / .adjust` is queued for
the PD-05 catalog batch; the swap will be a one-line change to the
`CASE ... END` inside this function.

## Security improvements

| Concern | Before | After |
|---|---|---|
| Authorization gates in body | 2 (`has_role` triads across two branches) | **1** — single `has_permission` call |
| `has_role(..., 'admin')` at call site | ✅ present (implicit admin bypass) | ❌ removed — admin bypass is inherited from `has_permission` |
| Authenticated caller guard | ❌ absent (`auth.uid() IS NULL` would have hit the role check and appeared as generic "Forbidden") | ✅ explicit reject with `42501` |
| Client-supplied actor id | N/A — signature never had `_by` | Unchanged; `created_by` is still `auth.uid()`, now hoisted into `_uid` for consistency |
| Auth check before any write | ⚠️ ran after the `_patient_id`/`_amount` sanity checks (harmless, but not policy-aligned) | ✅ auth check is now the first business step |
| Audit forgery | ✅ not possible (no client actor field) | ✅ still not possible |

## Authorization flow

```
client RPC ─▶ apply_wallet_tx
                │
                ├─ _uid := auth.uid()
                ├─ _uid IS NULL ?          ─▶ RAISE 42501 "authentication required"
                │
                ├─ _required_perm := CASE tx_type WHEN adjust* THEN 'patients.delete' ELSE 'patients.edit' END
                │
                ├─ has_permission(_uid, _required_perm) ?
                │      │
                │      ├─ admin bypass inside has_permission  ─▶ allow
                │      ├─ bundle grants _required_perm        ─▶ allow
                │      └─ neither                              ─▶ RAISE 42501 "missing <key>"
                │
                └─ business logic (unchanged)
                       ├─ lock/create wallet row
                       ├─ compute new balance, negative guard
                       ├─ INSERT patient_wallet_transactions(..., created_by = _uid)
                       └─ UPDATE patient_wallets(balance)
```

**Exactly one authorization decision per invocation.** Grep of the new
body confirms zero `has_role(` calls and zero `OR admin` clauses.

## Regression results

| Suite | Command | Result |
|---|---|---|
| Authorization regression harness | `bash scripts/authz/run_all.sh` | ✅ 0 unlabeled changes after labeling analyzer noise |
| Runtime permission verification | `SELECT role, has_permission=…` per role | ✅ same 3 roles allowed as before (admin/manager/receptionist), same 5 denied (accountant/doctor/hr/nurse/staff) |
| Unit tests (Vitest) | `bunx vitest run` | ✅ 284 / 284 pass |
| Supabase linter | run by migration tool | 26 pre-existing `SECURITY DEFINER` WARN entries — unchanged; no new findings |

### Harness note (analyzer limitation, not a regression)

`scripts/authz/analyze_rpcs.py` only recognises literal
`has_role(auth.uid(), '<role>'::app_role)` patterns. After the hotfix
the body has none, so the analyzer flags 5 rows as `deny → allow`
(accountant, doctor, hr, nurse, staff). Runtime behavior is unchanged —
`has_permission` still denies those roles. The 5 rows are recorded in
`scripts/authz/intentional_changes.txt` with justification and a
pointer to this document, so the harness now reports **0 unlabeled**.

## Compatibility impact

- **Signature:** unchanged — `(uuid, wallet_tx_type, numeric, text, uuid, text, text, uuid) → uuid`.
- **Frontend caller (`src/pages/patients/PatientWalletTab.tsx:284`):** works without any change.
- **Internal callers** (triggers and other SECURITY DEFINER functions that `PERFORM public.apply_wallet_tx(...)`): work unchanged. `auth.uid()` propagates from the originating JWT; any code path that previously succeeded still does. Any code path that previously executed without a JWT would have failed the old `has_role` gate too.
- **Error surface:** unauthorized calls now raise SQLSTATE `42501` with `Forbidden: missing <key> permission` instead of the previous domain-specific strings. Client already surfaces the RPC error verbatim; UX unchanged for authorized users.
- **Types file:** unchanged — no signature drift.

## Rollback procedure

Single statement restores the exact pre-hotfix body. Grants are
idempotent and unchanged.

```bash
psql "$SUPABASE_DB_URL" -f docs/security/H3_2_APPLY_WALLET_TX_ROLLBACK.sql
```

After rollback, also remove the H3-2 block from
`scripts/authz/intentional_changes.txt` and re-run
`bash scripts/authz/run_all.sh` to confirm baseline parity.

## H3-1A architecture conformance checklist

- ✅ Exactly one authorization decision per invocation.
- ✅ Sole gate is `public.has_permission(auth.uid(), '<key>')`.
- ✅ No `has_role(...)` calls in the function body.
- ✅ No `OR admin` fallback (inherited from `has_permission`).
- ✅ Authenticated caller derived server-side (`_uid := auth.uid()`); no client-supplied identity.
- ✅ Auth check executes before any business write.
- ✅ Audit field (`patient_wallet_transactions.created_by`) records the authenticated caller and is not forgeable.
- ✅ Business behavior byte-for-byte identical (direction map, balance lock, negative-balance guard, wallet upsert, return value all unchanged).

## Next in the Hotfix Order

**H3-3 `add_treasury_tx`** — HIGH. Drop the client-supplied `_by`
parameter (breaking-signature change; requires updating
`Treasury.tsx` and `TransferDialog.tsx` in the same PR), gate on a
single `treasury.*` permission, validate `_treasury_id`'s branch. Ship
independently — do not bundle with H3-2.