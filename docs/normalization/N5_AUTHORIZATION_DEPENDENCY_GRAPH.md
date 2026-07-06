# N5 — Authorization Dependency Graph & Migration Readiness Score

**Status:** Documentation only.

## 1. End-to-End Layer Map

```
┌───────────────────────────────────────────────────────────┐
│  L0  Business Operation                                   │
│      (UI page / user action / clinical workflow step)     │
└───────────────────────────────────────────────────────────┘
                          │  is gated by
                          ▼
┌───────────────────────────────────────────────────────────┐
│  L1  Permission Key   (authz_permissions)                 │
│      shape: <group>.<verb>[.<qualifier>]                  │
└───────────────────────────────────────────────────────────┘
                          │  packaged into
                          ▼
┌───────────────────────────────────────────────────────────┐
│  L2  Bundle           (authz_bundles                      │
│                        + authz_bundle_permissions         │
│                        + authz_bundle_implies)            │
└───────────────────────────────────────────────────────────┘
                          │  assigned to
                          ▼
┌───────────────────────────────────────────────────────────┐
│  L3  Role             (app_role enum + user_roles         │
│                        + authz_role_bundles)              │
└───────────────────────────────────────────────────────────┘
                          │  consumed by
                          ▼
┌───────────────────────────────────────────────────────────┐
│  L4  AuthorizationService (frontend, hasPermission hook)  │
│      + edge-function guard (backend)                      │
└───────────────────────────────────────────────────────────┘
                          │  and by
                          ▼
┌───────────────────────────────────────────────────────────┐
│  L5  has_permission() SECURITY DEFINER helper             │
│      (single source of truth for row-level checks)        │
└───────────────────────────────────────────────────────────┘
                          │  called from
                          ▼
┌───────────────────────────────────────────────────────────┐
│  L6  RLS Policies     (pg_policies USING/WITH CHECK)      │
│      Patterns P1–P12 from Wave 3D catalog                 │
└───────────────────────────────────────────────────────────┘
                          │  authoritative for
                          ▼
┌───────────────────────────────────────────────────────────┐
│  L7  Database rows    (public.* tables)                   │
└───────────────────────────────────────────────────────────┘

Cross-cutting invariants
  I-1 Every L0 operation MUST reference exactly one L1 key.
  I-2 Every L1 key MUST be reachable from at least one L3 role via L2.
  I-3 Every L4 / L6 site MUST call L5 (never has_role directly, post-migration).
  I-4 L5 MUST be the only helper that resolves permissions to decisions.
  I-5 L6 policies MUST NOT hardcode enum values (roles) once migrated.
```

## 2. Dependency Direction

- Downward (build-time): `L0 → L1 → L2 → L3` is a design contract established during normalization (N1–N2).
- Upward (runtime): `L7 ← L6 ← L5 ← L4 ← L3 ← L2 ← L1` — each request is authorized by walking from user to policy.

## 3. Current Gaps by Layer

| Layer | Gap | Blocking wave |
|---|---|---|
| L0 → L1 | 30 business ops without a permission key | 3E.B/C, 3F, 3G, 3H |
| L1 | 84 keys not yet inserted | Every remaining wave |
| L2 | Nurse bundle unbound; 84 new keys not attached to any bundle | 3E.B onwards |
| L3 | No `compliance` role; `audit.read` cannot be granted natively | 3F.2 |
| L4 | Frontend still uses ad-hoc role checks in some legacy screens | Follow-up |
| L5 | `has_permission()` complete and cached (from Wave 3 pilot) | – |
| L6 | 510 `has_role()` sites, 66 `has_permission()` sites | Waves 3E.B–3H |
| L7 | RESTRICTIVE branch isolation intact | – |

## 4. Migration Readiness Score

Weighted 0–100. Higher = safer to proceed with next RLS wave.

| Dimension | Weight | Current | Target | Score |
|---|---|---|---|---|
| Catalog completeness (L1 keys exist for every planned wave) | 25 | 67/151 = 44 % | 100 % | 11 |
| Bundle bindings valid (L2, no orphans) | 15 | 7/8 bundles bound = 88 % | 100 % | 13 |
| Bundle intent matches RLS behavior (§N2.3) | 15 | 5/9 mismatches unresolved | 0 mismatches | 7 |
| RLS uses `has_permission` where applicable | 20 | 66/(66+510) = 11 % | ≥ 80 % | 3 |
| Frontend uses `hasPermission` (no role literals) | 10 | ≈ 70 % of gated screens | 100 % | 7 |
| Dependency-graph invariants (I-1..I-5) enforced by CI | 10 | 0 checks in CI | ≥ 3 checks | 0 |
| Golden Baseline drift | 5 | 0 | 0 | 5 |
| **Total** | **100** | | | **46 / 100** |

**Interpretation: NOT READY to resume Wave 3F.** Minimum recommended score before resuming: **75**.

## 5. Path to 75+

Execute in order (each step is its own reviewable sub-wave; all safely additive except step 3):

1. **N1-INSERT** — Insert the 84 NEW permissions from N1. Additive; +25 pts (catalog).
2. **N2-BIND-NURSE** — Bind `bundle.role.nurse` to nurse role. +5 pts.
3. **N2-INTENT-DECISIONS** — Product decisions on finance intent (manager writes invoices? accountant refunds payments?). Update bundles accordingly. +10 pts.
4. **N2-BIND-NEW** — Attach every NEW key to its correct bundle per N1 taxonomy. +5 pts.
5. **N4-COMPLIANCE** — Introduce `bundle.compliance` and either a `compliance` app_role or grant `audit.read` inside admin bundle for now. +5 pts.
6. **CI-INVARIANTS** — Add analyzer scripts to `scripts/authz/` that enforce I-1..I-5. +10 pts.

Estimated total after those: **~91/100**. Then Wave 3F becomes safe to schedule.

## 6. Deliverables (Sprint N1–N5)

- `docs/normalization/N1_PERMISSION_TAXONOMY_V2.md` (Permission Taxonomy v2)
- `docs/normalization/N2_BUNDLE_INTEGRITY_REPORT.md` (Bundle Integrity Report)
- `docs/normalization/N3_PERMISSION_COVERAGE_MATRIX.md` (Permission Coverage Matrix)
- `docs/normalization/N4_DEAD_PERMISSION_REPORT.md` (Dead Permission Report + Naming Standard)
- `docs/normalization/N5_AUTHORIZATION_DEPENDENCY_GRAPH.md` (this file)

**No code, SQL, permissions, or bundles were modified. Awaiting review before executing N1-INSERT (the first additive sub-wave).**
