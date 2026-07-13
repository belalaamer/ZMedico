# Dead Code & Documentation Audit

Goal: catalog components, utilities, workflows, docs, and assets that
appear unused or superseded. **Nothing is deleted in Sprint 4.**

## Method

- Static grep for symbol usage across `src/`, `tests/`, and `docs/`.
- Cross-check imports for every file matching common "unused" patterns
  (`*Old*`, `*Legacy*`, `*V1*`, orphaned dialogs).
- Flag documentation series superseded by later versions.

## Placeholder assets

| Asset | Status | Recommendation |
|-------|--------|----------------|
| `public/placeholder.svg` | Reused by shadcn card skeletons in a few components. | **Keep** — verify by `rg placeholder.svg src` before any future deletion. |
| `public/robots.txt` | Referenced by SEO. | **Keep**. |
| `public/favicon.ico` | Referenced by `index.html`. | **Keep**. |

## Potentially duplicated utilities

| Area | Observation | Recommendation |
|------|-------------|----------------|
| `src/lib/queueAudit.ts` vs `src/lib/queueSelfAudit.ts` | Overlapping audit surfaces for the queue module. | Diff and consolidate in a follow-up; do not touch this sprint. |
| `src/lib/systemSelfAudit.ts` vs `src/pages/expenses/ExpenseSelfAudit.tsx` and `src/pages/queue/QueueAudit.tsx` | Each self-audit view has its own helper; consider a common `runSelfAudit(scope)`. | Follow-up refactor; risk = medium. |
| `src/components/CanExport.tsx` vs `src/components/Can.tsx` | Two permission wrappers with overlapping API. | Retained: they encode different guards (route vs export). **Keep**. |

## Superseded documentation

| Doc series | Superseded by | Action |
|-----------|---------------|--------|
| `docs/auth/BUSINESS_AUTHORIZATION_V3*.md` … `V13*.md` | `docs/auth/BUSINESS_AUTHORIZATION_V14_*.md` | Retain until Permission Consolidation Phase D, then move under `docs/archive/auth/`. |
| `docs/normalization/N1..N9_*.md` | `docs/auth/BUSINESS_AUTHORIZATION_V14_*.md` | Archive after Phase D. |
| `docs/wave3*/` (a/b/c/d/e) | Wave completed; content still referenced by architects. | Archive after Phase D. |
| `docs/governance/A0..A3_*.md`, `docs/governance/V1_RC1_ADVERSARIAL_REVIEW.md` | Historical governance records. | Archive after Phase D. |
| `docs/execution/BA01*`, `BA02*` | Ratified into V11+. | Archive after Phase D. |

## Obsolete workflows

None. Sprint 2 already consolidated shadow-QA workflows. The new
Sprint 4 additions (`dependabot.yml`, `codeql.yml`) do not conflict
with existing workflows.

## Unused components / pages

- No orphan pages detected (`src/pages/*` all mount via
  `src/App.tsx`).
- No `*Old*` / `*Legacy*` files under `src/`.

## Recommendations

- **Do not delete anything this sprint.** Retention of historical
  documentation is cheap; deletion is irreversible in a way that
  breaks external doc links and audit trails.
- After Permission Consolidation Phase D, execute a single dedicated
  "docs archive" PR that moves the flagged doc series into
  `docs/archive/…` (a `git mv`, not a delete), preserving history.
