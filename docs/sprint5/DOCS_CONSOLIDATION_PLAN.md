# Documentation Consolidation Plan — Sprint 5

Objective: propose a coherent target structure for the docs/ tree without
rewriting or deleting anything. Execution is deferred.

## Current shape (observed)

- docs/auth/ — 12 versioned architecture specs (V3 through V12)
- docs/architecture/ — canonical AUTHORIZATION_ARCHITECTURE.md
- docs/business/ — 6 spec + validation docs
- docs/data/ — Sprint 3 outputs (contracts, CDM, ownership, quality, retention)
- docs/execution/, docs/normalization/, docs/wave3*/, docs/governance/,
  docs/sprint4/, docs/sprint5/, docs/security/, docs/final/, docs/reviews/,
  docs/performance/, docs/milestones/
- ~90+ standalone docs at docs/ root (AUTHORIZATION_*, R5_*, RBAC_*, etc.)

## Target structure (recommended)

```text
docs/
  architecture/           # canonical reference (current + versioned)
    current/              # single source of truth per topic
    versions/             # V3–V14 preserved read-only
  business/               # product + RBAC specs (current)
  data/                   # V13 contracts + governance (current)
  security/               # audits, DEFINER standard, edge hardening
  observability/          # (new) Sentry, correlation, SLOs
  operations/             # release, cutover, deployment guides
  sprints/                # sprint1..sprint5 reports (moved from root)
  governance/             # charter, lifecycle, ownership, decisions
  archive/                # wave3*, normalization, execution, m1_pause,
                          # historical rollback SQL
```

## Merge candidates (conceptual, no rewrite)

| Target | Sources |
|--------|---------|
| architecture/current/AUTHORIZATION.md | AUTHORIZATION_STANDARDS.md, AUTHORIZATION_INVENTORY.md, BACKEND_AUTHORIZATION_MIGRATION_PLAN.md, ROLE_ARCHITECTURE.md |
| architecture/current/RBAC.md | RBAC_AUDIT.md, RBAC_MATRIX.md, business/BUSINESS_RBAC_MATRIX.md |
| security/DEFINER.md | security/S1_SECURITY_DEFINER_STANDARD_V1.md, security/SECURITY_DEFINER_AUDIT.md, security/H3_SECURITY_DEFINER_RPC_REVIEW.md |
| operations/RELEASE.md | final/FINAL_RELEASE_SIGNOFF.md, final/PRODUCTION_CUTOVER_CHECKLIST.md, final/PRODUCTION_DEPLOYMENT_GUIDE.md |
| archive/wave3/ | wave3/, wave3a/, wave3b/, wave3c/, wave3d/, wave3e/ |
| archive/normalization/ | normalization/N1..N9 |
| archive/execution/ | execution/BA01, BA02, M1_PAUSE, M2_SETTINGS |

## Rules

- Never delete original files; move under archive/ with a redirect stub if
  execution is later approved.
- Preserve versioned specs (V3–V14) untouched.
- Every merge must retain full authorship history by using git mv.
- No content rewrite; only path re-organization + top-level INDEX.md.

## Deferred

Execution requires stakeholder sign-off (governance owner). Sprint 5 delivers
the plan only.
