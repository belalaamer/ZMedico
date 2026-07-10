# Release Milestone — Authorization Freeze, Before Settings Cutover

**Status:** Current stable baseline
**Mode:** Authorization Freeze (WIP = 1, active slice = Settings)
**Type:** Documentation only — no code, SQL, migrations, or permission changes.

This milestone pins the last known-good authorization state of the system
immediately before the Settings vertical slice cutover. If cutover is
aborted or rolled back, the system returns to exactly this baseline.

---

## 1 · Baseline Coordinates

| Item | Value | Reference |
| --- | --- | --- |
| Authorization catalog version | **v2 (frozen)** | `docs/PERMISSION_CATALOG.md`, `docs/normalization/N1_PERMISSION_TAXONOMY_V2.md` |
| Bundle graph version | **v1 (frozen)** | `docs/normalization/N5_AUTHORIZATION_DEPENDENCY_GRAPH.md`, `docs/normalization/N2_BUNDLE_INTEGRITY_REPORT.md` |
| RPC manifest version | **v1 (frozen)** | `scripts/authz/rpc_manifest.yaml` |
| Authorization state model | **BA-02** | `docs/execution/BA02/BA02_AUTHORIZATION_STATE_MODEL.md` |
| Authorization version registry | **BA-01** | `docs/execution/BA01/BA01_AUTHORIZATION_VERSION_REGISTRY.md` |

---

## 2 · Runtime Migration Status

| Wave | Scope | Status |
| --- | --- | --- |
| R1 | Runtime consumer migration strategy | ✅ Complete — `docs/execution/runtime/R1/R1_ARCHITECTURE.md` |
| R2 | Consumer migration executed | ✅ Complete — `docs/execution/runtime/R2/R2_MIGRATION_REPORT.md` |
| R3 | RPC authorization inventory + guards | ✅ Complete — `docs/execution/runtime/R3/R3_RPC_AUTHORIZATION_INVENTORY.md` |
| R3.5 | Authorization guardrails | ✅ Complete — `docs/execution/runtime/R3_5/AUTHORIZATION_GUARDRAILS_REPORT.md` |
| R4 | SECURITY DEFINER inventory + certification | ✅ Complete — `docs/execution/runtime/R4/R4_SECURITY_DEFINER_INVENTORY.md` |
| R4.5 | Runtime readiness certification | ✅ Complete — `docs/execution/runtime/R4_5/RUNTIME_READINESS_CERTIFICATION.md` |

Runtime layer (R1–R4) is fully migrated and certified. No pending runtime work at this baseline.

---

## 3 · Settings Slice Status

| Field | Value |
| --- | --- |
| Slice | `settings` |
| Phase | **Shadow complete — awaiting QA credentials for cutover** |
| Registry entry | `src/lib/authz/slices/completedSlices.ts` (status: `shadow`) |
| Shadow probe | `src/lib/authz/settingsShadowProbe.ts` |
| Shadow non-influence proof | `src/lib/authz/settingsShadowProbe.noninfluence.test.ts` |
| Slice parity test | `src/lib/authz/settings.slice.parity.test.ts` |
| Playwright shadow suite | `tests/playwright/settings.shadow.spec.ts`, `settings.shadow.validate.spec.ts` |
| QA runbook | `tests/playwright/SETTINGS_SHADOW_QA.md` |
| Cutover gate | `v_authz_shadow_exit_criteria.ready_for_cutover` must be `true` |
| Blocker | Real QA traffic / credentials not yet provided |

Cutover flips `COMPLETED_SLICES[settings].status` from `"shadow"` to `"complete"` in the same PR as Migration 2, activating the completed-slice invariant test permanently.

---

## 4 · Golden Authorization Baseline

| Field | Value |
| --- | --- |
| Document | `docs/GOLDEN_AUTHORIZATION_BASELINE.md` |
| Artifact | `golden_authorization_baseline.csv` |
| Total RLS decision cells | **3,392** (106 tables × 4 ops × 8 roles) |
| RPC decision cells | **360** (45 RPCs × 8 roles) |
| Total pinned decisions | **3,752** |
| Policy source rows | 385 across 106 RLS-enabled public tables |
| Analyzer | `scripts/authz/analyze_rls.py`, `scripts/authz/analyze_rpcs.py` |
| Regression harness | `scripts/authz/run_all.sh` (diffs live snapshot vs. CSV) |
| Intentional-change ledger | `scripts/authz/intentional_changes.txt` |
| Expected diff at this baseline | **∅ (empty)** |

Any deviation from the CSV without a corresponding `intentional_changes.txt` entry blocks the batch.

---

## 5 · Rollback Artifacts (current)

| Scope | Rollback |
| --- | --- |
| BA-01 authorization version registry | `docs/execution/BA01/BA01_ROLLBACK.sql` |
| BA-02 authorization state model | `docs/execution/BA02/BA02_ROLLBACK.sql` |
| H3-1 merge_staff_position hotfix | `docs/security/H3_1_MERGE_STAFF_POSITION_ROLLBACK.sql` |
| H3-2 apply_wallet_tx hotfix | `docs/security/H3_2_APPLY_WALLET_TX_ROLLBACK.sql` |
| Wave 3 pilot RLS migration | `docs/wave3/PILOT_RLS_ROLLBACK.sql` |
| Wave 3a settings.create pilot | `docs/wave3a/PILOT_ROLLBACK_settings_create.sql` |
| Wave 3a settings.edit pilot | `docs/wave3a/PILOT_ROLLBACK_settings_edit.sql` |
| Wave 3a settings.delete pilot | `docs/wave3a/PILOT_ROLLBACK_settings_delete.sql` |
| Wave 3a settings.export pilot | `docs/wave3a/PILOT_ROLLBACK_settings_export.sql` |
| Wave 3e Batch A normalization | `docs/wave3e/WAVE3E_BATCH_A_ROLLBACK.sql` |
| R1 runtime | `docs/execution/runtime/R1/R1_ROLLBACK.md` |
| R2 runtime | `docs/execution/runtime/R2/R2_ROLLBACK.md` |
| R3 runtime | `docs/execution/runtime/R3/R3_ROLLBACK.sql` |
| R3.5 runtime | `docs/execution/runtime/R3_5/R3_5_ROLLBACK.md` |
| R4 runtime | `docs/execution/runtime/R4/R4_ROLLBACK.md` |

All rollback scripts listed above were validated against this baseline and restore the system to the state described in §1–§4.

---

## 6 · Freeze Contract

While this milestone is the current baseline, Freeze Mode rules apply:

- WIP limit = 1; active slice = Settings.
- No new slice may begin until Settings reaches COMPLETE.
- Permitted work: Settings QA defects, shadow reliability, regression suite, rollback/ops, verified production issues, and non-behavioral maintenance.
- Golden Baseline expected diff remains ∅.

This milestone remains the stable baseline until — and only until — the Settings cutover satisfies its full Definition of Done and a new milestone supersedes it.
