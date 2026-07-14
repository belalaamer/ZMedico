# RC1 — Rollback Plan

Every RC1 deliverable is documentation-only, so RC1 itself is
reverted by `rm -rf docs/rc1/`. This plan covers the underlying
production rollback path.

## Frontend

- Use Lovable **Version History** on the project to revert to the
  last known-good published version. This is the primary
  frontend rollback lever.

## Edge Functions

- Redeploy the prior revision from the edge-function history for
  the affected function. `admin-*`, `send-reminder`, and
  `detect-queue-alerts` each maintain independent revision
  histories.

## Database

- Restore the pre-deploy manual snapshot recorded in the Deployment
  Checklist. Daily automatic snapshots are also available as a
  secondary lever.
- Do **not** attempt schema rollbacks by ad-hoc SQL; use the
  snapshot restore path.

## Secrets

- If a secret was rotated during the release and needs reverting,
  set the previous value via the secrets tool; edge functions pick
  it up on next invocation. No redeploy is required for most
  functions, but redeploy to force pickup if needed.

## Communication

- Notify the on-call channel and the ops group; state the trigger
  reason, current impact, chosen rollback lever, and expected
  recovery time. Update every 15 minutes until stable.
