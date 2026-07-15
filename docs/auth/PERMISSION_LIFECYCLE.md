# Permission Lifecycle

**Mode:** Documentation only.

**Purpose:** Standardize how a permission enters, lives in, and exits
the catalog. Every stage is parity-safe and reversible until the final
deletion step.

---

## Stage 0. Trigger

A permission proposal is triggered by:

- A new business capability (workflow, screen, action).
- A specialty extension (see `AUTHORIZATION_EXTENSION_GUIDE.md`).
- A refactor that splits or narrows an existing umbrella key.

Triggers never justify renaming or repurposing an existing key.

---

## Stage 1. Proposal

Author drafts:

- Key (`<domain>.<resource>.<action>` per grammar).
- Rationale (business capability, not specialty).
- Bundle(s) that should grant it.
- Default scope (`own` / `branch` / `org` / `global`).
- Feature-flag binding (if any).
- Shadow-probe expected-expansion row.

Submitted as an ADR under `docs/auth/proposals/`.

---

## Stage 2. Review

Reviewers verify:

- Grammar compliance (`AUTHORIZATION_NAMING_GUIDELINES.md`).
- Verb is in closed vocabulary.
- No specialty noun.
- Domain reused from 32-domain registry.
- No overlap with existing keys.
- No behavioural change implied.
- Rollback SQL drafted.

Two approvers required: Platform + Security.

---

## Stage 3. Approval

Merged when:

- Both approvers sign off.
- Shadow-probe expected-expansion committed.
- Migration + rollback drafted.

Approval does **not** deploy.

---

## Stage 4. Catalog Insertion

Additive DDL:

```
INSERT INTO authz_permissions (key, ...) VALUES (...);
```

Key exists but is granted to no bundle yet. Runtime behaviour
unchanged (no bundle expands to include it).

---

## Stage 5. Bundle Assignment

Same or subsequent migration:

```
INSERT INTO authz_bundle_permissions (bundle_key, permission_key, default_scope)
VALUES (...);
```

Or compose via `authz_bundle_implies`. Shadow probe asserts the new
expansion matches the expected-expansion row.

---

## Stage 6. Deployment

- Ship migration under Phase-B additive protocol.
- Canonical runtime picks up the new key automatically.
- Legacy fallback unaffected (fallback ignores unknown keys).
- Feature flag (if any) still off — UI surfacing deferred.

---

## Stage 7. Activation

- Enable the Feature flag for target tenants.
- UI now surfaces the action.
- Users whose bundles include the key can perform it.
- All prior behaviour preserved for users whose bundles do not.

---

## Stage 8. Monitoring

- Shadow probes assert decision parity daily.
- Telemetry tracks decision counts, latency, denial rates.
- KPI dashboards per `AUTHORIZATION_KPIS.md`.
- No action if drift = 0 and denial rate stable.

Minimum 30 clean production days before any subsequent lifecycle
transition.

---

## Stage 9. Deprecation (optional)

Triggered when the key is superseded (rename, split, merge).

1. Insert successor key(s) via Stages 1–6.
2. Add successor(s) to every bundle that grants the deprecated key.
3. Mark deprecated key: `deprecated = true`, `replaced_by = <new>`.
4. Shadow probe asserts old-key decision == new-key decision.
5. Observe 30 clean production days.

---

## Stage 10. Bundle Removal

After the observation window:

- Remove deprecated key from bundles (`DELETE FROM
  authz_bundle_permissions WHERE permission_key = '<old>'`).
- Shadow probe now asserts the old key resolves to `false` (via
  legacy fallback or new key path, depending on caller).
- Observe another 30 clean production days.

---

## Stage 11. Removal

Only after two consecutive clean windows:

- `DELETE FROM authz_permissions WHERE key = '<old>'`.
- Remove any residual references in documentation.
- Rollback SQL retained in `docs/wave*/`.

Removal is the *only* destructive step in the lifecycle and requires
explicit governance approval (see `LEGACY_RETIREMENT_CRITERIA.md`
protocol).

---

## Lifecycle Invariants

| Invariant | Enforcement |
|---|---|
| Additive-only until Stage 11 | Migration review |
| Shadow-probe parity at every stage | CI |
| Rollback SQL available at every stage | PR checklist |
| No specialty noun ever enters the catalog | Governance guard |
| No behavioural change without ADR | Governance guard |
| No permission ever renamed in place | Naming guidelines |
