# Canonical Authorization — Activation Plan

**Status:** Approved for production default (see
`docs/auth/PHASE_B_FINAL_VALIDATION.md`).
**Scope:** Operational lifecycle from staging enablement through
legacy retirement approval. No runtime code, schema, RLS, or
business-logic changes are introduced by this plan.

---

## Guiding principles

- Legacy authorization remains the fallback until Stage 5.
- Every stage is reversible with a single feature-flag flip
  (`localStorage["authz_canonical"] = "false"` or unset
  `VITE_AUTHZ_CANONICAL`).
- No stage advances until the previous stage's exit criteria are
  satisfied and signed off.

---

## Stage 1 — Enable Canonical in Staging

**Action:** Set `VITE_AUTHZ_CANONICAL=true` in the staging build.

**Duration:** ≥ 3 business days.

**Entry criteria**
- Phase B.1 parity: 100% for all 8 roles.
- Shadow probes green.
- Canonical view `v_authz_effective_permissions` reachable from the
  staging build.

**Exit criteria**
- Zero drift in shadow telemetry.
- Zero authorization runtime errors in staging.
- All Playwright authorization suites green under canonical mode.
- Manual smoke: admin, manager, doctor, nurse, receptionist,
  accountant, hr, staff — each verifies at least one gated route
  and one gated action.

**Rollback:** unset `VITE_AUTHZ_CANONICAL` and redeploy staging.

---

## Stage 2 — Monitor for One Release Cycle

**Action:** Keep canonical enabled in staging while at least one
full release cycle (features + hotfixes) exercises the stack.

**Duration:** One release cycle (typically 7–14 days).

**Exit criteria**
- Zero drift for the entire window.
- No canonical-specific incidents in the ops log.
- No RLS or Edge Function authorization regressions correlated with
  the canonical path.
- KPI dashboard (see `AUTHORIZATION_KPIS.md`) within targets.

**Rollback:** flag flip; no schema change required.

---

## Stage 3 — Enable in Production

**Action:** Set `VITE_AUTHZ_CANONICAL=true` in the production build
and deploy.

**Entry criteria**
- Stage 2 exit criteria met.
- `docs/auth/PHASE_C_READINESS.md` marks READY.
- On-call and rollback playbook (`ROLLBACK_PLAYBOOK.md`) rehearsed
  in the last 30 days.
- Manual production database snapshot recorded pre-cutover.

**Cutover checklist**
- Announce window in ops channel.
- Deploy with flag on.
- Execute smoke: admin bypass, one gated route per role, one export
  gate, one RLS-protected mutation.
- Watch KPI dashboard for 60 minutes; hold on-call for 24 hours.

**Rollback trigger:** any KPI red for > 5 minutes, or any privilege
drift observation. Flip flag off; incident postmortem required.

---

## Stage 4 — Keep Legacy Available for Rollback

**Action:** Retain `DEFAULT_PERMISSIONS`, `role_permissions`,
`loadLegacy()`, and the transparent fallback in `usePermissions`.

**Duration:** Minimum 30 consecutive days of clean production
operation (see `LEGACY_RETIREMENT_CRITERIA.md`).

**Exit criteria**
- All legacy retirement criteria satisfied.
- Written sign-off from engineering + operations owners.

**Rollback:** flag flip; behavior returns to legacy on next page
load. No deploy required.

---

## Stage 5 — Approve Legacy Retirement

**Action:** Open Phase C as a separate initiative to remove legacy
code paths.

This document does not authorize the removal itself. Phase C must
carry its own charter, tests, and rollback plan.
