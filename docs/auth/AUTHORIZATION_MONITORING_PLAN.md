# Authorization Monitoring Plan

Cadence for observing the canonical runtime while legacy remains
available. All checks are read-only; no runtime changes are made
by this document.

---

## Cadences

### Daily

- Shadow probe results (`patients`, `medical`, `hr`, `invoices`,
  `settings`): expect zero drift rows.
- Edge Function authorization failures: no new signatures.
- Authorization error rate (client + edge): within KPI target.
- Unexpected denies: no spikes vs 7-day baseline.

### Weekly

- Permission drift report (canonical vs legacy effective grants)
  per role — expect 0 diffs.
- Unexpected grants review: canonical bundles must not have grown
  beyond legacy sets.
- Permission cache metrics: refresh count, fingerprint change
  count, average lookup latency.
- RLS denial trend by table.
- Audit-log spot check: sample 10 privileged actions and confirm
  authorization decision matches audit outcome.

### Release

- Full Playwright authorization suite green (`rbac.spec.ts`,
  `rbac.deep.spec.ts`, all `*.shadow.spec.ts`).
- Vitest parity suites green (`canonicalPermissions.test.ts`,
  `Can.parity.test.tsx`).
- Manual smoke: one gated route + one gated action per role.
- KPI snapshot appended to the release notes.

### Monthly

- Bundle-vs-legacy diff re-run and archived.
- Rollback drill on staging: flip flag, verify legacy behavior,
  flip back.
- Review of any authorization incident tickets opened in the month.
- Verify shadow probe coverage still matches route inventory.

---

## Checks

| Check | Signal | Alert threshold |
| --- | --- | --- |
| Permission drift | shadow probe diff count | > 0 |
| Unexpected denies | client deny rate vs 7-day baseline | > 2σ |
| Unexpected grants | canonical set ⊋ legacy set | any occurrence |
| Shadow probe health | probe success rate | < 100% |
| Authorization errors | `fetchCanonicalPermissions` errors | > 0.1% |
| Permission cache | fingerprint churn | > 10× baseline |
| Audit logs | privileged action without matching decision | any |
| RLS failures | denial spike per table | > 3σ |
| Edge Fn authz failures | 401/403 rate on `admin-*` | > 1% |

All alerts route to the on-call channel and trigger
`ROLLBACK_PLAYBOOK.md` evaluation.
