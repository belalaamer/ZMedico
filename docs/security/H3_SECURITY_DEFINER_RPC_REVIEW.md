# H-3 — SECURITY DEFINER RPC Review

**Status:** Documentation only. No SQL, no code, no function changes.
**Scope:** The six SECURITY DEFINER RPCs flagged in `N9_AUTHORIZATION_VERIFICATION_AUDIT.md` §4:
`apply_wallet_tx`, `add_treasury_tx`, `apply_inventory_tx`, `apply_coupon_code`,
`receive_po_item`, `merge_staff_position`.
**Method:** Live inspection of `pg_get_functiondef`, `pg_proc.proacl`, and
static call-site scan of `src/` and `supabase/functions/`.

---

## Shared context

| Item | Value |
|---|---|
| `search_path` on all 6 functions | `SET search_path TO 'public'` ✅ |
| `proacl` EXECUTE grants (all 6) | `postgres`, `service_role`, `authenticated`, `sandbox_exec` — **`anon` is NOT granted** ✅ |
| Any edge-function caller? | **None.** All callers are React → `supabase.rpc(...)` (client JWT) |
| Any trigger caller? | Only `receive_po_item` calls `apply_inventory_tx` internally (SECURITY DEFINER → SECURITY DEFINER) |

`sandbox_exec` is a Supabase-managed role; harmless. The relevant caller
class in production is `authenticated`.

---

## 1. `apply_wallet_tx(_patient_id, _tx_type, _amount, _reference_type, _reference_id, _notes_en, _notes_ar, _branch_id)`

1. **Purpose:** Post a wallet transaction (topup / spend / refund / referral_reward / adjustment_credit / adjustment_debit) for a patient. Locks `patient_wallets` row, appends to `patient_wallet_transactions`, updates cached balance.
2. **Callers:** React only — `src/pages/patients/PatientWalletTab.tsx:284`. No edge function, no trigger, no cron.
3. **EXECUTE grants:** `authenticated`, `service_role` (+ postgres, sandbox_exec).
4. **Trusts client-supplied identity?** **NO for actor** (writes `created_by = auth.uid()` — good), but **YES for scope**: `_patient_id`, `_branch_id`, `_reference_id` are all caller-supplied and unvalidated against caller's branch access.
5. **Can derive identity from `auth.uid()`?** **YES** — and it already does for `created_by`. It does **not** derive/verify `_branch_id` (must be validated against `user_has_branch_access`).
6. **Calls `has_permission()`?** **NO**
7. **Calls `has_role()`?** **YES** — `admin` (adjustments), or `admin|manager|receptionist` (other tx types).
8. **Relies entirely on RLS?** No — has an in-body role gate, but does **not** verify patient/branch scope; downstream RLS on `patient_wallet_transactions` still uses legacy `has_role`.
9. **Can `service_role` bypass?** service_role's `auth.uid()` is null → the role gate DENIES it. Net: service_role currently **cannot** call it — a separate bug for legitimate server-side use, but *not* a bypass.

**Threat analysis (authenticated caller with e.g. `receptionist` role):**
- Impersonate another user? **NO** — actor is forced from `auth.uid()`.
- Escalate privileges? **NO** for adjustments (admin gate). Other tx types allow receptionist by design.
- Write into another branch? **YES** — `_branch_id` is trusted; a Branch-A receptionist can post to Branch-B by passing that `_branch_id`.
- Forge audit logs? **NO** (created_by is server-set).
- Forge wallet actor? **NO.**
- Bypass ownership? **YES (patient scope)** — no check that caller has access to `_patient_id`'s branch/tenant. Any authenticated non-anon user with the right role can top up/spend on any patient in any branch.
- Financial impact: negative-balance guard exists, but `refund`/`spend` on a foreign patient can be forged, and `topup` can be posted without a real payment (this RPC does **not** verify a linked treasury/payment row via `_reference_id`).

---

## 2. `add_treasury_tx(_treasury_id, _type, _amount, _ref_type, _ref_id, _desc_en, _desc_ar, _by, _is_cash)`

1. **Purpose:** Post an income/expense line to a treasury, updating cached balance under a lock and a session GUC (`app.allow_treasury_balance_update`).
2. **Callers:** React — `src/pages/treasury/Treasury.tsx:90`, `src/pages/treasury/TransferDialog.tsx:47,53`.
3. **EXECUTE grants:** `authenticated`, `service_role`.
4. **Trusts client-supplied identity?** **YES** — `_by uuid` is the client-passed actor written to `treasury_transactions.created_by`. Also `_treasury_id` (branch scope), `_ref_id`.
5. **Can derive identity from `auth.uid()`?** **YES**. `_by` should be dropped and replaced by `auth.uid()`. No reason to accept it.
6. **`has_permission()`?** NO.
7. **`has_role()`?** YES — `admin` OR `receptionist`.
8. **Relies entirely on RLS?** No — in-body role gate + writes bypass RLS on `treasury_transactions` under the SECURITY DEFINER context.
9. **service_role bypass?** Same as §1 — service_role's `auth.uid()` is null so the role gate denies it. But any caller who did pass the role gate can also **set `app.allow_treasury_balance_update` GUC** transitively for the transaction; the pattern is defensible because the balance UPDATE happens inside the same body.

**Threat analysis (authenticated `receptionist`):**
- Impersonate another user? **YES — critical.** Passing `_by = <admin_user_id>` writes that UUID into `treasury_transactions.created_by`. The regulator-facing audit trail is forged.
- Escalate privileges? Not directly, but audit forgery obscures who moved cash.
- Write into another branch? **YES** — any `_treasury_id` accepted; no check against caller's branch access.
- Forge audit logs? **YES** (see impersonation).
- Forge treasury actor? **YES.**
- Bypass ownership? **YES** (branch scope not verified).
- Financial impact: Enables silent cross-branch cash movement attributed to another employee.

---

## 3. `apply_inventory_tx(_product_id, _branch_id, _type, _signed_qty, _unit_cost, _ref_type, _ref_id, _notes_en, _notes_ar, _expiry, _batch, _by)`

1. **Purpose:** Adjust inventory quantity for a product+branch, insert an `inventory_transactions` audit row, update `last_restocked_at`.
2. **Callers:** React — `StockOverview.tsx` (2), `CreateInvoiceDialog.tsx`, `InvoiceDetail.tsx`. Also **called from `receive_po_item`** (SECURITY DEFINER → SECURITY DEFINER chain).
3. **EXECUTE grants:** `authenticated`, `service_role`.
4. **Trusts client identity?** **YES** — `_by`, `_branch_id`, `_ref_id` all client-supplied.
5. **Derivable from `auth.uid()`?** `_by` — **YES, must be**. `_branch_id` — no, it's data, but it must be **validated** against `user_has_branch_access(auth.uid(), _branch_id)`.
6. **`has_permission()`?** NO.
7. **`has_role()`?** YES — `admin` only.
8. **Relies entirely on RLS?** No.
9. **service_role bypass?** service_role → `auth.uid()` null → denied. But `receive_po_item` chains into this and forwards its own `_by` — that recursive call trusts the outer caller's `_by`.

**Threat analysis (authenticated `admin`, since only admin passes the gate):**
- Impersonate another user? **YES** — `_by` is written verbatim to `inventory_transactions.created_by`.
- Escalate privileges? N/A (admin-only).
- Write into another branch? **YES** (any admin can, but by design admins have global scope). Still, `created_by` forgery obscures accountability.
- Forge inventory actor? **YES.**
- Bypass ownership? **YES (audit)** — same as above.
- Note: role check is stricter than needed for pharmacy staff; `inventory.write` should not be admin-only per catalog v2.1.

---

## 4. `apply_coupon_code(_code, _subtotal)`

1. **Purpose:** Look up a coupon by code, validate window/limits, return a JSON quote (`{ok, coupon_id, discount_amount, ...}`). Read-only — **no INSERT/UPDATE**.
2. **Callers:** React — `CreateInvoiceDialog.tsx:281`.
3. **EXECUTE grants:** `authenticated`, `service_role`.
4. **Trusts client identity?** **NO** — no actor parameter, no branch, no id.
5. **Derivable from `auth.uid()`?** N/A — function doesn't consume identity beyond the role gate.
6. **`has_permission()`?** NO.
7. **`has_role()`?** YES — `admin|manager|accountant|receptionist`.
8. **Relies entirely on RLS?** No — the function is `STABLE`, reads `coupons` under definer rights, bypassing `coupons` RLS.
9. **service_role bypass?** service_role's `auth.uid()` is null → gate denies. No write path to bypass anyway.

**Threat analysis:**
- Impersonate / escalate / branch write / audit forgery? **NO** for all — the function does not write and does not use identity.
- Bypass ownership? **Partial** — reveals coupon metadata (discount_type/value, max_discount_amount) to any of the four gated roles, bypassing any tenant/branch scoping on the `coupons` table. If coupons are tenant-scoped in `coupons` RLS, definer rights leak cross-tenant. Acceptable if coupons are global; **must confirm**.
- No `usage_count` increment happens here — actual redemption still writes through invoice flow and is guarded elsewhere.

---

## 5. `receive_po_item(_po_item_id, _qty, _expiry, _batch, _by)`

1. **Purpose:** Record receipt of a PO line: increments `quantity_received`, chains into `apply_inventory_tx`, recomputes PO status (`partial`/`received`).
2. **Callers:** React — `PurchaseOrderDetail.tsx:69`.
3. **EXECUTE grants:** `authenticated`, `service_role`.
4. **Trusts client identity?** **YES** — `_by` (forwarded into `apply_inventory_tx`). Also `_po_item_id` (implicitly determines branch via PO join, so at least that is not directly injectable).
5. **Derivable from `auth.uid()`?** `_by` — **YES, must be**.
6. **`has_permission()`?** NO.
7. **`has_role()`?** YES — `admin`.
8. **Relies entirely on RLS?** No.
9. **service_role bypass?** Denied by gate (auth.uid null).

**Threat analysis (authenticated `admin`):**
- Impersonate another user? **YES** — `_by` forgery propagates into `inventory_transactions.created_by`. PO update itself has no created_by field.
- Escalate / cross-branch write / bypass ownership? Same class as §3 — branch is derived server-side from the PO row (good), but audit actor is forgeable.
- Forge inventory actor? **YES** via `_by`.
- Correctness bug (not a security issue): status transition doesn't handle over-receipt (`total_rec > total_ord`) explicitly. Out of scope for H-3.

---

## 6. `merge_staff_position(source_id, target_id)`

1. **Purpose:** Reassign every `staff_profiles.position_id = source_id` to `target_id` and soft-delete the source `staff_positions` row.
2. **Callers:** React — `Positions.tsx:91`.
3. **EXECUTE grants:** `authenticated`, `service_role`.
4. **Trusts client identity?** No actor parameter — but the two `uuid` args ARE identity-of-record data (position ids). Not a caller-identity issue.
5. **Derivable from `auth.uid()`?** N/A.
6. **`has_permission()`?** **NO**.
7. **`has_role()`?** **NO**.
8. **Relies entirely on RLS?** **YES** — this function has **no authorization gate at all**. It relies on `staff_profiles.UPDATE` and `staff_positions.UPDATE` RLS to reject unauthorized callers. But because it runs SECURITY DEFINER, **RLS on those tables is bypassed** (definer is `postgres`, not the caller). Net: **there is currently NO effective authorization on this RPC.**
9. **service_role bypass?** N/A — no gate to bypass; anyone with EXECUTE (i.e. every authenticated user) can call it.

**Threat analysis (any authenticated user, including a lowest-privilege `staff`):**
- Impersonate another user? NO (no actor field).
- Escalate privileges? **YES — indirectly.** By repointing `position_id` of arbitrary staff profiles, an attacker can move employees into positions that grant different bonus/salary tiers or that other joins interpret as "manager". If any downstream logic derives permissions from position, this is a lateral privilege change.
- Write into another branch? Not directly.
- Forge audit logs? NO (function writes no audit).
- Bypass ownership? **YES — total bypass.** Any authenticated user can soft-delete any `staff_positions` row and re-parent every staff member on it.
- **This is the most severe finding in this batch: no gate combined with SECURITY DEFINER = anyone-can-mutate.**

---

## Recommended fixes (strategy — no SQL)

| # | Function | Strategy |
|---|---|---|
| 1 | `apply_wallet_tx` | (a) Add `has_permission(auth.uid(), 'patient_wallet.credit' \| '.debit' \| '.adjust')` gate at top (keys pending PD-05). (b) Validate `_patient_id` and `_branch_id` against `user_has_branch_access(auth.uid(), ...)`. (c) Already uses `auth.uid()` for `created_by` — keep. (d) Verify `_reference_id` corresponds to a real payment/refund row before treating `topup` as backed. |
| 2 | `add_treasury_tx` | (a) **Drop `_by` parameter**; hardcode `created_by = auth.uid()`. (b) Add `has_permission(auth.uid(), 'treasury.transfer' / '.income' / '.expense')` gate. (c) Validate `_treasury_id`'s branch against `user_has_branch_access`. (d) Keep the balance-lock pattern. |
| 3 | `apply_inventory_tx` | (a) **Drop `_by`**, use `auth.uid()`. (b) Replace admin-only gate with `has_permission(auth.uid(), 'inventory.write')`. (c) Validate `_branch_id` against caller branch access. (d) Update `receive_po_item` to stop forwarding `_by`. |
| 4 | `apply_coupon_code` | (a) Replace role gate with `has_permission(auth.uid(), 'coupons.redeem')`. (b) If coupons become tenant-scoped, add a tenant filter inside the SELECT since definer bypasses RLS. Otherwise low-priority hardening. |
| 5 | `receive_po_item` | (a) **Drop `_by`**, use `auth.uid()`. (b) Replace admin-only gate with `has_permission(auth.uid(), 'purchase_orders.receive')`. (c) Validate that `auth.uid()` has branch access to `po.branch_id`. |
| 6 | `merge_staff_position` | (a) **Add** `has_permission(auth.uid(), 'hr_positions.edit')` (or `authz.manage`) gate at top — currently NONE. (b) Consider adding an audit-log insert since the operation is destructive and bulk. (c) Ensure `staff_positions` UPDATE trigger for `deleted_at` continues to fire under definer context. |

Cross-cutting: introduce a small helper (e.g. `require_permission(text)`) that RAISES a consistent `Forbidden: missing <key>` exception, so every RPC uses the same pattern.

---

## Risk ranking

| Rank | Function | Justification |
|---|---|---|
| **CRITICAL** | `merge_staff_position` | No gate at all; SECURITY DEFINER bypasses RLS → any authenticated user can re-parent staff and soft-delete positions. |
| **HIGH** | `add_treasury_tx` | Client-supplied `_by` forges the financial audit trail; no branch-scope check → cross-branch cash movement possible; direct financial impact. |
| **HIGH** | `apply_wallet_tx` | Client-supplied `_patient_id`/`_branch_id` unverified → any receptionist can mutate any patient's wallet in any branch. Actor field is safe. |
| **MEDIUM** | `receive_po_item` | Actor forgery via `_by` propagates into inventory audit; role gate present; branch derived server-side. |
| **MEDIUM** | `apply_inventory_tx` | Actor forgery via `_by`; admin-only gate limits blast radius today but blocks catalog v2.1 delegation to pharmacy roles. |
| **LOW** | `apply_coupon_code` | Read-only, no actor, no write; only concern is definer bypassing future tenant-scoped RLS on `coupons`. |

---

## Hotfix Order

Ship in this sequence — each is an isolated migration, all reversible via `CREATE OR REPLACE FUNCTION ...` back to the current body:

1. **`merge_staff_position`** — CRITICAL, trivially exploitable, one-liner gate. Ship first.
2. **`add_treasury_tx`** — HIGH, financial audit forgery. Ship second (drop `_by`, add branch check, permission gate). Requires client update in `Treasury.tsx` + `TransferDialog.tsx` to stop sending `_by`.
3. **`apply_wallet_tx`** — HIGH, cross-branch/cross-patient mutation. Ship third; permission keys depend on PD-05 resolution (`patient_wallet.credit/.debit/.adjust`). If PD-05 unresolved at hotfix time, keep the interim `has_role` set already in place AND add the `user_has_branch_access` scope check (scope fix is not permission-key dependent).
4. **`apply_inventory_tx`** — MEDIUM. Drop `_by`, gate on `inventory.write`. Requires updating 4 React call sites and internal call from `receive_po_item`.
5. **`receive_po_item`** — MEDIUM. Drop `_by`, gate on `purchase_orders.receive`. Ship together with #4 to keep the internal chain consistent.
6. **`apply_coupon_code`** — LOW. Swap `has_role` → `has_permission('coupons.redeem')`. Can be deferred to routine Wave 3E cadence unless coupons become tenant-scoped.

---

## Stop condition

Review complete. No SQL, no code, no function changes performed.
Next actionable step: **Board ratifies Hotfix Order above**, then Engineering issues six independent migrations in the listed sequence.
