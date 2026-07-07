# Security Standardization Sprint S1 — SECURITY DEFINER Standard v1

**Status:** Documentation only. No SQL, no code, no function changes.
**Scope:** Extract the canonical authorization pattern from the two completed
hotfixes (`merge_staff_position` — H3-1/H3-1A, `apply_wallet_tx` — H3-2) into
a reusable project standard, and stage the remaining H-3 hotfixes against it.

---

## 1. SECURITY DEFINER Standard v1

Every `SECURITY DEFINER` function in `public` MUST follow this seven-step
skeleton, in this order, with no additional authorization decisions
interleaved.

```
1. AUTHENTICATION
   _uid := auth.uid();
   IF _uid IS NULL THEN
     RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
   END IF;

2. DERIVE ACTOR
   Actor is ALWAYS _uid. Never a client-supplied parameter.
   Signatures MUST NOT accept _by / user_id / actor_id.

3. SINGLE AUTHORIZATION GATE
   IF NOT public.has_permission(_uid, '<key>') THEN
     RAISE EXCEPTION 'Forbidden: missing <key> permission'
       USING ERRCODE = '42501';
   END IF;
   Exactly ONE has_permission call. No has_role. No OR admin.
   Permission key MAY be selected by business data via CASE, but the
   decision call itself is singular.

4. VALIDATE BUSINESS CONTEXT
   Sanity checks on inputs (non-null ids, positive amounts, existence
   and branch scope of referenced rows via user_has_branch_access when
   applicable). No auth logic in this step.

5. EXECUTE BUSINESS TRANSACTION
   Locks, computes, mutates. Byte-for-byte identical to the pre-standard
   body for hotfixes; behavior-preserving only.

6. IMMUTABLE AUDIT RECORD
   created_by / performed_by / actor_id column := _uid. Never trust a
   client value. Insert happens inside the same transaction as step 5.

7. RETURN
   Single, typed return. No secondary side effects after.
```

### Mandatory rules

1. `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'` on every
   definer function. No exceptions.
2. Exactly one authorization decision per invocation. The sole gate is
   `public.has_permission(auth.uid(), '<key>')`.
3. No `has_role(...)` in the body. The admin bypass lives inside
   `has_permission` and MUST NOT be duplicated at call sites (H3-1A rule).
4. No client-supplied actor parameters. `_by`, `user_id`, `actor_id`,
   `performed_by` etc. are forbidden in the signature of new or
   refactored definer functions. Breaking-signature removal is required
   when refactoring legacy functions.
5. Authentication guard (`_uid IS NULL` → `42501`) executes before any
   business validation or write.
6. Error surface for authorization failure is SQLSTATE `42501` with the
   message `Forbidden: missing <key> permission` (or
   `authentication required` for step 1).
7. Audit fields are written from `_uid` only, in the same transaction as
   the business write. Never from a parameter.
8. `EXECUTE` grants are the standard tuple
   `postgres, service_role, authenticated, sandbox_exec`. `anon` MUST
   NOT be granted execute on a definer function unless explicitly
   designed for anonymous callers (none exist today).
9. Business behavior of a refactor MUST be byte-for-byte identical to
   the pre-refactor body. Standardization is not a place to fix logic
   bugs.
10. Every refactor ships with a one-statement rollback SQL file and a
    hotfix report in `docs/security/`.

### Reference implementations

- `public.merge_staff_position` — H3-1 + H3-1A (single-arg gate, no
  audit table, no branch scope).
- `public.apply_wallet_tx` — H3-2 (CASE-selected permission key, wallet
  lock, audit row via `_uid`).

---

## 2. Common sequence — reusable-pattern opportunities

Both reference functions collapse to the same opening prologue:

```plpgsql
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(_uid, '<key>') THEN
    RAISE EXCEPTION 'Forbidden: missing <key> permission'
      USING ERRCODE = '42501';
  END IF;
  -- business logic
END;
```

### Candidate helper: `public.require_permission(text)`

A `STABLE`, `SECURITY INVOKER`, `search_path = public` helper that:

- Reads `auth.uid()` internally.
- Raises `42501 authentication required` if null.
- Raises `42501 Forbidden: missing <key> permission` if
  `has_permission(auth.uid(), _key)` returns false.
- Returns `uuid` (the authenticated `_uid`) on success so callers can
  assign it in one line:
  `_uid uuid := public.require_permission('<key>');`

Adopting the helper collapses ~8 lines of prologue to 1 line in every
definer function and removes the last remaining copy-paste opportunity
for authorization drift. Do NOT implement in S1 — this document
identifies it as the intended S2 follow-up once the H-3 hotfixes are
complete. Introducing it mid-hotfix would blur the byte-for-byte
behavior-preservation guarantee that gates each rollback.

### Also identical across both references

- SQLSTATE choice (`42501`) and message shape.
- `SET search_path TO 'public'` clause.
- Grants tuple.
- Rollback file naming (`<TICKET>_<function>_ROLLBACK.sql`) and structure
  (single `CREATE OR REPLACE FUNCTION`).
- Hotfix report skeleton (implementation summary, security improvements
  table, authorization flow diagram, regression results, compatibility
  impact, rollback procedure, H3-1A conformance checklist).

The report skeleton is worth extracting to
`docs/security/_TEMPLATE_DEFINER_HOTFIX.md` alongside the helper work.
Also out of scope for S1.

---

## 3. Remaining SECURITY DEFINER function inventory

Four functions from the H-3 review remain. All facts drawn from
`docs/security/H3_SECURITY_DEFINER_RPC_REVIEW.md` and re-validated here.

### 3.1 `add_treasury_tx`

| Field | Value |
|---|---|
| Estimated complexity | HIGH |
| Expected permission key | Target `treasury.transfer` / `.income` / `.expense` selected via CASE on `_type`. Pending PD-05; interim mapping preserves current `admin OR receptionist` role set via existing bundle keys. |
| Expected actor source | `auth.uid()`. Drop `_by` from signature (breaking). |
| Audit strategy | `treasury_transactions.created_by := _uid` (already the column; today filled from `_by`). Preserve balance-lock GUC pattern. |
| Deviations from standard | Two callers (`Treasury.tsx`, `TransferDialog.tsx` ×2) must be updated in the same PR to stop sending `_by`. Signature change requires types file regeneration. |

### 3.2 `apply_inventory_tx`

| Field | Value |
|---|---|
| Estimated complexity | HIGH |
| Expected permission key | `inventory.write` (single key; today admin-only gate). |
| Expected actor source | `auth.uid()`. Drop `_by` (breaking). |
| Audit strategy | `inventory_transactions.created_by := _uid`. Preserve `last_restocked_at` side-effect. |
| Deviations from standard | Called from another SECURITY DEFINER (`receive_po_item`) which forwards `_by`. Must ship together with §3.3 so the chain remains consistent. Four React call sites (`StockOverview.tsx` ×2, `CreateInvoiceDialog.tsx`, `InvoiceDetail.tsx`) need the `_by` argument removed. |

### 3.3 `receive_po_item`

| Field | Value |
|---|---|
| Estimated complexity | MEDIUM (chain-follower of §3.2) |
| Expected permission key | `purchase_orders.receive` (single key). |
| Expected actor source | `auth.uid()`. Drop `_by` (breaking). |
| Audit strategy | No local audit column; audit is produced by the inner `apply_inventory_tx` call. Stop forwarding `_by`; the inner function will read `auth.uid()` (propagates through nested SECURITY DEFINER since the JWT is unchanged). |
| Deviations from standard | Chained definer→definer call. Branch already derived server-side from the PO row (good). One caller: `PurchaseOrderDetail.tsx`. |

### 3.4 `apply_coupon_code`

| Field | Value |
|---|---|
| Estimated complexity | LOW |
| Expected permission key | `coupons.redeem` (single key). |
| Expected actor source | N/A — function is `STABLE`, read-only, no actor consumed. Step 2 collapses to "no derivation needed"; step 6 is skipped. |
| Audit strategy | None — no writes. The standard's audit step (6) does not apply; document the omission in the hotfix report. |
| Deviations from standard | Read-only function → steps 4/5/6 reduce to a single `SELECT ... RETURNING JSON`. Only lingering concern: definer bypasses future tenant-scoped RLS on `coupons`; add an explicit tenant filter inside the SELECT if/when coupons become tenant-scoped. One caller: `CreateInvoiceDialog.tsx`. |

---

## 4. Recommended implementation order

Weighted across security risk, business criticality, implementation
complexity, and regression risk:

| Order | Ticket | Function | Security risk | Business criticality | Complexity | Regression risk | Rationale |
|---|---|---|---|---|---|---|---|
| 1 | H3-3 | `add_treasury_tx` | HIGH (audit forgery, cross-branch cash movement) | HIGH (finance/regulator surface) | HIGH (breaking signature, 3 call sites) | MEDIUM | Highest live-fire risk; every day it ships later is another day the audit trail can be forged. |
| 2 | H3-4 | `apply_inventory_tx` | MEDIUM (audit forgery under admin gate) | HIGH (stock accuracy) | HIGH (breaking signature, 4 call sites + internal call) | MEDIUM | Ship immediately before H3-5 because H3-5 is a follower. |
| 3 | H3-5 | `receive_po_item` | MEDIUM (forwards `_by` into §3.2) | MEDIUM (PO receiving) | MEDIUM (1 call site, chain-coupled to H3-4) | LOW | Must ship in the same PR-window as H3-4 to keep the definer→definer chain honest. Order 2+3 = single deploy. |
| 4 | H3-6 | `apply_coupon_code` | LOW (read-only) | LOW (discount quoting) | LOW | LOW | Housekeeping. Drop-in `has_role` → `has_permission('coupons.redeem')` swap. |

Rationale for not reordering by pure complexity: `add_treasury_tx` has
the highest exploit value (financial audit forgery for any
`receptionist`). Deferring it behind the coupon hotfix — which is lower
complexity but near-zero risk — would extend the exposure window with
no offsetting benefit. The complexity is absorbed by bundling the
client-side signature change into the same PR.

---

## 5. Stop condition

Standard v1 published. Reusable-pattern opportunities documented
(`require_permission` helper + hotfix report template) but NOT
implemented. Remaining function inventory captured with per-function
permission keys, actor sources, audit strategy, and standard
deviations. Implementation order ratified.

Next actionable step: **H3-3 `add_treasury_tx`** implementation
following Standard v1 exactly.
