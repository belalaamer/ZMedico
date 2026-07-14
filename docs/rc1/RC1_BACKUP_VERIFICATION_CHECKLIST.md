# RC1 — Backup Verification Checklist

Cadence: weekly during the first month post-launch; monthly
thereafter.

- [ ] Confirm daily automatic snapshots exist for the last 7 days.
- [ ] Confirm the latest manual snapshot (if any) is < 30 days old.
- [ ] Restore the latest daily snapshot into a scratch project.
- [ ] Verify row counts for: `patients`, `invoices`, `appointments`,
      `payments`, `user_roles`, `role_permissions`.
- [ ] Verify one patient record matches production values.
- [ ] Delete the scratch project after verification.
- [ ] Record verification timestamp + operator in the ops log.
