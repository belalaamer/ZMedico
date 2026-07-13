# CI Hardening Report

Goal: add safe, non-runtime CI improvements. Only additions that
*cannot* change runtime behavior of the deployed application are
shipped in this sprint.

## Shipped changes

### 1. Dependabot — `.github/dependabot.yml`
- Weekly grouped updates for `npm` (minor + patch) and
  `github-actions`.
- **Runtime impact**: none. Dependabot opens PRs only; humans review
  and merge.
- **Rollback**: delete the file.

### 2. CodeQL — `.github/workflows/codeql.yml`
- JavaScript/TypeScript, `security-and-quality` query suite.
- Runs on push to `main`, PRs to `main`, and weekly on Monday 06:00
  UTC.
- **Runtime impact**: none. SARIF is uploaded to the GitHub Security
  tab. Not configured as a required check, so a finding does not
  block merges.
- **Rollback**: delete the workflow file.

## Documented but not shipped

### `pnpm audit`
- The project uses **npm/bun** lockfiles, not pnpm. Adding a `pnpm
  audit` job would require adopting pnpm.
- **Recommendation**: use `npm audit --audit-level=high` inside a
  future CI job **only after** confirming it does not fail the build
  on transient advisories. Alternative: `bun audit` once its output
  format stabilises. Not shipped in Sprint 4 to avoid a required
  check that regularly blocks unrelated PRs.

### CSP + Security Headers
- Deferred (already documented in Sprint 2 report). Hosting-layer
  change, out of scope.

### Required-status enforcement
- Adding branch-protection rules for CodeQL / shadow-QA is a repo
  policy change, not a CI change. Recommended after a two-week
  observation window on CodeQL results.

## Risk assessment

| Change | Likelihood of regression | Blast radius |
|--------|-------------------------|--------------|
| Dependabot | None (no code change) | None |
| CodeQL | None (read-only) | None |

## Backward compatibility

- No workflow triggers replace or override existing workflows.
- No secret usage introduced.
- No permission escalation (CodeQL requests only
  `security-events: write`).

## Rollback

```bash
git rm .github/dependabot.yml
git rm .github/workflows/codeql.yml
```

No further remediation required.
