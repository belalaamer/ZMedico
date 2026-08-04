# Renting ZMedico to other clinics — tenancy model

Read this before onboarding a paying clinic. It is the difference between a
sellable product and a patient-data breach.

## The core fact

Clinical data in this system is scoped by **branch**, not by tenant.

```
tables carrying tenant_id : 5    (saas_invoices, saas_payments, subscriptions,
                                  tenant_addons, tenant_usage — billing only)
tables carrying branch_id : 43   (patients, appointments, invoices, payments,
                                  treasury, medical records, physio, HR, ...)
```

The SaaS billing layer knows about tenants. **No clinical table does.** So a
second clinic added to this deployment is a *branch*, sharing every table with
the first clinic, separated only by RLS.

## What was fixed, and what it does not fix

`user_has_branch_access()` used to grant a blanket bypass to any `admin`. Since
every clinic needs its own admin, that meant a tenant's admin could read every
other tenant's patients — demonstrated, not theorised. It is now
`system_owner`-only.

That closes the obvious hole. It does **not** make the system multi-tenant:

- Every clinic's PHI still sits in the same tables. One future RLS mistake, one
  new `SECURITY DEFINER` function that forgets a branch check, one migration
  written on a tired evening, and the data crosses.
- One `service_role` key exists for the whole deployment. Any Edge Function
  using it sees all tenants unless it filters manually. `admin-export` already
  does exactly this.
- A restore is all-or-nothing. You cannot restore Clinic A to yesterday without
  also rolling back Clinic B.
- `branches`, `subscription_plans`, `services`, `diagnoses`, `procedures` and the
  other catalogue tables are shared, so one clinic's configuration is visible to
  the others.

## The three options

### Option A — one Supabase project per clinic (recommended)

Each clinic gets its own Supabase project and its own worker (or one worker with
per-domain configuration). Same codebase, same migrations, separate databases.

- **Isolation:** absolute. Different databases, different credentials. A bug in
  RLS cannot leak across clinics because there is nothing to leak to.
- **Restore:** per clinic, independently.
- **Cost:** one Supabase project per clinic. Small clinics may fit the free
  tier; budget for Pro per clinic once they carry real data.
- **Effort to start:** none in the code. It is an onboarding procedure.
- **Ongoing cost:** every migration must be applied to every project. Keep them
  on one branch of `supabase/migrations` and apply in order. Past ~10-15 clinics
  this becomes the dominant chore and is the signal to move to Option B.

This is where to start. It is defensible to a clinic that asks "who else can see
my patients" — the answer is "nobody, your database is yours".

### Option B — true multi-tenancy

Add `tenant_id` to all 43 operational tables, backfill it, add it to every
index, rewrite the ~325 RLS policies to filter on it, and audit every
`SECURITY DEFINER` function and Edge Function for tenant scoping.

- **Isolation:** good if executed perfectly. The risk is entirely in the
  execution.
- **Effort:** weeks, and it touches every financial and clinical query in the
  product. It needs test coverage that does not exist yet.
- **When it is right:** at a scale where per-project operations hurt more than
  this migration does. Not at clinic number two.

### Option C — branches as tenants

What the system does today. **Do not use this for independent clinics.** It is
correct for one business with several locations — which is what it was built
for — because everyone there works for the same data controller.

## Onboarding checklist for Option A

1. Create a Supabase project for the clinic. Record its project ref.
2. Apply all migrations from `supabase/migrations` in filename order.
3. Deploy all Edge Functions.
4. Set the Edge Function secrets, including `SEND_REMINDER_CRON_SECRET`.
5. Seed: one `branches` row with a `code` (mandatory — invoice numbers are
   `INV-<CODE>-<YEAR>-<NNNN>` and the code prevents collisions), one
   `notification_settings` row, `communication_templates` for
   `booking_confirmation`, `appointment_reminder` and `win_back` in Arabic and
   English.
6. Create the clinic's first admin through the app, not by hand.
7. Assign exactly one `system_owner` — you. Do not give the clinic one.
8. Build and deploy the frontend with that project's `VITE_SUPABASE_*` values.
9. Add the clinic to your own billing records (`tenants`, `subscriptions`).
10. Run `SELECT * FROM public.run_financial_regression_tests();` — 12/12 before
    handover.
11. Take a baseline backup and confirm you can restore it.

## Non-technical work this needs

Technical isolation is necessary and not sufficient.

- **Data protection agreement.** Each clinic is the data controller of its
  patients; you are the processor. Put in writing what you may access, how long
  data is retained, what happens on termination, and your breach-notification
  duty. Egypt's Personal Data Protection Law (151/2018) applies, and health data
  is a special category.
- **Termination and export.** A clinic must be able to leave with its data. For
  Option A this is a `pg_dump` handed over; write down the commitment.
- **Backup and restore commitment.** State the frequency and the recovery point
  you actually offer, and prove it with a restore drill.
- **Support expectations.** Response times, hours, and what counts as an
  emergency. Without this, every clinic assumes 24/7.
- **Upgrade policy.** With Option A each clinic runs its own database. Decide
  whether all clinics upgrade together and how you notify them.
- **Billing.** `subscription_plans` has three plans and `saas_invoices` exists,
  but nothing collects money. Decide the mechanism before the first invoice is
  due.
- **Per-clinic identity.** Clinics will want their own name and logo on printed
  invoices. `clinic_profile` exists per project under Option A, so this is
  straightforward there and much harder under Option C.

## Before the first paying clinic

Blockers, in order:

1. Choose Option A and write the onboarding down as a repeatable script.
2. Prove a restore. A backup you have never restored is not a backup.
3. Sign a data-processing agreement.
4. Add test coverage around money. `run_financial_regression_tests()` is a
   start; a clinic's accountant will find what it does not cover.
5. Turn on error monitoring per clinic. `client_errors` is per-project under
   Option A, which is what you want.
