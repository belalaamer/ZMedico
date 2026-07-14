# Shadow Framework Final Assessment — Sprint 5

Builds on docs/sprint4/SHADOW_RETIREMENT_PLAN.md. No item is removed.

## Classification

| Component | Type | Classification |
|-----------|------|----------------|
| src/lib/authz/createShadowProbe.ts | Runtime | Keep permanently (factory reused by future authz work) |
| src/lib/authz/patientsShadowProbe.ts | Runtime | Remove after next release (post 30-day zero-drift) |
| src/lib/authz/medicalRecordsShadowProbe.ts | Runtime | Remove after next release |
| src/lib/authz/invoicesShadowProbe.ts | Runtime | Remove after next release |
| src/lib/authz/hrShadowProbe.ts | Runtime | Remove after next release |
| src/lib/authz/settingsShadowProbe.ts | Runtime | Remove after next release |
| src/lib/authz/telemetry.ts | Runtime | Keep permanently (generic sink) |
| authz_shadow_decisions (DB) | Data | Archive after probes removed + 30d |
| authz_shadow_expected_expansions | Data | Archive with above |
| authz_shadow_slice_gate | Data | Archive with above |
| src/lib/authz/*Shadow*.test.ts | Test | Remove with corresponding probe |
| tests/playwright/*.shadow.spec.ts | Test | Keep (parity regression net) until probes retired |
| tests/playwright/*.shadow.validate.spec.ts | Test | Keep with above |
| .github/workflows/shadow-qa.yml | CI | Keep until probes retired, then delete |
| docs/wave3*/, docs/normalization/, docs/execution/BA* | Docs | Archive (see DOCS_CONSOLIDATION_PLAN) |
| docs/AUTHORIZATION_* + architecture/AUTHORIZATION_ARCHITECTURE.md | Docs | Keep permanently |

## Retirement Gates (unchanged from Sprint 4)

1. Permission Consolidation Phase D exit criteria met.
2. 30 days of zero drift telemetry across all 5 slices in production.
3. Governance owner sign-off.

## Sprint 5 non-actions

No probe deleted. No shadow table dropped. No CI removed. No doc archived.
