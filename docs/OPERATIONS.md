# ZMedico — Operations Runbook

Everything an operator or a new developer needs to run this system. Written for
someone who has never seen it before.

- **Frontend:** Vite + React SPA served by a Cloudflare Worker (`zmedico2`)
- **Backend:** Supabase project `rqcmnfzfytyyicelvifk` (Postgres + Edge Functions)
- **Live URL:** https://zmedico2.belalaamer.workers.dev

---

## 1. Deploying

Deployment is automatic. Merging to `main` triggers `.github/workflows/deploy.yml`,
which builds, verifies the output, deploys with wrangler, then smoke-tests the
live site and fails loudly if it is not serving.

**Required repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token created from the "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | `680731310e517ec8426b771634e0b932` |

**Manual deploy** (fallback, from a machine with wrangler and repo access):

```bash
bun install --frozen-lockfile
bun run build          # tsc && vite build -> ./dist
wrangler deploy        # reads wrangler.toml
```

`wrangler.toml` is committed and mirrors the live worker. Do NOT add a second
config file (`wrangler.jsonc`) — wrangler refuses to start with two.

### Verifying a deploy actually shipped

A green pipeline is not proof. The asset filenames are content-hashed, so if the
bundle name did not change, the build output did not change:

```bash
curl -s https://zmedico2.belalaamer.workers.dev/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'
```

---

## 2. Database migrations

Migrations live in `supabase/migrations/` and are the source of truth. Lovable
also reads this folder, so **anything applied directly to the database must also
be committed here**, or the next Lovable-generated migration will be built on a
stale schema.

Write migrations to be **idempotent** (`IF NOT EXISTS`, `DROP ... IF EXISTS`
before `CREATE`), because they may be replayed.

**There is no automatic migration step in the deploy pipeline.** Schema changes
are applied deliberately, not as a side effect of shipping frontend code. That is
intentional: an automatic migration on every merge is how production data gets
destroyed by a bad merge.

### Rollback reality

Postgres cannot roll back DDL after it commits. There is no "undo deploy" for a
migration. Therefore:

1. Never write a destructive migration (`DROP COLUMN`, `DROP TABLE`, data
   `DELETE`) without a backup taken immediately before — see section 4.
2. Prefer additive changes: add a new column, migrate reads, drop the old one in
   a later, separate change once nothing reads it.
3. Test on a branch database first (section 6).

---

## 3. Health checks

### Financial regression suite

Run this after any change touching invoices, payments, or the treasury. It runs
entirely inside savepoints and **never mutates data**.

```sql
SELECT * FROM public.run_financial_regression_tests();
```

Every row must read `PASS`. A `FAIL` is a real regression. It covers the guard
rails (overpayment, payment on a cancelled invoice, negative totals,
zero-quantity items, ledger immutability), the happy paths (payment settles the
invoice and posts to treasury, voiding reverses it, an appointment enqueues
exactly 2 reminders, invoice numbers carry the branch code) and reconciliation of
the real books.

### Books reconciliation

```sql
-- paid_amount must equal the sum of live payments
SELECT i.id, i.invoice_number, i.paid_amount, COALESCE(SUM(p.amount),0) AS actual
FROM invoices i
LEFT JOIN payments p ON p.invoice_id = i.id AND p.deleted_at IS NULL
WHERE i.deleted_at IS NULL
GROUP BY i.id, i.invoice_number, i.paid_amount
HAVING COALESCE(i.paid_amount,0) <> COALESCE(SUM(p.amount),0);
```

### Browser errors

The app writes crashes to `client_errors` (no third-party service involved).

```sql
SELECT occurred_at, kind, message, url, component
FROM client_errors ORDER BY occurred_at DESC LIMIT 50;
```

Readable only with the `settings.export` permission, because a message can
incidentally contain a patient name. Prune old rows with
`SELECT public.prune_client_errors(90);`

### Scheduled reminders

pg_cron on this project **stopped executing on 2026-07-20** and a project restart
did not revive it — a platform-level fault. Reminders are therefore driven by
`.github/workflows/reminders.yml`, which calls the `send-reminder` Edge Function
every 15 minutes using the `SEND_REMINDER_CRON_SECRET` repository secret.

To confirm dispatch is working:

```sql
SELECT id, status_code, content, created
FROM net._http_response ORDER BY id DESC LIMIT 5;
```

`200` is healthy. `401` means the secret does not match the Edge Function secret
of the same name.

---

## 4. Backup and restore

Supabase takes automated daily backups; retention depends on the plan. Confirm
yours at **Dashboard → Database → Backups**. **Do not rely on this alone for a
clinical system** — take your own dump before any risky change.

```bash
# full logical backup (schema + data)
pg_dump "postgresql://postgres:<password>@db.rqcmnfzfytyyicelvifk.supabase.co:5432/postgres" \
  --no-owner --no-privileges -Fc -f zmedico-$(date +%F).dump

# restore into a NEW project or a branch database, never over production
pg_restore -d "<target-connection-string>" --no-owner --no-privileges zmedico-2026-08-04.dump
```

The connection string and password are in **Dashboard → Settings → Database**.
Treat that password as a secret: it grants full access to every patient record.

**Restore drill:** a backup you have never restored is not a backup. Restore into
a scratch project at least once, and confirm `patients`, `invoices` and
`treasury_transactions` row counts match.

Because the schema is append-only in places (`audit_logs`,
`treasury_transactions`, `client_errors` all refuse UPDATE and DELETE), a partial
data restore can fail where a full one succeeds. Restore whole, not piecemeal.

---

## 5. Onboarding a new clinic or branch

The system is branch-scoped, not multi-tenant at the data layer: all clinics
share one database and are separated by `branch_id` plus RLS. A genuinely
separate customer should get a **separate Supabase project**.

To add a **branch** to this deployment:

1. **Create the branch** and give it a `code` — this is mandatory. Invoice
   numbers are `INV-<CODE>-<YEAR>-<NNNN>` and the code is what keeps two
   branches' sequences from colliding on the unique `invoice_number`.

   ```sql
   INSERT INTO public.branches (name_en, name_ar, code, is_main_branch, is_active)
   VALUES ('Second Clinic', 'العيادة الثانية', 'SEC', false, true);
   ```

   A treasury row is created automatically by `trg_branch_ai`.

2. **Attach staff.** Access is granted by `staff_branches`, which is
   many-to-many — a person may work in several branches.

   ```sql
   INSERT INTO public.staff_branches (user_id, branch_id)
   VALUES ('<auth-user-id>', '<branch-id>');
   ```

   A staff member with **no** row here sees **nothing**, because the RESTRICTIVE
   `branch_isolation` policies deny every row. This exact gap took the whole
   system down once: 18 of 20 users had no row and every screen rendered empty
   with no error. `trg_staff_profile_branch_sync` now keeps this in step when a
   staff profile is created or moved, but verify after bulk changes:

   ```sql
   SELECT count(DISTINCT user_id) FROM staff_branches;   -- must equal
   SELECT count(DISTINCT user_id) FROM user_roles;       -- this
   ```

3. **Configure notifications** for the branch, or nothing will be sent:

   ```sql
   INSERT INTO public.notification_settings (branch_id, whatsapp_enabled, sms_enabled, winback_enabled)
   VALUES ('<branch-id>', false, false, false);
   ```

   Then add `communication_templates` rows for `booking_confirmation`,
   `appointment_reminder` (which requires `hours_before > 0`) and `win_back`, in
   both `body_en` and `body_ar`. Use `{{patient_name}}` and
   `{{patient_name_ar}}` placeholders. Enable the channels only once real
   provider credentials are entered via `/settings/communication`.

4. **Create users** through the app (`/settings/users`), which calls the
   `admin-create-user` Edge Function. Do not insert into `auth.users` by hand —
   the function also provisions the staff profile and rolls back cleanly on
   failure. Note it deliberately **cannot** create a `system_owner`.

---

## 6. Safe experimentation

Use a Supabase branch database rather than testing against production:

- `create_branch` applies all migrations to a fresh database. **Production data
  does not carry over**, so it is safe but empty.
- `merge_branch` promotes migrations and edge functions to production.
- `rebase_branch` pulls newer production migrations into the branch.

---

## 7. Known issues and deliberate decisions

| Item | Status |
|---|---|
| `pg_cron` does not execute on this project (since 2026-07-20) | Worked around via GitHub Actions. Worth a Supabase support ticket; likely the local libpq auth used when `cron.use_background_workers = off`. |
| TypeScript `strict` is off | `tsconfig.app.json` disables every strictness flag. Enabling it will surface real bugs and needs a dedicated cleanup pass. |
| `services` catalog is empty and unlinked | `invoice_items` has no FK to `services`, so revenue-by-service reporting is not possible without a data migration. |
| `xlsx@0.18.5` is unmaintained | Used for exports. Has known unpatched advisories. Migrate to `exceljs`. |
| Authz shadow-mode apparatus | The migration is complete (`VITE_AUTHZ_CANONICAL="true"`). ~33k rows in `authz_shadow_decisions` and the parity test files are now dead weight and can be retired. |
| Invoice numbers are immutable | Cancelling leaves a permanent gap in the sequence. This is intentional and correct: a reused number is an audit failure. |
| Dependabot major bumps | `vite 6→8`, `tailwind 3→4`, `recharts 2→3` were closed deliberately — each is breaking and there is no test coverage to catch the fallout. |

---

## 8. When something breaks

1. **Every screen is empty, no error shown.** Almost always branch access. Check
   `staff_branches` coverage (section 5, step 2). Historically this was also
   caused by missing table GRANTs — confirm with
   `SELECT has_table_privilege('authenticated','public.patients','SELECT');`
   which must return `true`.
2. **A screen shows zeros instead of an error.** Some screens still do
   `const { data } = await supabase...` without checking `error`, so a permission
   denial looks like "no data". Check the browser console and `client_errors`.
3. **Reminders are not sending.** Check `net._http_response` (section 3), then the
   `reminders.yml` run in the Actions tab, then whether
   `notification_settings.whatsapp_enabled` is actually `true` and provider
   credentials are set.
4. **A deploy "succeeded" but the site is unchanged.** Compare the bundle hash
   (section 1). If unchanged, the build step failed or produced no new output.
5. **Cannot create a staff user.** The `admin-create-user` Edge Function must be
   deployed. Verify with
   `curl -X POST https://rqcmnfzfytyyicelvifk.supabase.co/functions/v1/admin-create-user -H "apikey: <publishable-key>"`
   — a `401` means deployed and refusing an unauthorised caller (correct); a
   `404` means it is not deployed at all.
