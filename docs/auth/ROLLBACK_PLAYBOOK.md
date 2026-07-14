# Authorization Rollback Playbook

Instant rollback path from canonical runtime to legacy. Operational reference during an authorization incident.

## Symptoms that trigger evaluation

- Shadow probe drift > 0.
- Spike in unexpected denies (users report "access denied" on previously-working routes).
- Spike in unexpected grants (users see modules they should not).
- Elevated `fetchCanonicalPermissions` error rate (> 0.1%).
- RLS denial spike correlated with the canonical deploy.
- Any privilege escalation report from users, QA, or security.

## Immediate actions (first 5 minutes)

1. Acknowledge alert in ops channel; page on-call.
2. Freeze deploys.
3. Snapshot current KPI dashboard and shadow probe output.
4. Decide: rollback vs. investigate-in-place. Default to rollback if any privilege drift or > 5 minutes of red KPI.

## Feature-flag rollback

**Preferred path — no deploy required.**

1. Set the production build variable `VITE_AUTHZ_CANONICAL=false` and trigger a redeploy of the frontend, OR
2. For an urgent single-tab test, use `localStorage.setItem("authz_canonical","false")` in the affected browser.

Rollback takes effect on next page load. `usePermissions` reverts to `loadLegacy()`; `AuthorizationService` continues to consume `usePermissions().can` transparently.

## Verification (post-rollback)

- Confirm the build serves with the flag off.
- Re-run shadow probes: expect zero drift on the legacy baseline.
- Smoke test: one gated route + one gated action per role.
- Confirm affected users regain / lose the expected access.
- Watch KPI dashboard for 30 minutes.

## Recovery

- Diagnose the canonical-side root cause (bundle drift, view regression, RPC failure, cache issue).
- Fix via data repair or code patch on a branch; run the full authorization test suite.
- Re-enable canonical in staging first; observe one release cycle before re-enabling in production.
- Restart the 30-day retirement counter from zero.

## Postmortem checklist

- [ ] Timeline reconstructed (detection → rollback → recovery).
- [ ] Root cause identified and documented.
- [ ] Affected users / actions enumerated.
- [ ] Data-repair or code-fix diff attached.
- [ ] Test additions committed (parity, shadow, or Playwright).
- [ ] Monitoring gap (if any) closed.
- [ ] Retirement counter reset noted in `LEGACY_RETIREMENT_CRITERIA.md` tracker.
- [ ] Postmortem reviewed by engineering + operations owners.
