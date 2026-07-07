# H3-1A — Single-Gate Authorization Cleanup

**Status:** Applied. Migration executed and verified.
**Scope:** `public.merge_staff_position` only.

## Implementation summary

Replaced the compound authorization expression with a single call to the
canonical permission gate:

```
-- before (H3-1)
_allowed := public.has_permission(_uid,'hr.edit')
         OR public.has_role(_uid,'admin'::public.app_role);
IF NOT _allowed THEN RAISE 'Forbidden ...'; END IF;

-- after (H3-1A)
IF NOT public.has_permission(_uid,'hr.edit') THEN
  RAISE 'Forbidden: missing hr.edit permission' USING ERRCODE='42501';
END IF;
```

All other logic — authenticated-caller guard, business logic, audit
insert, `search_path`, `SECURITY DEFINER` context, grants — is byte-for-byte
identical to the H3-1 body.

## Behavioral verification

`has_permission(_user_id, _permission_key)` has this first branch:

```
public.has_role(_user_id, 'admin'::public.app_role) OR EXISTS (... bundle lookup ...)
```

Truth table proves equivalence:

| Caller | Before | After |
|---|---|---|
| admin | true (via `has_role` clause OR `has_permission` admin branch) | true (via `has_permission` admin branch) |
| non-admin with `hr.edit` bundle | true | true |
| non-admin without `hr.edit` bundle | false | false |
| unauthenticated (`auth.uid() IS NULL`) | rejected by earlier guard | rejected by earlier guard |

Zero behavioral delta.

## Regression results

| Suite | Command | Result |
|---|---|---|
| Authorization regression harness | `bash scripts/authz/run_all.sh` | ✅ 0 RLS + 0 RPC decision changes; 0 unlabeled |
| Unit tests (Vitest) | `bunx vitest run` | ✅ 284 / 284 pass |
| Supabase linter | run by migration tool | 26 pre-existing `SECURITY DEFINER` WARN entries — unchanged; no new findings |

## Inventory of duplicated admin checks in SECURITY DEFINER functions

Query used:

```sql
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND pg_get_functiondef(p.oid) ILIKE '%has_permission%'
  AND pg_get_functiondef(p.oid) ILIKE '%has_role%';
```

| # | Function | Current authorization expression | Admin clause redundant? | Safe to remove? | Risk |
|---|---|---|---|---|---|
| 1 | `public.has_permission` | `has_role(_user_id,'admin') OR EXISTS(...bundle lookup...)` | **NO** — this IS the canonical implementation of the admin bypass; every other function inherits it | ❌ MUST NOT remove | — |
| 2 | `public.merge_staff_position` | (was) `has_permission(_uid,'hr.edit') OR has_role(_uid,'admin')` | **YES** | **YES** | none — behavior identical |

**Result: only one duplicate existed platform-wide, and it has now been
removed.** The six SECURITY DEFINER RPCs in the H-3 review batch
(`apply_wallet_tx`, `add_treasury_tx`, `apply_inventory_tx`,
`apply_coupon_code`, `receive_po_item`, plus the just-fixed
`merge_staff_position`) still use legacy `has_role`-only gates — they
have **no** `has_permission` call yet, so they are not duplicates; they
are pending H3-2 … H3-6 in the ratified Hotfix Order.

## Project-wide rule (now in force)

> **Every `SECURITY DEFINER` function in `public` MUST have exactly one
> authorization gate, and that gate MUST be `has_permission(auth.uid(), '<key>')`.**
>
> The canonical admin bypass lives inside `has_permission` and MUST NOT
> be reintroduced at call sites. `has_role(..., 'admin')` at a call site
> is a code smell and will fail review.

`merge_staff_position` is the reference implementation. All subsequent
H-3 hotfixes MUST follow the same skeleton:

```
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE ... USING ERRCODE='42501'; END IF;
  IF NOT public.has_permission(_uid, '<key>') THEN
    RAISE 'Forbidden: missing <key> permission' USING ERRCODE='42501';
  END IF;
  -- business logic
  -- audit insert (user_id := _uid)
END;
```

## Recommendation for the next cleanup batch

There are no further duplicated-admin-check cleanups to schedule — the
inventory above shows the platform is now clean on this specific
pattern. The next authorization batch remains the ratified H-3 Hotfix
Order (from `docs/security/H3_SECURITY_DEFINER_RPC_REVIEW.md`):

1. **H3-2 `add_treasury_tx`** — HIGH. Drop `_by` param, gate on
   `treasury.transfer / .income / .expense`, add branch scope check.
2. **H3-3 `apply_wallet_tx`** — HIGH. Add branch/patient scope check,
   gate on `patient_wallet.credit/.debit/.adjust` (pending PD-05).
3. **H3-4 `apply_inventory_tx`** — MEDIUM. Drop `_by`, gate on
   `inventory.write`.
4. **H3-5 `receive_po_item`** — MEDIUM. Drop `_by`, gate on
   `purchase_orders.receive`. Ship with H3-4.
5. **H3-6 `apply_coupon_code`** — LOW. Gate on `coupons.redeem`.

Each MUST land as its own migration and MUST use the single-gate
skeleton established here.

## Rollback procedure

Rolling back H3-1A alone (restoring the redundant admin clause) is
possible but not recommended. To roll back to the pre-H3-1 body use
`docs/security/H3_1_MERGE_STAFF_POSITION_ROLLBACK.sql`.