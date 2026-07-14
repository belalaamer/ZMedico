# RC1 — Post-Deployment Checklist (first 24 h)

- [ ] Hour 0: smoke complete, ops log updated.
- [ ] Hour +1: review edge-function logs for errors / non-2xx spikes.
- [ ] Hour +4: review auth failures, RLS denials, and edge-function
      latency.
- [ ] Hour +8: verify `detect-queue-alerts` has run twice
      successfully.
- [ ] Hour +12: verify daily backup snapshot created after cut-over.
- [ ] Hour +24: publish a short "first-day" status to the ops group
      (green / yellow / red + open items).
