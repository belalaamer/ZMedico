# M1 Pause — Authorization Runtime Gap Assessment

**Status:** Documentation only. No SQL, no code, no migrations.
**Scope:** Independent measurement of how much of runtime authorization
is *actually enforced* by the new architecture (Catalog + Bundles +
Registry + State + `has_permission`) versus how much still runs on the
legacy path (`has_role` + `DEFAULT_PERMISSIONS` map + client-side
`isAdmin`).
**Method:** direct counts from `pg_policies`, `pg_proc`, `authz_*`
tables, and `rg` sweeps of `src/**` and `supabase/**`. Numbers are
measured, not estimated.

---

## 1. Headline numbers (measured)

| Signal | Value |
|---|---|
| RLS policies total (public schema) | **370** |
| RLS policies routed through `has_role(...)` | **187 (50.5%)** |
| RLS policies routed through `has_permission(...)` | **36 (9.7%)** |
| RLS policies using other predicates (auth.uid, joins) | ~147 (39.7%) |
| SECURITY DEFINER RPCs in `public` | **101** (12 in RPC Manifest; 89 uncatalogued) |
| Migration files referencing `has_role` | **64** |
| Rows in legacy `role_permissions` table | 67 |
| Rows in new `authz_permissions` (catalog) | 67 |
| Effective permissions resolved by `v_authz_effective_permissions` | 382 |
| Frontend call sites of `usePermissions` (legacy) | present in ~40 files |
| Frontend call sites of `useAuthorization` (new) | 4 (Can, CanExport, its own tests, parity tests) |
| Runtime call sites of `has_permission` from client / RPC / edge fn | **0** |
| Consumers of `authz_versions` / `authz_current_state` | **0** |

Reading: the new architecture exists and is verified; **it enforces
only 9.7% of RLS decisions today**. Every other authorization decision
still runs on legacy machinery.

---

## 2. Runtime Coverage Matrix

Legend: **F** = Fully migrated · **P** = Partially migrated · **N** = Not migrated

### Frontend

| Component | Current mechanism | Target | Coverage | Blocking dependency | Effort | Risk |
|---|---|---|---|---|---|---|
| `usePermissions` hook | Fetches `role_permissions` table → `DEFAULT_PERMISSIONS` map | `has_permission(auth.uid(), key)` via RPC or catalog-derived cache | **N (0%)** | Client resolver for `has_permission`; cache-bust via `authz_versions` | M | HIGH — every gate in the app depends on this hook |
| `AuthorizationService` | Adapter over legacy `usePermissions` (parity-verified) | Direct catalog-key evaluation from server or catalog cache | **P (interface only)** | usePermissions migration | S | MED |
| `<Can>` | Delegates to `AuthorizationService` → legacy map | Same interface, catalog-backed underneath | **P** | Above | S | MED |
| `PermissionRoute` | `has_role`-style checks + legacy map | Catalog-key checks | **P** | Above | S | HIGH — route-level bypass surface |
| Sidebar | Reads legacy permission map for nav visibility | Reads catalog-derived grants | **P** | Above | S | LOW (visibility only, not enforcement) |
| MobileBottomNav | Same as Sidebar | Same | **P** | Above | S | LOW |
| Feature guards inside pages (40+ files) | Ad-hoc `usePermissions` calls + `isAdmin` checks + hard-coded role strings | Catalog keys only | **N** | Above + code sweep | L | HIGH — bypasses possible via any missed site |
| Cache invalidation | None (usePermissions caches for session) | Poll or realtime on `authz_versions`, cache-bust on version bump | **N** | BA-02 resolver wiring | S | HIGH during Wave B — stale grants for hours |

### Backend

| Component | Current mechanism | Target | Coverage | Blocking dependency | Effort | Risk |
|---|---|---|---|---|---|---|
| RLS policies | 187 via `has_role`, 36 via `has_permission`, ~147 direct predicates | 100% via `has_permission` (+ scope helpers) where policy-appropriate | **P (9.7%)** | Wave B cutover plan | XL | HIGH — every unmigrated policy is a role-based decision that can't be adjusted without a migration |
| `has_role` function | In production, called by 187 policies | Retained as SECURITY DEFINER primitive; called only by `has_permission` internals | **F as primitive** | — | — | LOW |
| `has_permission` function | Exists (Wave 1), called by 36 policies | Called by all policy-appropriate policies | **P** | Wave B | XL | HIGH |
| SECURITY DEFINER RPCs | 101 present; only 12 in the RPC Manifest (RPC-08) | All client-callable definer RPCs in Manifest with permission binding | **P (12/101 = 11.9% catalogued)** | M4 conformance sweep | L | HIGH — 89 uncatalogued definer functions are outside the manifest gate |
| RPC authorization | Mixed: some functions self-check `has_role`; some rely on RLS on target tables; some do neither | Uniform `has_permission(auth.uid(), key)` check inside every definer RPC + audit | **N (uniform enforcement)** | S1 v1.1 conformance | L | HIGH — dominant privilege-escalation surface |
| Edge Functions (7) | Bearer token + service_role client; permission enforcement varies per function | Central `has_permission` check before privileged action | **N** | Client-side JWT decoding + edge helper | M | HIGH — service_role bypasses RLS entirely |
| Triggers | Do not perform authorization (correct) | — | **F (n/a)** | — | LOW |

### Database (authorization metadata)

| Component | Current mechanism | Target | Coverage | Blocking dependency | Effort | Risk |
|---|---|---|---|---|---|---|
| Permission Catalog (`authz_permissions`) | Seeded, 67 keys | Referenced by all policies and RPCs | **F (definition) · N (consumption)** | Wave B | — | LOW (definition side) |
| Bundle library (`authz_bundles*`) | Seeded but **dormant** (RC2 removed bundles from runtime path) | Historical only; slated for M6 removal | **N/A** | M6 cleanup | — | LOW |
| Role bindings (`authz_role_bundles`) | Seeded, dormant | Direct role → permission grant table (post-M6) | **N/A → F after M6** | — | — | LOW |
| Effective permissions resolver (`v_authz_effective_permissions`) | Exists, returns 382 rows | Consumed by client cache + `has_permission` | **P (view exists) · N (unread)** | Client wiring | S | MED |

### Infrastructure

| Component | Current mechanism | Target | Coverage | Blocking dependency | Effort | Risk |
|---|---|---|---|---|---|---|
| Version Registry (`authz_versions`) | BA-01, 7 rows @ 1.0.0/active | Bumped in every authorization migration | **F (definition) · N (writer path)** | Migration linter that requires a bump | S | HIGH — without writer path, versions silently rot |
| Authorization State (`authz_current_state`) | BA-02, resolver live | Consumed by client cache-bust, CI, harness | **F (definition) · N (consumers)** | Frontend + harness wiring | S | MED |
| Regression Harness | `run_all.sh` operational, gates on unlabeled diff | Anchored to `authz_current_state()`; refuses to run on `integrity_status=fail` | **F (baseline) · P (state anchoring)** | BA-04 wiring | S | MED |
| Golden Baseline | 3,760 cells, reproducible | Re-derived and version-anchored on every merge | **F** | — | — | LOW |
| Governance | A0–A3, RC2, Program Gate, Integrity Framework | — | **F** | — | — | LOW |
| CI integrity gate | None | BA-01B checker wired to `run_all.sh` | **N** | BA-01B | S | HIGH before Wave B |

---

## 3. Authorization Dependency Graph (runtime, today)

```
                     ┌─────────────────────┐
                     │  Frontend request   │
                     └──────────┬──────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
     ┌────────────────┐                 ┌──────────────────┐
     │ usePermissions │  LEGACY         │ Direct DB call   │
     │ (role_perms +  │◄────────────────┤ via supabase-js  │
     │ DEFAULT_PERMS) │                 └────────┬─────────┘
     └───────┬────────┘                          │
             │ decides UI gating                 │
             ▼                                   ▼
     ┌────────────────┐                 ┌──────────────────┐
     │  <Can /> /     │                 │   RLS policies    │
     │ PermissionRoute│                 │   (370 total)    │
     └────────────────┘                 └────────┬─────────┘
                                                 │
                              ┌──────────────────┼──────────────────┐
                              ▼                  ▼                  ▼
                       ┌────────────┐   ┌────────────────┐   ┌────────────┐
                       │ has_role   │   │ has_permission │   │ direct     │
                       │  (187 pol) │   │   (36 pol)     │   │  auth.uid()│
                       │  LEGACY    │   │      NEW       │   │   (~147)   │
                       └─────┬──────┘   └───────┬────────┘   └────────────┘
                             │                  │
                             ▼                  ▼
                       ┌────────────┐   ┌───────────────────┐
                       │ user_roles │   │ authz_permissions │
                       │            │   │ authz_bundles*    │
                       └────────────┘   │ authz_role_bundles│
                                        └───────────────────┘

     ╔═══════════════════════════ INFRASTRUCTURE (unused) ═══════════════════════════╗
     ║                                                                                ║
     ║   authz_versions ──► authz_current_state() ──► v_authz_state                   ║
     ║        (BA-01)             (BA-02)                                             ║
     ║                                                                                ║
     ║   NO CONSUMER READS EITHER TODAY. Zero client, harness, or CI wiring.          ║
     ╚════════════════════════════════════════════════════════════════════════════════╝
```

---

## 4. Remaining Legacy Components (ranked by breadth)

1. **`role_permissions` table + `DEFAULT_PERMISSIONS` map** — sole source of truth for every frontend permission decision. 67 rows, every session reads it.
2. **187 RLS policies calling `has_role`** — 50.5% of all RLS decisions. Bypassable only by adjusting `user_roles`; cannot be scoped without a schema migration per table.
3. **89 SECURITY DEFINER RPCs outside the RPC Manifest** — not audited by RPC-09, not required to conform to S1 v1.1 yet.
4. **`isAdmin` / hard-coded role strings** scattered across ~15 pages — checked in JSX, not through the service.
5. **Edge functions with `service_role` client** — 7 functions; permission checks are per-function, not standardized.
6. **`usePermissions` session-lifetime cache** — no invalidation path; a role change or permission bump is invisible for the duration of the tab's session.
7. **Legacy `AuthorizationService` adapter** — technically new API, but delegates to `DEFAULT_PERMISSIONS`. Interface migration without semantic migration.

---

## 5. Technical Debt Report

| # | Debt | Severity | Since | Fix owner | Fix milestone |
|---|---|---|---|---|---|
| T-1 | 187 `has_role`-based policies (50.5% of RLS) | **CRITICAL** | pre-Wave 1 | Backend | Wave B (M5) |
| T-2 | 89 uncatalogued SECURITY DEFINER RPCs | **CRITICAL** | pre-Wave 1 | Backend + Security | M4 |
| T-3 | Frontend never calls `has_permission`; `usePermissions` still reads legacy map | **CRITICAL** | pre-Wave 1 | Frontend | Wave A→B |
| T-4 | No cache-bust on `authz_versions` change; stale grants possible for hours | **HIGH** | BA-01 | Frontend | Before Wave B prod |
| T-5 | No writer path bumps `authz_versions` on migrations | **HIGH** | BA-01 | Backend/CI | BA-01B / BA-03 |
| T-6 | No consumer reads `authz_current_state()` | **HIGH** | BA-02 | All | BA-01B + BA-04 |
| T-7 | Edge functions bypass RLS via `service_role` without uniform permission checks | **HIGH** | pre-Wave 1 | Backend | M4 |
| T-8 | Bundle layer seeded but dormant; codebase still contains references | MED | Wave 1 | Backend | M6 |
| T-9 | 64 migration files reference `has_role` — no historical bump/label required | MED | pre-Wave 1 | CI | BA-01B |
| T-10 | `isAdmin` / hard-coded role strings in page components | MED | pre-Wave 1 | Frontend | Wave A |

---

## 6. Migration Priority (ordered by security impact, not effort)

1. **Frontend `usePermissions` → `has_permission` cutover** — every UI gate today runs on stale, cache-forever legacy state. Highest exposure surface.
2. **Cache-bust wiring via `authz_versions` / `authz_current_state`** — makes any subsequent grant change actually observable to running clients. Prerequisite for Wave B prod.
3. **RPC Manifest coverage for the 89 uncatalogued SECURITY DEFINER functions** — closes the largest privilege-escalation surface. M4.
4. **187 RLS policies from `has_role` → `has_permission`** — the bulk of Wave B. Sequenced per Wave 3a/3b/3c/3d/3e pattern.
5. **Edge functions permission uniformity** — service_role callers must run `has_permission` centrally before privileged writes.
6. **`isAdmin` and hard-coded role strings sweep** — eliminate ad-hoc bypasses.
7. **Integrity checker + version-bump writer path (BA-01B / BA-03)** — CI gate for everything above.
8. **Bundle layer removal + `role_permissions` retirement** — M6 hygiene.

---

## 7. Answers to the pause questions

**Q1. If development stopped today, what percentage of authorization decisions are actually enforced by the new architecture?**

At the RLS layer: **9.7%** (36 / 370 policies route through `has_permission`).
At the frontend layer: **0%** (no component reads catalog-derived grants).
At the RPC layer: **11.9% catalogued** (12 / 101), but even the 12 manifest entries don't uniformly call `has_permission` inside their bodies.
**Weighted platform-wide: ≈ 7–10%.**

**Q2. What percentage still depends on legacy authorization?**

**≈ 90%+.** The frontend is entirely legacy. Half of RLS policies are role-based. Every edge function checks permissions per its own logic.

**Q3. Five highest-risk remaining legacy authorization paths**

1. `usePermissions` → `DEFAULT_PERMISSIONS` map — every UI gate, every session, no cache-bust.
2. 89 uncatalogued SECURITY DEFINER RPCs — outside the manifest, outside S1 v1.1 conformance, callable by any authenticated user.
3. 187 `has_role`-only RLS policies — cannot express per-permission decisions without a schema migration per table.
4. Edge functions using `service_role` client — RLS-bypassing; permission logic varies per function.
5. `isAdmin` boolean checks in page-level JSX — hard-coded, easy to miss during a refactor, and completely invisible to the catalog.

**Q4. Single most important implementation task before building more infrastructure**

**Frontend cutover of `usePermissions` to a catalog-derived grant fetcher, wired to `authz_current_state()` for cache-busting.** Everything downstream (Wave B RLS, edge function uniformity, integrity CI gate) depends on the client actually consuming the new architecture. Building more registry/state features while zero consumers exist is documentation cost with no runtime dividend.

**Q5. Should BA-03 begin now, or should implementation focus on Runtime Migration first?**

**Runtime Migration first.** BA-03 (and any further infra work) should pause. The registry and state model are inert until at least one runtime consumer reads them. Recommended immediate pivot:

- **PR-1: Client cache-bust** — `usePermissions` polls `authz_current_state().fingerprint` and refetches on change. Small, isolated, immediate value; unblocks every subsequent grant migration.
- **PR-2: `has_permission` client resolver** — replace `DEFAULT_PERMISSIONS` lookup with an RPC-backed check keyed by catalog permission. Ship behind a per-route feature flag; parity-tested against the existing `AuthorizationService` matrix.
- **PR-3: RPC Manifest expansion** — catalogue the 89 uncatalogued SECURITY DEFINER functions (RPC-08 additions). Blocks strict M4.
- Only *after* PR-1/PR-2/PR-3 land: resume BA-03.

**Verdict: PAUSE BA-03. Resume infrastructure work only after the first runtime consumer of the new architecture ships.**

*End of gap assessment. No implementation performed.*
