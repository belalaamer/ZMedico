# RC1 — Disaster Recovery Checklist

Scope: full production outage or data corruption event.

- [ ] Declare incident; open bridge; assign Incident Commander.
- [ ] Freeze writes if data corruption suspected (disable app in
      Lovable / rotate keys to block traffic).
- [ ] Identify last known-good database snapshot; validate its
      timestamp against the corruption window.
- [ ] Restore snapshot to a staging project; validate row counts
      and sample records for critical tables (patients, invoices,
      appointments, payments, user_roles).
- [ ] Cut over restored database if validation passes.
- [ ] Redeploy last known-good frontend + edge-function revisions.
- [ ] Verify auth login, dashboard, invoice creation, PDF
      generation, and cron execution.
- [ ] Post-incident: publish a 5-whys summary within 72 hours.
