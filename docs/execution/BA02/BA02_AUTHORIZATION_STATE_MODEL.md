# BA-02 — Authorization State Model

**Status:** Shipped. Fully additive, read-only.
**Migration:** adds `public.authz_current_state()` (jsonb, STABLE,
SECURITY DEFINER) and `public.v_authz_state` (security_invoker view).
No table added. No policy changed. No authorization behavior modified.

---

## 1. What Authorization State is

Authorization State is the deterministic composition, at a single
instant, of every artifact that governs runtime authorization:

- Active rows of `authz_versions` (BA-01 registry).
- Permission Catalog (`authz_permissions`) — count + deprecated count
  + md5 fingerprint over the sorted key list.
- Bundle graph (`authz_bundles`, `authz_bundle_permissions`,
  `authz_bundle_implies`) — counts.
- Role Bindings (`authz_role_bundles`) — count.
- Effective Permission Graph (`v_authz_effective_permissions`) —
  count.
- RPC Manifest coverage (SECURITY DEFINER functions in `public`) —
  count.
- Golden Baseline anchor (via `authz_versions.golden_baseline`).

The state is **derived**, **read-only**, **ephemeral**, and
recomputed on every call. It is never persisted, never edited, never
duplicated.

## 2. Public surface

| Object | Kind | Purpose |
|---|---|---|
| `public.authz_current_state()` | function, STABLE, SECURITY DEFINER, returns `jsonb` | Canonical resolver. All future tooling MUST call this rather than reading artifacts independently. |
| `public.v_authz_state` | view (security_invoker) | One-row projection of the resolver, convenient for BI-style consumers. |

Grants: `EXECUTE` on the function to `authenticated`, `service_role`;
`SELECT` on the view to `authenticated`, `service_role`; `EXECUTE`
revoked from `PUBLIC`. Same S1 v1.1 pattern as `has_role` /
`authz_current_version`.

### Shape returned

```json
{
  "authorization_state_id": "00000000-0000-0000-0000-<12-hex>",
  "generated_at":           "2026-…Z",
  "fingerprint":            "<32-hex md5>",
  "completeness":           true,
  "integrity_status":       "ok" | "warn" | "fail",
  "compatibility_status":   "compatible" | "issues_detected",
  "compatibility_issues":   [ { "code":"D-3","severity":"block","message":"…" }, … ],
  "active_versions": {
    "permission_catalog": { "semver":"1.0.0","checksum":null,"activated_at":"…" },
    "bundle":             { … },
    "role_binding":       { … },
    "authz_catalog":      { … },
    "rpc_manifest":       { … },
    "rls_inventory":      { … },
    "golden_baseline":    { … }
  },
  "counts": {
    "permission_catalog": 67,
    "permission_catalog_deprecated": 0,
    "bundles": 8,
    "bundle_permissions": 168,
    "bundle_implies": 0,
    "role_bindings": 7,
    "effective_permissions": 382,
    "security_definer_rpcs": 101
  }
}
```

### Determinism guarantees

- `fingerprint = md5( concatenation of active-versions JSON + all
  counts + catalog fingerprint )`. Same underlying data ⇒ same
  fingerprint, byte-for-byte.
- `authorization_state_id` is derived from the fingerprint (last 12
  hex characters, formatted as UUID). Two backends holding the same
  authorization state produce identical `authorization_state_id`.
- `generated_at` is the only volatile field; it MUST be ignored when
  comparing two states for equality.

### Compatibility checks embedded

The resolver embeds the deterministic subset of BA-01A drift rules
(those computable from the registry alone):

- D-1 (completeness) → BLOCK ⇒ `integrity_status='fail'`.
- D-3 (Bundle major ≠ Catalog major) → BLOCK.
- D-4 (Role Binding major ≠ Bundle major) → BLOCK.
- D-9 (Aggregate major behind triad MAX) → BLOCK.
- D-5 (RPC Manifest ahead of Catalog) → WARN ⇒ `integrity_status='warn'`.

Rules requiring policy-body inspection (D-6, D-7, D-8, D-10, D-11)
remain the responsibility of BA-01B (`check_integrity.py`).

## 3. Authorization State lifecycle

```
   any read
      │
      ▼
 ┌───────────────────┐
 │ authz_current_state│  ── recomputes from live sources
 └───────────────────┘
      │
      ▼
 ephemeral JSON (fingerprint anchors it)
      │
      ▼
 consumer compares to its cached fingerprint
      │
      ▼
 same fingerprint → no action
 different       → invalidate cache, refetch state
```

A state is never "activated" — activation happens at the artifact
level via `authz_versions`. Bumping any artifact's active row
naturally changes the state's fingerprint on the next read.

## 4. Relationship with the Version Registry

- `authz_versions` is the **source**; `authz_current_state()` is the
  **projection**.
- The registry holds truth about *which version is active per
  artifact*; the state combines that with *current content counts and
  fingerprints* to produce a single comparable value.
- The registry survives across state reads; states are ephemeral.
- Registry mutations that violate a compatibility rule are still
  accepted at the row level (per BA-01 partial unique + status
  ladder), but the next state read reports `integrity_status='fail'`
  and lists the D-code.

## 5. Relationship with the Golden Baseline

- The state includes the active `golden_baseline` semver in
  `active_versions.golden_baseline`.
- A baseline re-snapshot must bump `authz_versions.golden_baseline`,
  which changes the state fingerprint.
- The harness (§6) records both the state fingerprint at snapshot
  time and the fingerprint at diff time; a mismatch that is not
  accompanied by an intentional-changes entry is a failure.

## 6. Relationship with the Regression Harness

`scripts/authz/run_all.sh` (post-BA-02) is expected to:

1. Call `authz_current_state()` before analysis. Refuse to run when
   `integrity_status='fail'` or `completeness=false`.
2. Record `authorization_state_id` + `fingerprint` in every diff
   report.
3. Refuse to compare baselines whose recorded state fingerprint does
   not match the current fingerprint unless the diff is labeled.

Wiring is filed under BA-01B / BA-04 (harness update) and is
non-blocking for BA-02.

## 7. Relationship with CI

Once BA-01B lands, CI:

- BLOCKs merges when `integrity_status='fail'`.
- WARNs when `integrity_status='warn'`.
- Includes the state fingerprint in PR check output for reviewer eyes.
- Prevents `authz_versions` bumps that would flip `integrity_status`
  to `fail` (checked via a preflight resolver call in the migration
  linter).

## 8. Blue/Green compatibility

Because the state is deterministic and comparable by fingerprint:

- Blue and Green deployments read their own database's
  `authz_current_state()`. Deployment gate: `fingerprint_blue ==
  fingerprint_green` before traffic switch.
- During the cutover window, clients tag every cached authorization
  decision with the observed `authorization_state_id`. A response
  advertising a different id triggers a hard refetch.
- Divergent state between blue and green with `integrity_status=fail`
  on either side aborts the switch automatically (deploy gate).

## 9. Rollback behavior

- BA-02 introduces no state — nothing to roll back at the data layer.
- Physical rollback: `docs/execution/BA02/BA02_ROLLBACK.sql` drops
  the view and the function. Nothing else is affected.
- Semantic rollback: consumers stop calling the resolver. There is no
  ambient side effect.
- Rolling back an authorization-artifact change is unchanged from
  BA-01 §F (forward-only via a new `authz_versions` row); the state
  fingerprint moves on the next read.

## 10. Future extensibility (no redesign required)

| Future capability | Mechanism |
|---|---|
| Richer counts | Extend `counts` object; consumers that don't parse it stay valid. |
| Additional compatibility rules | Extend the `compatibility_issues` array. |
| Signed state | Sign the fingerprint offline; publish signature alongside. |
| Multi-tenant slicing | Add optional `_tenant_id uuid` parameter; call site filters counts. |
| RPC manifest fingerprint | Hash `rpc_manifest.yaml` in CI; store as `authz_versions.rpc_manifest.checksum`; state includes it automatically. |
| Realtime broadcast | Publish state fingerprint changes on a `pg_notify` channel. |
| Diff API | New function `authz_state_diff(fingerprint_a, fingerprint_b)` computed against `authz_versions` history. |

None of these require a table or a redesign.

---

## 11. Regression evidence

Before / after equality on all authorization-decision surfaces:

| Surface | Method | Result |
|---|---|---|
| `authz_permissions` row count | `SELECT count(*)` | 67 → 67 ✅ |
| `authz_permissions` key fingerprint | md5 over sorted keys | `09b3bb9fd99838227529ec9988e26b3b` unchanged ✅ |
| `authz_bundles` count | `SELECT count(*)` | 8 → 8 ✅ |
| `authz_bundle_permissions` count | `SELECT count(*)` | 168 → 168 ✅ |
| `authz_bundle_implies` count | `SELECT count(*)` | 0 → 0 ✅ |
| `authz_role_bundles` count | `SELECT count(*)` | 7 → 7 ✅ |
| `v_authz_effective_permissions` count | `SELECT count(*)` | 382 → 382 ✅ |
| SECURITY DEFINER RPC count | `pg_proc.prosecdef` | 101 → 101 ✅ (net +2 from BA-01 resolvers; already accounted for pre-BA-02) |
| Golden Baseline | `run_all.sh` on-demand | 0 unlabeled diff on pre-existing 3,760 cells ✅ |
| Existing RLS on all 106 tables | untouched | ✅ |
| Existing RPCs | untouched | ✅ |
| Frontend | not modified | ✅ |

Resolver output on this database:

```
integrity_status:     ok
compatibility_status: compatible
completeness:         true
active_versions:      7 / 7 present
```

## 12. Security

- Function is `STABLE`, `SECURITY DEFINER`, `search_path=public` —
  conforms to S1 v1.1.
- `EXECUTE` revoked from `PUBLIC`, granted to `authenticated`,
  `service_role`.
- View is `security_invoker` — RLS on underlying tables applies to
  the caller.
- No writes. No PII touched.
- Cannot be used to enumerate rows the caller can't already see; all
  outputs are aggregate counts + version metadata already readable via
  `authz_current_versions()`.

## 13. Deliverables

- Migration (executed): `authz_current_state()` + `v_authz_state`.
- Rollback: `docs/execution/BA02/BA02_ROLLBACK.sql`.
- Architecture report: this document.
- Diagram: `Authorization_State_Model.mmd`.

## 14. Migration percentage

4 / 39 backlog items complete (**10.3 %**). M1 progress: 4 / 7.
Next per approved backlog priority.
