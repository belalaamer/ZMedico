# RC1 — First-Week Monitoring Checklist

Perform daily for 7 days post-launch (compensates for deferred
Sentry / M1).

- [ ] Review edge-function logs for new error signatures.
- [ ] Review auth failure trends (invalid password, OAuth, rate
      limit).
- [ ] Review RLS denial trends per table; investigate spikes.
- [ ] Verify cron jobs ran on schedule.
- [ ] Verify daily backup snapshot created.
- [ ] Review Dependabot PRs; triage any advisory ≥ High.
- [ ] Confirm no user-reported PDF, printing, or invoice
      generation regressions.
- [ ] Log daily status in ops channel with green / yellow / red.
