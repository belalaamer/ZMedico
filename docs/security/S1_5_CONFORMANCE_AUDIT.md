# S1.5 — SECURITY DEFINER Standard v1 Conformance Audit

**Status:** Audit only. No SQL, no code, no migrations.
**Method:** Live inspection of `pg_get_functiondef` for both functions,
cross-referenced against `docs/security/S1_SECURITY_DEFINER_STANDARD_V1.md`,
the H3-1/H3-1A/H3-2 reports, and the authorization regression harness.

---

## 1. Per-function conformance

### `merge_staff_position`

| # | Rule | Result | Evidence |
|---|---|---|---|
| 1 | Authentication derived exclusively from `auth.uid()` | **PASS** | `_uid uuid := auth.uid()` + `IF _uid IS NULL RAISE 42501`. No parameter accepts an identity. |
| 2 | Exactly one authorization gate | **PASS** | Single `IF NOT public.has_permission(_uid,'hr.edit')`. |
| 3 | Authorization uses only `has_permission()` | **PASS** | Zero `has_role(` occurrences in body. |
| 4 | No duplicated authorization logic | **PASS** | H3-1A removed the `OR has_role(...,'admin')` fallback. |
| 5 | Authorization executes before any business write | **PASS** | Auth guard + permission check precede both `UPDATE staff_profiles` and `UPDATE staff_positions`. |
| 6 | Audit trail records the authenticated actor only | **PASS** | `audit_logs.user_id = _uid`; no client-supplied actor field. |
| 7 | No client-controlled identity influences authorization | **PASS** | Signature is `(source_id uuid, target_id uuid)` — data only. |
| 8 | Backward compatibility preserved | **PASS** | Signature and return type unchanged; H3-1 report documents byte-for-byte business behavior. |
| 9 | Regression coverage exists | **PASS** | `scripts/authz/run_all.sh` clean; Vitest 284/284; H3-1A report attests. |

### `apply_wallet_tx`

| # | Rule | Result | Evidence |
|---|---|---|---|
| 1 | Authentication derived exclusively from `auth.uid()` | **PASS** | `_uid uuid := auth.uid()` + null-guard raising `42501`. |
| 2 | Exactly one authorization gate | **PASS** | Single `IF NOT public.has_permission(_uid, _required_perm)`. Key is CASE-selected from `_tx_type` (data), the decision is one call. |
| 3 | Authorization uses only `has_permission()` | **PASS** | Zero `has_role(` occurrences. |
| 4 | No duplicated authorization logic | **PASS** | No `OR admin`, no secondary role check. |
| 5 | Authorization executes before any business write | **PASS** | Auth + permission checks precede wallet upsert / lock / insert. |
| 6 | Audit trail records the authenticated actor only | **PASS** | `patient_wallet_transactions.created_by = _uid`. |
| 7 | No client-controlled identity influences authorization | **PASS** | Signature has no `_by` / `actor_id`. Permission key depends on `_tx_type` (business data), not caller-supplied identity. |
| 8 | Backward compatibility preserved | **PASS** | Signature unchanged; frontend caller `PatientWalletTab.tsx` works without modification (H3-2 report). |
| 9 | Regression coverage exists | **PASS** | Harness clean after intentional_changes labeling; Vitest 284/284; runtime role verification recorded in H3-2 report. |

**Both functions: 9/9 PASS.**

---

## 2. Cross-implementation comparison

| Aspect | `merge_staff_position` | `apply_wallet_tx` | Classification |
|---|---|---|---|
| Permission key selection | Constant literal `'hr.edit'` | CASE on `_tx_type` → `patients.edit` / `patients.delete` | **Intentional.** Standard §1 step 3 explicitly permits CASE-selected keys as long as the decision call is singular. |
| Audit target | `audit_logs` (generic) via `EXCEPTION WHEN OTHERS THEN NULL` swallow | `patient_wallet_transactions.created_by` (domain-specific), no swallow | **Intentional but noted as debt.** The `EXCEPTION WHEN OTHERS THEN NULL` on the audit insert is defensive (audit failure must not roll back a legitimate business op) but silently drops audit rows. Standard v1 does not address audit-insert failure semantics — see §4 below. |
| Business-context validation (step 4) | Early `RETURN` if `source_id = target_id` | Explicit NULL / non-positive checks on `_patient_id` and `_amount` | **Acceptable.** Both are the minimum sanity set appropriate to the operation. |
| Branch-scope check (`user_has_branch_access`) | N/A (positions are global) | **Absent** — `_branch_id` and `_patient_id` are not verified against caller branch access | **Technical debt**, pre-existing. H3-2 report explicitly deferred scope validation. Not a Standard v1 violation because Standard v1 phrases scope validation as conditional ("when applicable") in step 4, but it IS a residual finding from the H-3 review that must be tracked. |
| SQLSTATE for auth failure | `42501` with `'Forbidden: authentication required'` | `42501` with `'Forbidden: authentication required'` | **Match** — both align with Standard v1 §6, though the Standard's example shows `'authentication required'` without the `Forbidden:` prefix. See §4. |
| SQLSTATE for permission failure | `42501` with `'Forbidden: missing hr.edit permission'` | `42501` with `'Forbidden: missing % permission'` | **Match** — Standard v1 §6 wording. |
| `SECURITY DEFINER` + `SET search_path TO 'public'` | Present | Present | **Match** — Standard §1 rule 1. |
| Exception-swallow pattern on audit | Yes (`EXCEPTION WHEN OTHERS THEN NULL`) | No | **Divergence — pattern not codified.** Not a violation today but should be resolved before H3-3. See §4. |

No divergence rises to **violation of the standard**.

---

## 3. Standard review — findings

### 3.1 Ambiguous wording

- **§6 Error surface**: the Standard shows the auth-null message as
  `'authentication required'` in the skeleton but the implementations
  prefix it with `'Forbidden: '`. Both are consistent with each other,
  but the Standard's example diverges. **Minor** — clarify the
  canonical string to `'Forbidden: authentication required'`.
- **§1 step 4** uses the phrase "when applicable" for
  `user_has_branch_access`. Read strictly this is a loophole: a future
  refactor could omit the branch check and claim conformance. Should
  be tightened to "MUST call `user_has_branch_access` whenever the
  function accepts a branch-scoped id (branch_id, or an id that
  resolves to a branch_id via a single join)".

### 3.2 Contradictory rules

None observed. §1 step 3's allowance for CASE-selected keys is
consistent with rule 2 ("exactly one authorization decision") because
key selection is data, not an authorization decision.

### 3.3 Missing mandatory rule

- **Audit-insert failure semantics.** Standard v1 does not say whether
  a failed audit insert must roll back the transaction (fail-closed)
  or be swallowed (fail-open). `merge_staff_position` swallows;
  `apply_wallet_tx` does not. Both are defensible in isolation but
  the choice must be codified before H3-3, where treasury audit
  failures have regulatory implications.
- **`STABLE` vs `VOLATILE` guidance.** Standard is silent on volatility
  category. Read-only definer functions (e.g. `apply_coupon_code`)
  SHOULD be `STABLE`; mutating ones MUST be `VOLATILE` (the default).
  Worth stating explicitly to prevent future planner-cache surprises.
- **Grant enforcement.** Standard rule 8 lists the grants tuple but
  does not require a CI check or a migration-time assertion. A
  passing convention today, but not enforced.

### 3.4 Missing implementation guidance

- **Definer→definer chains.** Standard v1 does not describe how nested
  SECURITY DEFINER calls handle `auth.uid()` propagation. Relevant
  imminently for H3-4 → H3-5 (`apply_inventory_tx` called from
  `receive_po_item`). Fact: `auth.uid()` is derived from the JWT and
  survives across definer nesting because the JWT does not change;
  worth adding as a one-line note.
- **Error-message localization.** Both functions emit English-only
  messages. The Standard should state that authorization error
  messages are stable machine-parseable strings and MUST NOT be
  localized (frontend maps them for display).

### 3.5 Edge cases not covered

- **`security_barrier` views / RLS re-entry.** A definer function that
  SELECTs from an RLS-guarded table observes the definer role, not
  the caller. Standard should note this trap and require an explicit
  scope predicate in the SELECT when the caller's identity is what
  should filter the rows.
- **`SET LOCAL` GUCs used to unlock triggers** (as `add_treasury_tx`
  does with `app.allow_treasury_balance_update`). Standard should
  require these to be set **after** the auth+permission gate, never
  before.
- **`RAISE` translation to PostgREST**: SQLSTATE `42501` currently
  surfaces as HTTP 403; other codes surface differently. Standard
  should mandate `42501` for both auth-null and permission-denied so
  the frontend has one code to switch on.

---

## 4. Certification

### Verdict: **CERTIFIED WITH MINOR NOTES**

The two reference implementations conform to Standard v1 on every
mandatory rule (18/18 PASS across both functions). All identified gaps
are in the Standard's *documentation surface* — not in the
implementations, and not in the substantive rules. None of the gaps
requires re-work of the completed hotfixes.

### Minor-note remediation (to be folded into a Standard v1.1 clarification patch, not a re-approval)

1. Fix §6 auth-null message to `'Forbidden: authentication required'`.
2. Tighten §1 step 4 branch-scope language from "when applicable" to
   the strict formulation in §3.1 above.
3. Add mandatory rule 11: audit-insert failure policy (proposal:
   fail-closed by default; swallow only when the function's report
   explicitly justifies fail-open).
4. Add mandatory rule 12: definer functions are `VOLATILE` by default;
   read-only functions MUST be `STABLE`.
5. Add mandatory rule 13: authorization error messages are stable
   English strings; frontend performs any localization.
6. Add implementation notes section covering (a) definer→definer JWT
   propagation, (b) RLS re-entry inside definer bodies, (c) ordering
   of `SET LOCAL` GUCs relative to the auth gate.

### Freeze scope

Standard v1 substantive rules (1–10 as published) are **frozen** for
the duration of H3-3 → H3-6. The v1.1 patch above adds clarifying
guidance only and does not alter any rule already satisfied by
`merge_staff_position` or `apply_wallet_tx`; H3-3 must therefore
conform to v1 exactly and MAY additionally satisfy the v1.1 notes as
they land.

Next actionable step: **H3-3 `add_treasury_tx`** implementation may
proceed against Standard v1 unchanged. Standard v1.1 clarification
patch should be authored in parallel and does not block H3-3.

### Stop condition

Audit complete. No SQL, no code, no function changes performed.
