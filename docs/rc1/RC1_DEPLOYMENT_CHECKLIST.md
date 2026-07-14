# RC1 — Deployment Checklist

Source of truth: `docs/final/PRODUCTION_DEPLOYMENT_GUIDE.md`. This
checklist is the operator-facing cut-over subset.

## Pre-deploy

- [ ] Confirm `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
      `VITE_SUPABASE_PROJECT_ID` present in `.env`.
- [ ] Confirm no `service_role` key in `src/*` (`rg service_role src`).
- [ ] Confirm `CRON_SECRET` set in runtime secrets for
      `detect-queue-alerts`.
- [ ] Confirm reminder-provider secrets (WhatsApp/SMS) present or
      reminder feature explicitly disabled.
- [ ] Confirm Google OAuth redirect allow-list includes
      `belalaamer.com` and `www.belalaamer.com`.
- [ ] Confirm Password HIBP check is enabled.
- [ ] Take manual database snapshot; record snapshot ID.
- [ ] Confirm latest edge-function deployment revision recorded.

## Deploy

- [ ] Click Publish → Update in Lovable.
- [ ] Wait for deployment to report success.

## Post-deploy smoke (within 15 min)

- [ ] Login (email/password + Google).
- [ ] Load Dashboard, Patients (page 2), Invoices (page 2),
      Calendar.
- [ ] Create a test appointment; delete it.
- [ ] Generate one invoice PDF; verify download.
- [ ] Verify `detect-queue-alerts` cron ran successfully within the
      previous hour (edge-function logs).
- [ ] Browser smoke across Chrome, Edge, Safari, Firefox, iOS
      Safari, Android Chrome per
      `docs/final/PRODUCTION_DEPLOYMENT_GUIDE.md` §2.3.
