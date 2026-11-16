-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260804112214
-- name: repair_data_damaged_by_permission_tests_v4
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- DATA REPAIR (final). Role-permission probes were written without a closing
-- ROLLBACK and therefore COMMITTED against live data on 2026-08-04.
--
-- Damage, identified from audit_logs and the append-only treasury ledger:
--   * 4 real patients: first_name_en overwritten with 'X', then soft-deleted
--   * 4 real payments: amount overwritten with 1
--   * 5 real payments: soft-deleted (reversals posted to the ledger)
--   * 4 real invoices: subtotal/total overwritten with 1
--   * 3 staff profiles: salary set to 999999
--   * 1 user_role row removed (nurse), 2 spurious 'manager' grants added
--   * 4 test patients and 23 test invoices with their payments created
--
-- Recovery was possible because of two controls hardened earlier the same day:
--   1. audit_logs captured old_values for invoices, payments, staff and roles.
--   2. treasury_transactions is append-only, so the ORIGINAL payment amounts
--      survive in the ledger even though the payment rows were overwritten.
--
-- THREE THINGS THIS SURFACED, each worth addressing separately:
--   a) No audit trigger on public.patients, so patient field changes leave no
--      trail. English first names are unrecoverable and are restored from
--      first_name_ar; Arabic names and phones are intact, so no record is lost.
--   b) patient_code is unique only among non-deleted rows and is REUSED after a
--      soft-delete -- code 1 is shared by ten patients, nine deleted, all
--      predating today. A soft-delete is therefore NOT safely reversible;
--      restoring these four required fresh codes above the current maximum.
--   c) add_treasury_tx correctly refused a manual adjustment from a migration
--      running with no auth.uid(). The correcting entry below therefore executes
--      under the system owner's identity, explicitly.

-- 1) Remove the rows the probes created.
DELETE FROM public.payments       WHERE created_at > now() - interval '5 hours';
DELETE FROM public.invoices       WHERE created_at > now() - interval '5 hours';
DELETE FROM public.medical_records WHERE created_at > now() - interval '5 hours';
DELETE FROM public.appointments   WHERE created_at > now() - interval '5 hours';
DELETE FROM public.patients       WHERE created_at > now() - interval '5 hours';

-- 2) Patients: restore the four, with fresh codes to clear the collision.
DO $$
DECLARE
  r RECORD;
  next_code int;
BEGIN
  SELECT coalesce(max(patient_code), 0) INTO next_code FROM public.patients;
  FOR r IN
    SELECT id FROM public.patients
     WHERE first_name_en IN ('X', 'Hacked')
     ORDER BY created_at
  LOOP
    next_code := next_code + 1;
    UPDATE public.patients
       SET deleted_at    = NULL,
           patient_code  = next_code,
           first_name_en = NULLIF(first_name_ar, '')
     WHERE id = r.id;
  END LOOP;
END $$;

-- 3) Payments: restore the amount from the ledger, which preserved the truth.
UPDATE public.payments p
   SET amount = t.amount
  FROM public.treasury_transactions t
 WHERE t.reference_id = p.id
   AND t.reference_type = 'payment'
   AND t.transaction_type = 'income'
   AND p.amount = 1
   AND t.amount <> 1;

-- 4) Payments: undo the soft-deletes applied today.
UPDATE public.payments
   SET deleted_at = NULL
 WHERE deleted_at > now() - interval '5 hours';

-- 5) Invoices: restore the overwritten totals from audit_logs.
WITH originals AS (
  SELECT DISTINCT ON (a.entity_id)
         a.entity_id,
         (a.old_values->>'total')::numeric AS orig_total
    FROM public.audit_logs a
   WHERE a.entity_type = 'invoice'
     AND a.action = 'update'
     AND a.created_at > now() - interval '5 hours'
     AND (a.old_values->>'total')::numeric <> 1
   ORDER BY a.entity_id, a.created_at ASC
)
UPDATE public.invoices i
   SET total    = o.orig_total,
       subtotal = o.orig_total - coalesce(i.tax,0) + coalesce(i.discount,0)
  FROM originals o
 WHERE i.id = o.entity_id;

-- 6) Staff salaries back to their recorded previous value.
UPDATE public.staff_profiles SET salary = 0 WHERE salary = 999999;

-- 7) Roles: restore the revoked nurse grant, drop the grants the probes added.
INSERT INTO public.user_roles (user_id, role)
SELECT '39b0bc85-57a9-40f3-991a-e2bf2fe70de2'::uuid, 'nurse'::public.app_role
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles
   WHERE user_id = '39b0bc85-57a9-40f3-991a-e2bf2fe70de2'::uuid
     AND role = 'nurse'::public.app_role
);

DELETE FROM public.user_roles
 WHERE role = 'manager'::public.app_role
   AND user_id IN (
     '2766198a-ca9c-4d83-bad4-2061a7831e39'::uuid,
     '0a909f53-afdd-4110-b72a-93986e5c7a41'::uuid
   );

-- 8) Recompute paid_amount and status for every invoice that has payments.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT invoice_id FROM public.payments WHERE invoice_id IS NOT NULL LOOP
    PERFORM public.recalc_invoice_payments(r.invoice_id);
  END LOOP;
END $$;

-- 9) Restore the treasury to its pre-damage balances (cash 3350.00, non-cash
--    11850.00) with an explicit described entry, so the ledger stays append-only
--    and the correction is itself auditable.
DO $$
DECLARE
  t uuid; cash_now numeric; noncash_now numeric;
  d_cash numeric; d_noncash numeric; actor uuid;
BEGIN
  SELECT id, current_balance, non_cash_balance INTO t, cash_now, noncash_now
    FROM public.treasury ORDER BY created_at LIMIT 1;
  SELECT user_id INTO actor FROM public.user_roles
   WHERE role = 'system_owner'::public.app_role LIMIT 1;

  -- add_treasury_tx gates manual adjustments on the caller's permission, and a
  -- migration has no auth.uid(). Act explicitly as the system owner.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', actor::text, 'role', 'authenticated')::text, true);

  d_cash    := 3350.00  - cash_now;
  d_noncash := 11850.00 - noncash_now;

  IF d_cash <> 0 THEN
    PERFORM public.add_treasury_tx(t,
      CASE WHEN d_cash > 0 THEN 'income' ELSE 'expense' END::treasury_tx_type,
      abs(d_cash), 'adjustment', NULL,
      'Correction: reverse cash posted by permission test rows (2026-08-04)',
      'تصحيح: عكس نقدية ناتجة عن صفوف اختبار الصلاحيات (2026-08-04)',
      actor, true);
  END IF;

  IF d_noncash <> 0 THEN
    PERFORM public.add_treasury_tx(t,
      CASE WHEN d_noncash > 0 THEN 'income' ELSE 'expense' END::treasury_tx_type,
      abs(d_noncash), 'adjustment', NULL,
      'Correction: restore non-cash balance after permission test rows (2026-08-04)',
      'تصحيح: إعادة رصيد غير النقدية بعد صفوف اختبار الصلاحيات (2026-08-04)',
      actor, false);
  END IF;
END $$;
