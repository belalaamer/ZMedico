# Authorization Operation Runbook

Day-to-day operational procedures for the authorization stack while legacy remains available as fallback.

## Normal deployment

1. Merge to main; CI runs Vitest + Playwright authorization suites.
2. Confirm all authorization suites green.
3. Deploy to staging; smoke gated routes for one representative role.
4. Deploy to production during a low-traffic window.
5. Snapshot KPIs and append to release notes.

## Enabling the canonical feature flag

1. Confirm parity report (`PHASE_B_FINAL_VALIDATION.md`) still valid — re-run per-role diff.
2. Set `VITE_AUTHZ_CANONICAL=true` in the target environment.
3. Deploy; execute the cutover checklist from `CANONICAL_ACTIVATION_PLAN.md` Stage 3.
4. Hold on-call for 24 hours; monitor per `AUTHORIZATION_MONITORING_PLAN.md`.

## Monitoring

Follow `AUTHORIZATION_MONITORING_PLAN.md`. Daily and weekly checks are owned by on-call; monthly checks by the engineering owner.

## Incident response

1. Detect (alert, user report, probe failure).
2. Triage: classify as drift, denial, grant, error, or RLS.
3. Follow `ROLLBACK_PLAYBOOK.md` if severity ≥ P2 or any privilege drift is observed.
4. Open incident ticket; assign owner; communicate status every 15 minutes until stable.

## Emergency rollback

See `ROLLBACK_PLAYBOOK.md`. Feature-flag flip is the primary lever. Do not attempt schema or RLS rollbacks in an authorization incident — the canonical path is data-only from a runtime perspective.

## Release checklist

- [ ] Vitest suite green (including `canonicalPermissions.test.ts`, `Can.parity.test.tsx`).
- [ ] Playwright authorization suites green.
- [ ] Shadow probe run archived.
- [ ] KPI snapshot attached to release notes.
- [ ] Feature-flag state documented (on / off per environment).
- [ ] Rollback lever confirmed operational.
- [ ] On-call assigned for 24-hour window post-deploy.
