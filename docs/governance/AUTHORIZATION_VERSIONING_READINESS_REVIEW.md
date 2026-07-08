# Authorization Versioning Readiness Review

**Status:** Documentation only. No SQL, no code, no migrations.
**Scope:** Independent readiness check performed immediately before
M1 · BA-01 (`authz_version` introduction). Purpose: confirm the
authorization metadata layer is stable enough to justify a version
scalar, and pin down exactly what that scalar means before any table
or trigger is created.
**Method:** Inventory every metadata artifact, classify its mutability
profile, and derive the minimum versioning contract that satisfies the
cache-busting requirement from Program Gate condition (5).

---

## A. Is authorization metadata immutable enough to introduce versioning?

**Yes — conditionally.** The metadata layer has reached the stability
threshold required for a monotonically-increasing version scalar:

| Signal | Evidence |
|---|---|
| Catalog frozen | `docs/PERMISSION_CATALOG.md` + N1 taxonomy locked at RC2. 56 keys, no pending renames. |
| Roles frozen | 6 roles fixed by A3 RC2; no bundle layer (per RC2 simplification). |
| RPC Manifest frozen | `scripts/authz/rpc_manifest.yaml` v1, 12 entries, `frozen: true`. |
| Baseline reproducible | 3,760 authorization decisions re-derive with 0 diff. |
| Governance closed | A0–A3, RC1.1→RC2, Program Gate, Adversarial Review all landed. |
| Harness enforces drift | `run_all.sh` exits non-zero on unlabeled change. |

Residual instability (Wave B RLS repointing, four H3 hotfixes, three
RC2 RPCs) is behind the version scalar, not in front of it: those are
exactly the events the scalar is designed to signal. Introducing
versioning now is therefore not premature — it is a prerequisite for
those events to be safely observable by long-lived clients.

**Condition:** the scalar must be defined before Wave B ships, not
after. BA-01 satisfies this ordering.

---

## B. Artifact classification

| Artifact | Classification | Rationale | Version-bearing? |
|---|---|---|---|
| Permission Catalog (`PERMISSION_CATALOG.md`, `authz_permissions`) | Versioned | Human-authored source of truth; changes are rare and reviewed. | Yes |
| Role definitions (6 roles in A3) | Versioned | Enumerated, frozen post-RC2; changes require Product Decision. | Yes (via catalog) |
| Role → permission grants | Versioned | Directly affects every runtime decision; must invalidate client caches. | Yes |
| Bundle definitions | Immutable (removed) | RC2 eliminated the bundle layer; retained only as historical Wave-1 docs. | No |
| `authz_bundle_*` tables (Wave 1) | Immutable (dormant) | Present but unread; scheduled for M6 cleanup. | No |
| RPC Manifest (`rpc_manifest.yaml`) | Versioned | Already carries `version: 1`; additions are one-way. | Yes (own field) |
| Golden Authorization Baseline (CSVs) | Derived | Deterministically re-derived by `analyze_rls.py` + `analyze_rpcs.py`. Baseline is a snapshot, not a source. | No (implied by catalog + RLS) |
| RLS policy inventory | Generated | Emitted from `pg_policies` on demand; source of truth is the migrations. | No (implied by DB migration id) |
| `v_authz_effective_permissions` | Derived | View over catalog + role bindings. | No |
| Governance documents (A0–A3, S1, S2, RC reviews) | Immutable | Append-only; superseded docs are archived, not edited. | No (git SHA suffices) |
| Regression harness scripts | Generated tooling | Code, not metadata. | No |

**Version-bearing set (three artifacts):** Permission Catalog,
Role→Permission grants, RPC Manifest. Everything else is either
derived from these or lives in git.

---

## C. Version scheme trade-off

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| 1. Single global `authz_version` (integer, monotonic) | Trivial cache-bust; one comparison in the client; matches Program Gate §5 verbatim; atomic across catalog/roles/RPCs. | Any change forces every client to re-fetch even if only RPC Manifest changed. Coarse. | Recommended. |
| 2. Independent versions per artifact | Fine-grained invalidation; client can refetch only what changed. | Client must reconcile three scalars; consistency window where catalog v=N but grants v=N-1; multiplies test surface. | Reject — complexity buys negligible cache savings. |
| 3. SemVer (`major.minor.patch`) | Communicates breaking vs additive intent to humans. | Machine cache-busting only needs monotonic ordering; SemVer's "compatibility" contract is meaningless for a closed internal client set; subjective bumps. | Reject — human signal belongs in the changelog, not the runtime scalar. |

**Decision:** Option 1. Single monotonically-increasing integer, one
row in one table, published to clients on every session load and via
realtime on change.

---

## D. Version increment rules

| Event | Increment? | Why |
|---|---|---|
| New permission added to catalog | Yes | Grants may reference it; UI gating changes. |
| Existing permission renamed | Yes | Client-side permission strings become stale. |
| Permission deprecated / removed | Yes | Removes gating; UI must re-render. |
| Role's default permission set changes | Yes | Directly changes effective grants for existing sessions. |
| A user's role assignment changes (`user_roles` insert/update/delete) | No | Per-user event, handled by session refresh / realtime on `user_roles`, not the global scalar. |
| New entry added to RPC Manifest | Yes | New callable surface; clients may enable UI paths. |
| RPC Manifest entry modified | Yes | Gating semantics change. |
| RLS migration lands (Wave A/B) | Yes | Effective allow/deny set changes; clients must invalidate optimistic caches. |
| SECURITY DEFINER body change without signature change | Conditional | Only if it changes the permission enforced or the audit contract. |
| Regression harness code update | No | Harness is verification, not metadata. |
| Baseline CSV re-snapshot (approved drift) | Yes | The bump belongs to the underlying catalog/RLS event that caused the drift. |
| Documentation-only change | No | No runtime effect. |
| New entry in `intentional_changes.txt` | No | Sign-off ledger, not metadata. |
| Wave B feature-flag flip | Yes | Effective policy changes for active sessions. |

**Rule of thumb:** increment iff a currently-connected client holding
a cached permission decision could now compute a different answer than
the server.

---

## E. Invariants

I-1. **Single source.** Exactly one row of `authz_version` is
authoritative; the value is a strictly-increasing integer. No gaps
required; no reuse permitted.

I-2. **No mixed loads.** A client's in-memory permission set is tagged
with the version observed at fetch time. Any server response
advertising a higher version invalidates the cache before the next
authorization decision is rendered.

I-3. **Atomic bump.** The version is incremented in the same
transaction as the migration that changes catalog, grants, or manifest
state. Never before, never after, never in a separate migration.

I-4. **Manifest compatibility.** `rpc_manifest.yaml`'s `version` field
(schema version) is independent of `authz_version` (runtime metadata
version). The manifest entry set is covered by `authz_version`; the
manifest schema is covered by its own field. Documented explicitly to
prevent confusion.

I-5. **Harness anchoring.** `run_all.sh` records the `authz_version`
observed at snapshot time. Diff reports cite both baseline and current
versions.

I-6. **Monotonicity across rollback.** A rollback that reverts a
catalog change still increments `authz_version` — rollbacks are
forward-only from the version scalar's perspective (see F).

I-7. **Frontend contract.** `usePermissions` refetches when the
observed version exceeds the cached version. Refetch is non-blocking
for reads but blocking for writes requiring permission re-evaluation.

I-8. **Baseline coupling.** Golden Baseline CSVs are keyed to a
specific `authz_version`. Cross-version diffing requires explicit
re-derivation, not comparison of frozen CSVs from different versions.

---

## F. Rollback behavior

Versioning is **forward-only**. A rollback migration:

1. Undoes the offending catalog / grant / manifest change.
2. Increments `authz_version` again (to `N+2`, not back to `N`).
3. Records the rollback in the migration log with a reference to the
   version being reverted.

Rationale: any client that already observed `N+1` must be forced to
re-fetch after the rollback; reusing or decrementing the version would
leave those clients with a stale cache the server cannot detect.
Emergency break-glass follows the same rule. There is no silent-revert
path.

---

## G. Recommendation

**Proceed with BA-01.** No blocking prerequisite is missing.

Prerequisites confirmed present:

- Permission Catalog frozen (RC2).
- Role model frozen (6 roles, no bundles).
- RPC Manifest committed and schema-checked (RPC-08, RPC-09).
- Regression harness enforces baseline (Wave 2.5).
- Governance chain closed (Program Gate: READY WITH CONDITIONS;
  condition (5) is precisely what BA-01 discharges).

Explicitly not required for BA-01:

- H3-3…H3-6 SECURITY DEFINER hotfixes (Wave B blocker).
- Three RC2 RPCs (`refund_payment`, `apply_discount`,
  `deactivate_staff`) — `authz_version` must exist first so their
  introduction can bump it.
- `describe_effective_permissions` support RPC (Wave B production
  blocker, not BA-01 blocker).

BA-01 scope, when executed, must be limited to:

- `authz_version` table (single row, monotonic integer, RLS enabled,
  read-open to authenticated, write-locked to service role).
- Trigger or RPC guaranteeing atomic increment.
- No client wiring in this task (subsequent M1 task).
- No baseline changes beyond the new table row, labeled in
  `intentional_changes.txt`.

**Verdict: READY. Proceed to BA-01.**

---

*End of readiness review. No implementation performed.*
