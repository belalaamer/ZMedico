# Shadow Framework Retirement Plan

Goal: catalog every remaining "shadow" artifact — the parallel-run
authorization safety net built during the V8 cutover — and decide
whether to **Keep**, **Remove**, or **Archive** each. **Nothing is
deleted in Sprint 4.**

## Inventory

### Runtime code

| Artifact | Purpose | Recommendation |
|----------|---------|----------------|
| `src/lib/authz/createShadowProbe.ts` | Factory for slice probes (Sprint 2 refactor). | **Keep** — required by every slice probe. |
| `src/lib/authz/patientsShadowProbe.ts` | Patients slice probe. | **Keep** through Phase A of Permission Consolidation. |
| `src/lib/authz/medicalRecordsShadowProbe.ts` | Medical Records slice probe. | **Keep** through Phase A. |
| `src/lib/authz/invoicesShadowProbe.ts` | Invoices slice probe. | **Keep** through Phase A. |
| `src/lib/authz/hrShadowProbe.ts` | HR slice probe. | **Keep** through Phase A. |
| `src/lib/authz/settingsShadowProbe.ts` | Settings slice probe. | **Keep** through Phase A. |
| `src/lib/authz/telemetry.ts` | Drift telemetry sink. | **Keep** permanently — reused by future authz work. |

### DB objects

| Object | Recommendation |
|--------|----------------|
| `authz_shadow_decisions` | **Keep** until Consolidation Phase B lands; archive to cold storage afterwards. |
| `authz_shadow_expected_expansions` | **Keep** — feeds probe expectation baseline. |
| `authz_shadow_slice_gate` | **Keep** — gates per-slice probe activation. |

### Tests

| Artifact | Recommendation |
|----------|----------------|
| `src/lib/authz/*Shadow*.test.ts` | **Keep** — unit-level non-influence guarantees. |
| `tests/playwright/*.shadow.spec.ts` | **Keep** — full-role E2E parity. |
| `tests/playwright/*.shadow.validate.spec.ts` | **Keep**. |

### CI

| Artifact | Recommendation |
|----------|----------------|
| `.github/workflows/shadow-qa.yml` | **Keep** — matrix-based, low overhead (Sprint 2 consolidation). |

### Documentation

| Artifact | Recommendation |
|----------|----------------|
| `docs/wave3*/`, `docs/normalization/`, `docs/execution/BA*` | **Archive** into `docs/archive/wave3/` once Consolidation Phase D completes. Historical value only. |
| `docs/AUTHORIZATION_*` and `docs/architecture/AUTHORIZATION_ARCHITECTURE.md` | **Keep** — current reference. |

## Retirement gates

1. Shadow probes may be removed **only after** the Permission
   Consolidation Phase D exit criteria are met (see that plan).
2. Shadow DB tables may be archived **only after** all probes are
   removed and 30 days of no-drift telemetry.
3. Historical docs may be archived at any time after Phase D, subject
   to a stakeholder review.

## Explicit non-actions in Sprint 4

- No probe deleted.
- No shadow table dropped.
- No CI workflow removed (Sprint 2's consolidation is the final
  workflow change for now).
- No historical documentation deleted or moved.

## Risk

Zero for this sprint (plan only). Removing production safeguards
without meeting the gates above is explicitly forbidden.
