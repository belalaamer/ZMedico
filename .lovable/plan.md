
# Automated Communication v1 — Final Plan

Scope: 3 events only — `booking_confirmation`, `appointment_reminder`, `win_back`. Status-tracked via existing `public.reminders`. No marketing suite, no segmentation, no provider abstraction changes.

## Decisions locked
- Win-back: at most one per patient per calendar month.
- Channel: send only on the channel configured on the matching template row (no automatic fallback).
- Reschedule/cancel: auto-cancel pending `appointment_reminder` rows and re-enqueue at the new time (skip re-enqueue when appointment cancelled/no_show).
- Cron: `send-reminder` every 5 min; `enqueue-winback` daily 09:00 UTC.

## Sanity checks the user asked for

**1) Timezone of the monthly win-back uniqueness.**
`scheduled_time` is `timestamptz`, so `date_trunc('month', scheduled_time)` evaluates in the session timezone — non-deterministic for a unique index. Fix: add a generated column on `reminders`:

```sql
winback_month date GENERATED ALWAYS AS (
  CASE WHEN event_type = 'win_back'
       THEN (date_trunc('month', scheduled_time AT TIME ZONE 'UTC'))::date
  END
) STORED
```

Then `UNIQUE (patient_id, winback_month) WHERE event_type = 'win_back' AND patient_id IS NOT NULL`.
UTC is used deterministically; clinic-local boundary drift is at most a few hours, acceptable for a "once per month" guard and documented. A future per-branch `winback_tz` can replace `'UTC'` without changing call sites.

**2) Storing the resolved destination phone for auditability.**
Yes — add `destination_phone text` and `destination_channel text` (mirrors `reminder_type` at enqueue time; both kept because patient phone can change after the row is created). Populated by enqueue triggers/function from `patients.phone`, and overwritten by `send-reminder` right before dispatch with the actual phone used. Lets ops verify what number was contacted even if the patient row is later edited.

## Schema (single migration)

`reminders` additions:
- `event_type text` check in `('booking_confirmation','appointment_reminder','win_back','manual')` default `'manual'`
- `template_key text null`
- `payload jsonb not null default '{}'::jsonb` (snapshot: patient name, appt time formatted, clinic name)
- `destination_phone text null`
- `destination_channel text null`
- `winback_month date` (generated, see above)

Indexes:
- `UNIQUE (appointment_id, event_type, scheduled_time) WHERE appointment_id IS NOT NULL AND event_type IN ('booking_confirmation','appointment_reminder')` — idempotent enqueue + safe re-run.
- `UNIQUE (patient_id, winback_month) WHERE event_type='win_back' AND patient_id IS NOT NULL` — monthly cap.
- `(status, scheduled_time)` for due-poller efficiency.

New `communication_templates`:
- `branch_id`, `event_type`, `channel` (`whatsapp|sms|email`), `enabled bool`, `body_en text`, `body_ar text`, `hours_before int null` (only for `appointment_reminder`).
- `UNIQUE (branch_id, event_type, channel, COALESCE(hours_before,-1))`.
- Standard authenticated RLS via `branch_id` membership.

`notification_settings` additions:
- `winback_enabled bool default false`
- `winback_inactive_days int default 120 check >0`

## Triggers (Postgres)

- `trg_enqueue_on_booking` `AFTER INSERT ON appointments`:
  for each enabled (event_type, channel, hours_before) template row in the appointment's branch:
  - if `event_type='booking_confirmation'` → insert reminder at `now()`.
  - if `event_type='appointment_reminder'` → for each `hours_before` (template row), insert at `scheduled_at - hours_before*interval '1h'`.
  Skip insert if `scheduled_at - hours <= now()` (already past). All inserts use `ON CONFLICT DO NOTHING` via the unique index.

- `trg_reschedule_or_cancel` `AFTER UPDATE OF scheduled_at, status ON appointments`:
  - If `status` changed to `cancelled`/`no_show` OR `scheduled_at` changed: `UPDATE reminders SET status='cancelled' WHERE appointment_id=NEW.id AND status='pending' AND event_type='appointment_reminder'`.
  - If still active (status in scheduled/confirmed/etc) and `scheduled_at` changed: re-run enqueue loop for `appointment_reminder` rows at the new time. `booking_confirmation` is left alone.

Triggers resolve templates per branch and copy `body_en/ar` (rendered with payload placeholders `{{patient_name}}`, `{{appt_time}}`, `{{clinic}}`) into `message_en/ar`, and set `destination_phone` from `patients.phone`, `destination_channel` from template `channel`, `reminder_type` from template `channel`. If no enabled template exists for an event/channel, nothing is enqueued (intentional — admin opts in by creating a template).

## Edge functions

- `send-reminder` (existing): two small additions only — write back `destination_phone` actually used; treat per-row `reminder_type` as the channel (already does). No fallback logic.
- `enqueue-winback` (new, JWT-validated, called by cron with service role): for each branch where `winback_enabled`, find patients in that branch with `max(appointments.scheduled_at) < now() - winback_inactive_days` (or never), insert one `win_back` reminder per (patient, channel from enabled win-back template), `scheduled_time = now()`. Uses `ON CONFLICT DO NOTHING` against the monthly unique index.

## Cron (run via `supabase--insert`, NOT migration — contains project URL + anon key)

```
*/5 * * * *   → POST /functions/v1/send-reminder  { "due_only": true }
0   9 * * *   → POST /functions/v1/enqueue-winback {}
```

Enables `pg_cron` + `pg_net` if not already on.

## Frontend

- New page `src/pages/settings/AutomatedCommunication.tsx` under Settings: three sections (booking_confirmation, appointment_reminder, win_back), per-branch template editor (channel + EN/AR body + enabled + hours_before for reminder), win-back toggle + inactivity days input. Reuses existing `ScheduledReminders` page for the audit log (already shows status/sent_at/error).
- Sidebar link to the new settings page (settings module).
- i18n keys for labels.

No changes to Treasury, Wallet, Insurance, Inventory, HR, Sidebar architecture, RecordPaymentDialog, or appointment create dialog UI.

## Affected files

Migration (new): `supabase/migrations/<ts>_automated_comm_v1.sql` — schema + triggers.
Cron seed (via `supabase--insert`): pg_cron jobs.
Edge functions:
- `supabase/functions/send-reminder/index.ts` (small patch: write back destination_phone)
- `supabase/functions/enqueue-winback/index.ts` (new)
Frontend:
- `src/pages/settings/AutomatedCommunication.tsx` (new)
- `src/App.tsx` (route)
- `src/pages/settings/SettingsLayout.tsx` (nav entry)
- `src/lib/i18n.ts` (EN/AR keys)

## Order of execution

1. Apply migration (await approval).
2. Patch `send-reminder`, deploy `enqueue-winback`.
3. Seed cron via `supabase--insert`.
4. Add settings page + route + i18n.
5. Post-implementation self-audit.
