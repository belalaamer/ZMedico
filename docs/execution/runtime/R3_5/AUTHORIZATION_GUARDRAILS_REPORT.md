# R3.5 — Authorization Enforcement Guardrails

**Status:** Implemented · **Behavior change:** none · **CI mode:** advisory
(promote to blocking with `GUARDRAILS_STRICT=1`).

## 1. Purpose

R2 centralized every frontend authorization decision behind
`AuthorizationService`. R3 unified every client-callable SECURITY
DEFINER RPC behind `has_permission(auth.uid(), …)`. R3.5 makes those
invariants **enforceable**: any future PR that reintroduces a legacy
authorization path fails CI.

No SQL, RLS, permission, bundle, RPC, or catalog changes were made.

## 2. Enforced rules

### 2.1 Frontend (`scripts/authz/guardrails_frontend.py`)

Fails when any of these patterns appear **outside** the compatibility
allowlist:

| Pattern            | Rationale                                         |
| ------------------ | ------------------------------------------------- |
| `has_role(`        | Legacy predicate; only permitted inside catalog.  |
| `roles.includes(`  | Raw role identity check — must go through service.|
| `isAdmin`          | Raw admin bypass — masks permission semantics.    |
| `role === '…'`     | Raw role comparison.                              |
| `usePermissions(`  | Legacy hook; wrapped by `AuthorizationService`.   |
| `useUserRole(`     | Legacy hook; wrapped by `AuthorizationService`.   |

**Allowlist (compatibility surface, R2/R3-anchored):**

- `src/lib/authz/**` — canonical adapter internals.
- `src/hooks/usePermissions.ts` — legacy hook wrapped by the service.
- `src/hooks/useUserRole.ts` — legacy hook wrapped by the service.
- `src/lib/rolePermissions.ts` — permission map (data, not decisions).
- `src/lib/systemSelfAudit.ts` — documentation strings only.
- Test files (`*.test.*`, `*.spec.*`, `src/test/**`, `tests/**`).

**Baseline (R3.5 landing snapshot):** 0 findings.

### 2.2 Backend — SECURITY DEFINER (`scripts/authz/guardrails_backend.py`)

For every `CREATE [OR REPLACE] FUNCTION … SECURITY DEFINER` block found
in migrations **added after the R3.5 cutoff**
(`20260708202908_…sql`), the checker validates:

| Rule                              | Failure code                    |
| --------------------------------- | ------------------------------- |
| Body calls `has_permission(…)`    | `definer_no_has_permission`     |
| Body does not call `has_role(…)`  | `definer_has_role`              |
| Signature has no client actor param (`_by`, `_actor`, `_user_id`, `_performed_by`, `_created_by`, `_updated_by`) | `definer_actor_param` |
| Body sets `SET search_path`       | `definer_no_search_path`        |

An individual legacy migration can opt out only by carrying the marker
`-- authz-guardrails: legacy-ok` in the file — reviewers must justify
its presence in the PR description.

### 2.3 Backend — Edge Functions

Non-`admin-*` edge functions that reference
`SUPABASE_SERVICE_ROLE_KEY` fail with `edge_service_role_bypass` — they
must instead call an `has_permission()`-gated RPC. Current allowlisted
directories: `admin-create-user`, `admin-delete-user`, `admin-export`,
`admin-reset-password`.

### 2.4 SECURITY DEFINER Standard v1

Existing rules (R1–R9) remain enforced by
`scripts/authz/compliance_definer.py`. R3.5 does not change them; it
layers *additive* migration-file lint on top so new functions are
caught before they reach the database.

### 2.5 RPC manifest

`scripts/authz/check_rpc_manifest.py` continues to require every
client-callable RPC to (a) exist in `rpc_manifest.yaml`, (b) map to a
permission key present in the catalog, (c) declare its purpose, and
(d) ship with rollback + regression coverage.

### 2.6 Drift detection

`diff_baseline.py` already flags:

- New `has_role` usage inside DB predicates (via RPC decision diff).
- Missing permission keys (via manifest checker exit code 10).
- Orphan catalog keys / bundle references (harness cross-check).
- Unauthorized RPC additions (manifest freeze, one-way additions only).
- Duplicated permission logic (compliance R4 — exactly one gate).

R3.5 wires the two new guardrail scripts into `run_all.sh` so the
regression harness now runs **eight** checks in sequence:

```text
analyze_rls → analyze_rpcs → check_rpc_manifest → compliance_definer
           → guardrails_frontend → guardrails_backend → diff_baseline
```

## 3. CI integration

Advisory today (does not fail the pipeline). To promote to blocking:

```bash
GUARDRAILS_STRICT=1 bash scripts/authz/run_all.sh
```

Recommended cutover: enable strict mode once each PR template includes
the guardrail checklist below.

## 4. Compatibility exceptions (current)

| Area | Files / functions | Reason | Removal target |
| ---- | ----------------- | ------ | -------------- |
| Frontend | `src/hooks/usePermissions.ts`, `src/hooks/useUserRole.ts` | R2 wraps them for byte-identical semantics. | R8 (identity migration). |
| Frontend | `src/lib/rolePermissions.ts` | Data source for permission map. | Retired when bundles fully replace the map. |
| Backend  | Migrations authored before `20260708202908_…sql` | Historical debt already tracked by `H3_SECURITY_DEFINER_RPC_REVIEW.md`. | Cleared as hotfixes land. |
| Backend  | `admin-*` edge functions | Legitimate admin-scoped operations. | Permanent. |

## 5. Technical debt (unchanged by R3.5)

All items pre-existing; R3.5 does not introduce new debt.

- 5 WARNING functions under `has_role` R9 (see S2 compliance report).
- Compatibility hooks (§4) remain until R8.
- Historical migrations remain out of scope for the backend guardrail
  by design; they are separately catalogued in the S2 report.

## 6. Future migration impact

| Wave | Impact |
| ---- | ------ |
| R4 (Edge Function migration) | Guardrail already flags any non-admin service-role usage; R4 will land the migration + remove the compatibility exceptions. |
| R5–R7 | No blocker; each new SECURITY DEFINER function will be caught at PR time by the migration lint. |
| R8 (Identity migration) | Retires `usePermissions` / `useUserRole` compatibility entries. Guardrail allowlist shrinks accordingly. |
| BA-03+ | Unblocked; guardrails prevent regressions during infrastructure work. |

## 7. Verification

Run locally:

```bash
python scripts/authz/guardrails_frontend.py            # 0 findings today
python scripts/authz/guardrails_backend.py \
  --since 20260708202908_89763348-3ec9-4b38-92c8-39ea21191db5.sql
# → 0 findings today (no new migrations added since R3.5 landed)
bash scripts/authz/run_all.sh                          # harness clean
```

Regression suite: unchanged Golden Baseline diff (0 RLS + 0 RPC).

## 8. Deliverables

- ✅ `scripts/authz/guardrails_frontend.py`
- ✅ `scripts/authz/guardrails_backend.py`
- ✅ Harness hook — `scripts/authz/run_all.sh`
- ✅ Tests — `scripts/authz/tests/test_guardrails.py`
- ✅ Compliance report — this document.
- ✅ Rollback — `docs/execution/runtime/R3_5/R3_5_ROLLBACK.md`

## 9. PR checklist (for reviewers)

When reviewing any PR that touches authorization surfaces:

- [ ] `python scripts/authz/guardrails_frontend.py` reports 0 findings.
- [ ] `python scripts/authz/guardrails_backend.py --since <prev>`
      reports 0 findings on the new migrations.
- [ ] Every new client-callable RPC is in `rpc_manifest.yaml` with a
      permission key that exists in `docs/PERMISSION_CATALOG.md`.
- [ ] Rollback SQL committed alongside the migration.
- [ ] `bash scripts/authz/run_all.sh` prints zero unlabeled drift.