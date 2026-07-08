# BA-01A — Authorization Version Integrity Framework

**Status:** Documentation + verification only. No SQL, no code, no
migrations.
**Scope:** Independent review of the BA-01 Authorization Version
Registry to determine whether its current shape is sufficient to
prevent authorization-version drift across the platform, and to
specify the contracts (compatibility rules, drift detection, CI gates)
that will bind future waves to it.
**Frame of reference:** treat every artifact from the readiness review
(§B of `AUTHORIZATION_VERSIONING_READINESS_REVIEW.md`) as if it could
drift tomorrow.

---

## 1. Per-artifact review

| # | Artifact | Version owner | Version authority | Active resolver | Dependencies (upstream) | Compatibility rule | Upgrade path | Rollback dependency |
|---|---|---|---|---|---|---|---|---|
| 1 | Permission Catalog | Product / Security | `authz_versions.permission_catalog` | `authz_current_version('permission_catalog')` | none (root) | Bundles, Role Bindings, RPC Manifest must reference the active catalog semver. | Draft → activate; deprecate previous. | Bundles, Role Bindings, RPC Manifest, Golden Baseline. |
| 2 | Permission Bundles | Security | `authz_versions.bundle` | `authz_current_version('bundle')` | Permission Catalog | Bundle major = Catalog major. Bundle references only catalog keys that exist in the active catalog. | Draft → activate after Catalog draft/active. | Role Bindings, Golden Baseline. |
| 3 | Role Bindings | Security | `authz_versions.role_binding` | `authz_current_version('role_binding')` | Bundles, Permission Catalog | Role Binding major = Bundle major. May advance patch independently (grant tweaks). | Draft → activate. | Golden Baseline. |
| 4 | Effective Permissions (`v_authz_effective_permissions`) | Derived | `authz_versions.authz_catalog` (aggregate) | `authz_current_version('authz_catalog')` | Catalog + Bundles + Role Bindings | Aggregate semver = MAX(major) of the three; MIN across the three must be equal at activation time. | Bumped in the same migration that bumps any of its three inputs. | All three inputs. |
| 5 | RPC Manifest | Backend | `authz_versions.rpc_manifest` + `rpc_manifest.yaml` `version:` field | `authz_current_version('rpc_manifest')` | Permission Catalog | Every manifest entry's `permission` field MUST resolve in the active Catalog. Never references future Catalog. | Draft → activate; must not lead Catalog. | RPC drops require ledger entry; runtime rollback is forward-only per BA-01 §F. |
| 6 | RLS Inventory | Backend | `authz_versions.rls_inventory` | `authz_current_version('rls_inventory')` | Permission Catalog, Role Bindings | Every RLS policy expression MUST reference only permissions/roles from the active Catalog+Bindings. | New DB migration → bump `rls_inventory` in same tx. | Golden Baseline; frontend cache. |
| 7 | Golden Authorization Baseline | Harness | `authz_versions.golden_baseline` | `authz_current_version('golden_baseline')` | RLS Inventory, RPC Manifest | Baseline semver's minor = RLS Inventory minor; patch may differ (approved drift only). | Re-derive after any bump of RLS or RPC; label diff in `intentional_changes.txt`; bump. | None (derived, no downstream). |
| 8 | Governance Documents | Product / Security | git SHA + `docs/governance/**` | none (out-of-band) | none | Cited by Catalog / Bundles as `notes`. Not machine-checked. | PR merge. | none. |
| 9 | Regression Harness | Backend | git SHA + `scripts/authz/**` | none (out-of-band) | Golden Baseline (data), authz_versions (contract) | Harness must read `authz_current_versions()` at start and refuse to run if any artifact is missing an active row. | PR merge. | none. |

---

## 2. Integrity Matrix

| Artifact              | Authority                          | Depends On                    | Must Match                          | Can Advance Independently? | Requires Migration? | Requires Approval?        | Rollback Dependency                  |
|-----------------------|------------------------------------|-------------------------------|-------------------------------------|:--------------------------:|:-------------------:|---------------------------|--------------------------------------|
| Permission Catalog    | Product/Security                   | —                             | —                                   | **Yes** (root)             | Yes                 | Security sign-off         | Bundles, Bindings, Manifest, Baseline|
| Bundles               | Security                           | Catalog                       | Catalog major                       | Patch only                 | Yes                 | Security sign-off         | Bindings, Baseline                   |
| Role Bindings         | Security                           | Bundles, Catalog              | Bundle major                        | Patch only                 | Yes                 | Security sign-off         | Baseline                             |
| Effective (aggregate) | Derived                            | Catalog+Bundles+Bindings      | MAX(major) of inputs                | No                         | No (co-migrated)    | Inherited                 | All three inputs                     |
| RPC Manifest          | Backend                            | Catalog                       | Catalog major; ≤ Catalog semver     | Patch only                 | Yes (SECURITY DEF)  | Backend + Security        | Ledger entry                         |
| RLS Inventory         | Backend                            | Catalog, Bindings             | Catalog major; ≤ Bindings semver    | Patch only                 | **Yes**             | Backend + Security        | Baseline, frontend cache             |
| Golden Baseline       | Harness                            | RLS Inventory, RPC Manifest   | Minor = RLS minor                   | Patch only (approved diff) | No                  | Harness maintainer        | —                                    |
| Governance Docs       | Product/Security                   | —                             | Cited by others via `notes`         | Yes                        | No                  | Product/Security          | —                                    |
| Regression Harness    | Backend                            | Baseline (data), Registry     | Reads active registry               | Yes                        | No                  | Backend                   | —                                    |

Reading rule: an artifact whose "Must Match" cell references another
artifact **cannot activate** unless the matched artifact is already
active at the required semver, in the **same transaction** where
schema is involved.

---

## 3. Version Compatibility Rules

C-1. **Catalog is the root.** No artifact may reference a permission
key that is not present in the active Permission Catalog.

C-2. **Major-version lockstep for the authorization triad.** Catalog,
Bundles, and Role Bindings share the same major version. Bumping any
of their majors requires bumping the other two in the same wave.

C-3. **RPC Manifest never leads the Catalog.** Manifest `semver <=`
Catalog `semver`. A manifest entry referencing a permission not yet in
the active Catalog is a hard failure.

C-4. **RLS Inventory follows Catalog + Bindings.** An RLS migration
that references a permission or role absent from the active
Catalog/Bindings is rejected.

C-5. **Golden Baseline validates the active registry.** Baseline
minor = RLS Inventory minor; harness diff must run against the
Baseline whose `authz_versions` row is active. Cross-version diffs are
forbidden.

C-6. **Effective Permissions aggregate is derived, never authored.**
Its semver is computed in the migration; it must equal the MAX of the
triad's semvers at activation. Divergence is a bug in the migration.

C-7. **Additions are backwards-compatible; renames/removes are not.**
Additive changes bump minor. Renames or removals bump major and
require Wave-scale coordination.

C-8. **No mixed-version runtime loads.** All active rows in
`authz_versions` MUST be internally compatible at all times, because
they are the runtime contract.

C-9. **Governance citation is required.** Every non-baseline bump
records a governance doc reference in `notes` (append-only).

C-10. **Regression Harness anchors before analysis.** Harness reads
`authz_current_versions()` first; refuses to run if any of the seven
artifact rows is missing or in `draft`.

---

## 4. Drift Detection Rules

Each rule is a deterministic query against `authz_versions` +
existing metadata. Framed for a future `scripts/authz/check_integrity.py`.

| ID   | Rule (violation condition)                                                                                                    | Severity  |
|------|--------------------------------------------------------------------------------------------------------------------------------|-----------|
| D-1  | Any of the seven artifact_types has zero rows with `status='active'`.                                                          | **BLOCK** |
| D-2  | More than one row with `status='active'` per artifact_type (partial-unique index breach).                                      | **BLOCK** |
| D-3  | Bundle major ≠ Catalog major.                                                                                                  | **BLOCK** |
| D-4  | Role Binding major ≠ Bundle major.                                                                                             | **BLOCK** |
| D-5  | RPC Manifest semver > Catalog semver (manifest leads catalog).                                                                 | **BLOCK** |
| D-6  | RPC Manifest entry's `permission` is not present in the active Catalog.                                                        | **BLOCK** |
| D-7  | RLS policy expression references a permission or role absent from active Catalog/Bindings.                                     | **BLOCK** |
| D-8  | RLS migration landed but `rls_inventory` semver unchanged in the same migration file.                                          | **BLOCK** |
| D-9  | Aggregate `authz_catalog` semver ≠ MAX(major) across Catalog/Bundles/Bindings.                                                 | **BLOCK** |
| D-10 | Golden Baseline minor ≠ RLS Inventory minor.                                                                                   | **BLOCK** |
| D-11 | Harness diff produced changes not present in `intentional_changes.txt`, and `golden_baseline` semver unchanged.                | **BLOCK** |
| D-12 | Manifest YAML `version:` field does not match `authz_versions.rpc_manifest` active semver's major.                             | WARN      |
| D-13 | Any active row's `notes` does not cite a governance document reference (for bumps beyond 1.0.0).                               | WARN      |
| D-14 | Deprecated rows exist for an artifact_type but no `deprecated_at`.                                                             | WARN      |
| D-15 | Draft rows older than 30 days.                                                                                                 | WARN      |
| D-16 | `checksum` NULL on an active row for an artifact_type where checksum is required (rpc_manifest, golden_baseline).              | WARN → BLOCK from M4. |

BLOCK = non-zero exit; migration or CI cannot proceed.
WARN = advisory; logged, tracked, not blocking (until promoted).

---

## 5. CI Gate requirements

### 5.1 On every PR that touches `supabase/migrations/**`, `docs/PERMISSION_CATALOG.md`, `docs/governance/**`, `scripts/authz/rpc_manifest.yaml`, or `scripts/authz/**`:

1. Run `scripts/authz/check_rpc_manifest.py` (RPC-09). MUST pass.
2. Run `bash scripts/authz/run_all.sh` (regression harness). MUST pass with zero unlabeled diff.
3. Run the new **integrity checker** (BA-01B, not yet implemented):
   - Enforces D-1…D-11 as BLOCK.
   - Emits D-12…D-16 as WARN.

### 5.2 Build fails when:

- Any BLOCK-severity drift rule fires.
- `authz_versions` schema drift (missing artifact_type, extra active row, etc.).
- A migration adds/changes RLS on a policy-bearing table without bumping `rls_inventory` in the same file.
- A permission is renamed/removed without bumping Catalog major.
- The regression harness reports unlabeled cells.

### 5.3 Warnings generated when:

- Any WARN-severity rule fires.
- A draft version has aged.
- A checksum is missing on an artifact where a checksum is recommended.

### 5.4 Migrations blocked when:

- The CI gate above fails.
- The migration modifies authorization surface (RLS, SECURITY DEFINER,
  authz_* tables) without a matching `INSERT INTO authz_versions` in
  the same migration file (once BA-02 wires the writer).

### 5.5 Progressive strictness:

- **M1–M3 (now → pre-Wave-A):** D-1…D-4 BLOCK; the rest WARN.
- **From M4 (RPC conformance):** D-5, D-6, D-12 promoted to BLOCK; checksums required on rpc_manifest/golden_baseline.
- **From M5 (Wave B start):** D-7, D-8, D-10 promoted to BLOCK.
- **From M6 (cleanup):** all rules BLOCK; WARN category empty.

---

## 6. Sufficiency assessment

Does BA-01 alone prevent drift? **No — it makes drift detectable, not
impossible.** BA-01 provides:

- ✅ A single source of truth for each artifact's active version.
- ✅ Immutability of historical rows.
- ✅ Exactly-one-active enforcement per artifact.
- ✅ Canonical resolvers.

What it does not do:

- ❌ It does not automatically bump on migration.
- ❌ It does not validate cross-artifact compatibility.
- ❌ It does not stop a migration that adds an RLS policy referencing
  a permission not present in the active Catalog.
- ❌ It is not read by any CI job yet.

Those gaps are exactly what the Integrity Framework (this document)
specifies. Closing them is **BA-01B — Integrity Checker + CI wiring**,
a distinct backlog item that must land before Wave B ships to
production, but is **not** a prerequisite for BA-02.

---

## 7. Decision: can BA-02 proceed?

**Yes — BA-02 may proceed immediately.**

Reasoning:

1. BA-02 wires the client-side resolver (or checksum backfill,
   depending on backlog priority) against `authz_current_version()`.
   It does not introduce new authorization surface, so it cannot
   cause drift.
2. The Integrity Framework's BLOCK rules for the M1 window (D-1…D-4)
   are already enforced by the BA-01 partial unique index and CHECK
   constraints. No additional CI is required to protect BA-02.
3. Rules D-5…D-16 become blocking only from M4 onward (per §5.5).
   BA-01B can land in parallel with BA-02…BA-N without gating them.

**However**, three preconditions become blocking before Wave B:

- **P-1.** Implement `scripts/authz/check_integrity.py` covering
  D-1…D-11.
- **P-2.** Wire it into `scripts/authz/run_all.sh` and the CI gate.
- **P-3.** Introduce the writer path: every migration that touches
  authorization surface MUST insert a new `authz_versions` row in the
  same migration file (enforced by a lint rule or migration-file
  checker).

Filed as **BA-01B** in the backlog. Non-blocking for BA-02; blocking
for Wave B production.

---

## 8. Verdict

**INTEGRITY FRAMEWORK APPROVED. Version Integrity CI gate deferred
to BA-01B (parallel track). BA-02 may proceed.**

*End of framework. No implementation performed.*
