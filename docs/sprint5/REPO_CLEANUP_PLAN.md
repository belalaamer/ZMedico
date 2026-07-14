# Repository Cleanup Plan — Sprint 5

Scope: identify obsolete, duplicated, or placeholder artefacts across the
repo. Nothing is deleted in this sprint.

## Findings

### Placeholder assets
- public/placeholder.svg — retained only for shadcn defaults; safe to
  remove once every consumer references real assets.
- src/components/ (historic Placeholder.tsx referenced in Sprint 0 audit —
  verify absent before cleanup; already excluded from current tree per
  Sprint 4 dead-code report).

### Duplicated / overlapping docs (candidates for consolidation, not deletion)
- Authorization architecture is documented in ~15 files across docs/auth/,
  docs/architecture/, docs/AUTHORIZATION_*, docs/governance/. Consolidation
  path defined in DOCS_CONSOLIDATION_PLAN.md.
- Multiple RBAC matrices: docs/RBAC_MATRIX.md, docs/business/BUSINESS_RBAC_MATRIX.md,
  docs/auth/BUSINESS_PERMISSION_MATRIX_V2.md — merge into architecture/current/RBAC.md.
- Production readiness reports scattered across docs/final/, docs/reviews/,
  docs/sprint5/ — target: operations/RELEASE.md.

### Legacy migration notes (archive candidates)
- docs/wave3/, wave3a/..wave3e/
- docs/normalization/N1..N9
- docs/execution/BA01, BA02, M1_PAUSE, M2_SETTINGS
- docs/execution/FINAL_AUTHORIZATION_AUDIT.md
- Historical rollback SQL under docs/wave3*/, docs/execution/BA01/, docs/security/H3_*

### Redundant reports (retain, index only)
- Sprint 1–5 reports — link from top-level docs/README.md (to be created in
  a later cleanup pass).

### Stale architecture documents
- Versioned specs V3–V12 in docs/auth/ — preserve read-only; move under
  architecture/versions/ per consolidation plan. Do not rewrite.

### Temporary notes
- None identified in the current tree; every doc appears intentionally
  authored and referenced.

## Execution rules

- Deletion requires governance sign-off.
- Move-only operations use `git mv` to preserve history.
- Every archive directory gets an ARCHIVED.md marker explaining the origin
  sprint / date.

## Sprint 5 non-actions

No file deleted. No file moved. No content rewritten.
