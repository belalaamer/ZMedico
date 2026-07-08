# BA-01 — Authorization Version Registry

**Status:** Shipped. Fully additive.
**Migration:** creates `public.authz_versions` + two resolver functions
+ immutability/delete triggers + seed for the seven artifact types at
`1.0.0 / active`. No existing authorization surface modified.

---

## 1. Architecture

See diagram: `Authorization_Version_Registry.mmd`.

Single narrow table sits *beside* the existing authorization tables.
It records **only version metadata**; the actual permissions, bundles,
role bindings, RLS policies, and manifest entries continue to live in
their existing sources of truth. The registry references those sources
by artifact_type; it never duplicates their content.

## 2. Data model

```
public.authz_versions
  id             uuid PK
  artifact_type  text  CHECK IN (
                   'permission_catalog','bundle','role_binding',
                   'authz_catalog','rpc_manifest','rls_inventory',
                   'golden_baseline')
  semver         text  CHECK ~ '^\d+\.\d+\.\d+$'
  status         text  CHECK IN ('draft','active','deprecated')
  checksum       text  NULL  -- SHA-256 or equivalent fingerprint
  notes          text  NULL  -- append-only
  created_at     timestamptz  DEFAULT now()
  created_by     uuid  NULL
  activated_at   timestamptz  NULL  -- set on draft->active
  activated_by   uuid  NULL
  deprecated_at  timestamptz  NULL  -- set on active->deprecated
  deprecated_by  uuid  NULL
  UNIQUE (artifact_type, semver)
  UNIQUE (artifact_type) WHERE status='active'   -- partial index
```

- **`artifact_type`** enumerates every version-bearing artifact from
  the readiness review §B. Adding a new type is a one-line `CHECK`
  amendment; no schema redesign.
- **`semver`** is stored as text and validated by regex. Semantic
  ordering is done client-side (or via a helper function later); the
  registry does not compare versions, only records them.
- **`checksum`** is optional and reserved for future fingerprint
  wiring (e.g. hash of `rpc_manifest.yaml`, hash of the golden CSV).
  Immutable once set.
- **`status`** is a strict ladder: `draft → active → deprecated`. No
  other transition is legal; the trigger raises on violation.
- **`notes`** is append-only: new value must start with the old value.
  Prevents silent rewriting of history.

RLS:

| Role           | SELECT | INSERT/UPDATE/DELETE |
|----------------|:------:|:--------------------:|
| authenticated  | ✅ (read metadata) | ❌ |
| service_role   | ✅ | ✅ (guarded by triggers) |

## 3. Version lifecycle

```
       INSERT
         │
         ▼
      ┌───────┐  UPDATE status='active'   ┌────────┐  UPDATE status='deprecated'  ┌────────────┐
      │ draft │ ─────────────────────────►│ active │ ────────────────────────────►│ deprecated │
      └───────┘                           └────────┘                              └────────────┘
         ▲                                    │
         │                                    │  (partial unique index guarantees
      (any new                                │   at most one active row per
       artifact/                              │   artifact_type at any moment)
       version)                               │
                                              ▼
                                      resolvers read this row
```

Forbidden transitions raise `illegal status transition`. Reversals
(`active → draft`, `deprecated → active`) are impossible.

## 4. Activation flow

1. Author records a new draft: `INSERT (artifact_type, semver='X.Y.Z',
   status='draft', checksum=..., notes=...)`. Only `service_role` can
   do this — in practice via a migration or a future admin RPC.
2. When ready to cut over, in a **single transaction**:
   - `UPDATE authz_versions SET status='deprecated' WHERE
     artifact_type=$T AND status='active'`
   - `UPDATE authz_versions SET status='active' WHERE id=<new draft
     id>`
   The partial unique index ensures the transaction serializes; only
   one active row per artifact_type can exist at commit time.
3. `activated_at` and `deprecated_at` are stamped by the trigger.
4. Downstream consumers observe the new version on their next
   `authz_current_version()` call.

## 5. Rollback flow

Forward-only (per readiness review §F). To revert:

1. Cut a new draft (`semver='N+1.0.0'`) whose content matches the
   pre-broken state; record the reason in `notes`.
2. Run the two-statement activation transaction from §4.
3. The problematic version is deprecated, not deleted. History is
   intact.

Physical rollback of BA-01 itself: `docs/execution/BA01/BA01_ROLLBACK.sql`.

## 6. Migration impact

| Surface | Impact |
|---|---|
| Existing tables | None. |
| Existing policies | None. |
| Existing functions | None. |
| Existing RPCs | None. |
| Frontend | None (no wiring in this task). |
| Edge functions | None. |
| Golden baseline | New table adds one entry to the RLS inventory; labeled in `intentional_changes.txt`. Cell counts on all pre-existing tables unchanged. |
| Regression harness | Unchanged code; picks up the new table automatically on next run. |
| Compliance report | Two new SECURITY DEFINER functions added; both `STABLE`, read-only, `search_path=public`, `EXECUTE` limited to `authenticated`+`service_role` — conform to S1 v1.1. |

## 7. Performance

- Table starts at 7 rows and grows by O(1) per authorization change.
  Realistic 10-year projection: < 10,000 rows.
- `authz_current_version(text)`: index-only lookup on the partial
  unique index; single-row result; STABLE — safe to inline in policy
  expressions later.
- `authz_current_versions()`: 7-row scan; ms-range latency.
- No hot-path impact; nothing on the request path calls the registry
  yet.

## 8. Security

- RLS enabled; writes locked to `service_role`. Signed-in users can
  only read metadata (needed for future client cache-busting).
- Two SECURITY DEFINER functions follow the established `has_role` /
  `has_permission` pattern (`STABLE`, `search_path=public`, `REVOKE
  FROM PUBLIC`, `GRANT EXECUTE` to `authenticated`+`service_role`).
  Linter WARNs on these functions are the pre-existing accepted class
  documented in `docs/security/S1_SECURITY_DEFINER_STANDARD_V1.md`.
- Immutability trigger prevents rewriting historical rows.
- Delete trigger blocks any deletion, including from `service_role`.
- No PII stored; no cross-tenant data; no auth.uid() dependency.

## 9. Future extensibility (no schema redesign required)

| Future capability | Mechanism |
|---|---|
| Staged rollouts | Multiple `draft` rows per artifact_type are allowed. Feature flag chooses which one to promote. |
| Blue/green | Add a nullable `channel` column (`blue`/`green`) in a later additive migration; partial index becomes `(artifact_type, channel) WHERE status='active'`. |
| Compatibility checks | Add `compatible_with jsonb` column later (e.g. `rpc_manifest 1.2.0` requires `permission_catalog >= 1.1.0`). CI reads it via `authz_current_versions()`. |
| Checksums | Column already present; populate from CI on activation. |
| Regression harness anchoring | Harness records the active `rls_inventory` + `golden_baseline` semvers in its report. |
| Client cache-busting | `usePermissions` polls `authz_current_version('authz_catalog')` and invalidates on change. |
| Signed activations | Add `signed_by` / `signature` columns additively; enforce in trigger for regulated artifacts. |

None of these require redesigning the current table.

---

## 10. Regression evidence

| Check | Result |
|---|---|
| No permission changed | ✅ — no `authz_permissions` / `role_permissions` write. |
| No bundle changed | ✅ — no `authz_bundles*` write. |
| No RLS policy changed on any existing table | ✅ — only new table's policies added. |
| No RPC behavior changed | ✅ — no existing function altered. |
| Golden Baseline (existing 3,760 cells) unchanged | ✅ — additive table introduces its own cells, labeled. |
| Frontend behavior unchanged | ✅ — no client code modified. |
| Compliance framework | ✅ — new SECURITY DEFINER functions conform to S1 v1.1. |

## 11. Deliverables

- Migration (executed): `public.authz_versions` + 2 functions + 2
  triggers + 7 seed rows.
- Rollback: `docs/execution/BA01/BA01_ROLLBACK.sql`.
- Architecture report: this document.
- Diagram: `Authorization_Version_Registry.mmd`.
- Harness label: entry in `scripts/authz/intentional_changes.txt`.

## 12. Migration percentage

3 / 39 backlog items complete (**7.7 %**). M1 progress: 3 / 7.
Next: **BA-02** (client resolver wiring or checksum backfill — TBD by
backlog priority).
