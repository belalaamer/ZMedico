-- Fix the fixture behind test #8 of public.run_financial_regression_tests().
--
-- Test #8 used to pick its branch with an unordered LIMIT 1 and to insert the
-- temporary patient with whatsapp_opt_in = false. When the picked branch had an
-- enabled reminder template, the templated path skipped every WhatsApp row and
-- the test reported "got 0 reminders" even though the triggers were healthy.
--
-- This migration rewrites ONLY public.run_financial_regression_tests():
--   1. branch selection is deterministic: ORDER BY name_en NULLS LAST, id;
--   2. the temporary patient opts in to WhatsApp;
--   3. the expected reminder count is computed from the selected branch's own
--      notification settings, templates, and reminder hours, mirroring both the
--      legacy and the templated producers, so the check stays honest and
--      returns PASS whenever the observed behaviour is correct.
-- No trigger, table, RLS policy, or other function is touched. CREATE OR
-- REPLACE preserves the existing owner and ACL.

BEGIN;

DO $preflight$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_financial_regression_tests';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'preflight: public.run_financial_regression_tests() is missing';
  END IF;
  IF md5(v_def) <> '68a9fdaba021d9dc558d8a402fe015e0' THEN
    RAISE EXCEPTION 'preflight: function definition drifted (md5 %); reconcile before applying', md5(v_def);
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.run_financial_regression_tests()
RETURNS TABLE(test text, result text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $suite$
DECLARE
  v_branch uuid;
  v_patient uuid;
  v_invoice uuid;
  v_appt uuid;
  v_n int;
  v_num text;
  v_cash_before numeric;
  v_cash_after numeric;
  v_noncash_before numeric;
  v_noncash_after numeric;
  v_status text;
  v_paid numeric;
BEGIN
  SELECT id INTO v_branch FROM public.branches WHERE is_main_branch ORDER BY name_en NULLS LAST, id LIMIT 1;

  ---------------------------------------------------------------- guard rails
  -- 1. Overpaying an invoice must be refused.
  BEGIN
    INSERT INTO public.patients (first_name_en, last_name_en, phone, branch_id)
      VALUES ('RegTest','Overpay','01000000000', v_branch) RETURNING id INTO v_patient;
    INSERT INTO public.invoices (patient_id, branch_id, invoice_date, subtotal, total)
      VALUES (v_patient, v_branch, current_date, 1000, 1000) RETURNING id INTO v_invoice;
    INSERT INTO public.payments (invoice_id, patient_id, branch_id, amount, payment_method, payment_date)
      VALUES (v_invoice, v_patient, v_branch, 5000, 'cash', current_date);
    RAISE EXCEPTION 'TEST_UNEXPECTED_SUCCESS';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%TEST_UNEXPECTED_SUCCESS%' THEN
        test := 'overpayment is blocked'; result := 'FAIL';
        detail := 'a 5000 payment was accepted against a 1000 invoice';
      ELSE
        test := 'overpayment is blocked'; result := 'PASS'; detail := left(SQLERRM, 90);
      END IF;
      RETURN NEXT;
  END;

  -- 2. Paying a cancelled invoice must be refused.
  BEGIN
    INSERT INTO public.patients (first_name_en, last_name_en, phone, branch_id)
      VALUES ('RegTest','Cancelled','01000000000', v_branch) RETURNING id INTO v_patient;
    INSERT INTO public.invoices (patient_id, branch_id, invoice_date, subtotal, total, status)
      VALUES (v_patient, v_branch, current_date, 1000, 1000, 'cancelled') RETURNING id INTO v_invoice;
    INSERT INTO public.payments (invoice_id, patient_id, branch_id, amount, payment_method, payment_date)
      VALUES (v_invoice, v_patient, v_branch, 100, 'cash', current_date);
    RAISE EXCEPTION 'TEST_UNEXPECTED_SUCCESS';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%TEST_UNEXPECTED_SUCCESS%' THEN
        test := 'payment on a cancelled invoice is blocked'; result := 'FAIL';
        detail := 'cash was accepted against a cancelled invoice';
      ELSE
        test := 'payment on a cancelled invoice is blocked'; result := 'PASS'; detail := left(SQLERRM, 90);
      END IF;
      RETURN NEXT;
  END;

  -- 3. A discount larger than the subtotal must not create a negative invoice.
  BEGIN
    INSERT INTO public.patients (first_name_en, last_name_en, phone, branch_id)
      VALUES ('RegTest','Negative','01000000000', v_branch) RETURNING id INTO v_patient;
    INSERT INTO public.invoices (patient_id, branch_id, invoice_date, subtotal, discount, total)
      VALUES (v_patient, v_branch, current_date, 500, 9999, -9499);
    RAISE EXCEPTION 'TEST_UNEXPECTED_SUCCESS';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%TEST_UNEXPECTED_SUCCESS%' THEN
        test := 'negative invoice total is blocked'; result := 'FAIL';
        detail := 'an invoice with a negative total was accepted';
      ELSE
        test := 'negative invoice total is blocked'; result := 'PASS'; detail := left(SQLERRM, 90);
      END IF;
      RETURN NEXT;
  END;

  -- 4. Zero-quantity line items must be refused.
  BEGIN
    INSERT INTO public.patients (first_name_en, last_name_en, phone, branch_id)
      VALUES ('RegTest','ZeroQty','01000000000', v_branch) RETURNING id INTO v_patient;
    INSERT INTO public.invoices (patient_id, branch_id, invoice_date, subtotal, total)
      VALUES (v_patient, v_branch, current_date, 0, 0) RETURNING id INTO v_invoice;
    INSERT INTO public.invoice_items (invoice_id, item_type, description_en, quantity, unit_price, total)
      VALUES (v_invoice, 'service', 'RegTest', 0, 500, 0);
    RAISE EXCEPTION 'TEST_UNEXPECTED_SUCCESS';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%TEST_UNEXPECTED_SUCCESS%' THEN
        test := 'zero-quantity line item is blocked'; result := 'FAIL';
        detail := 'a line item with quantity 0 was accepted';
      ELSE
        test := 'zero-quantity line item is blocked'; result := 'PASS'; detail := left(SQLERRM, 90);
      END IF;
      RETURN NEXT;
  END;

  -- 5. treasury_transactions must stay append-only.
  BEGIN
    UPDATE public.treasury_transactions SET amount = amount + 1
      WHERE id = (SELECT id FROM public.treasury_transactions LIMIT 1);
    RAISE EXCEPTION 'TEST_UNEXPECTED_SUCCESS';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%TEST_UNEXPECTED_SUCCESS%' THEN
        test := 'treasury ledger is append-only'; result := 'FAIL';
        detail := 'a treasury transaction was edited';
      ELSE
        test := 'treasury ledger is append-only'; result := 'PASS'; detail := left(SQLERRM, 90);
      END IF;
      RETURN NEXT;
  END;

  ------------------------------------------------------------- happy paths
  -- 6. A normal payment posts to treasury and settles the invoice.
  BEGIN
    -- add_treasury_tx() performs its own permission check, so the test must
    -- run under a real identity rather than the bare definer role.
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',(SELECT user_id FROM public.user_roles WHERE role::text='system_owner' LIMIT 1)::text,
                        'role','authenticated')::text, true);
    SELECT current_balance INTO v_cash_before FROM public.treasury WHERE branch_id = v_branch LIMIT 1;
    INSERT INTO public.patients (first_name_en, last_name_en, phone, branch_id)
      VALUES ('RegTest','HappyPay','01000000000', v_branch) RETURNING id INTO v_patient;
    INSERT INTO public.invoices (patient_id, branch_id, invoice_date, subtotal, total)
      VALUES (v_patient, v_branch, current_date, 300, 300) RETURNING id INTO v_invoice;
    INSERT INTO public.payments (invoice_id, patient_id, branch_id, amount, payment_method, payment_date)
      VALUES (v_invoice, v_patient, v_branch, 300, 'cash', current_date);

    SELECT status::text, coalesce(paid_amount,0) INTO v_status, v_paid
      FROM public.invoices WHERE id = v_invoice;
    SELECT current_balance INTO v_cash_after FROM public.treasury WHERE branch_id = v_branch LIMIT 1;

    IF v_status = 'paid' AND v_paid = 300 AND v_cash_after = v_cash_before + 300 THEN
      test := 'payment settles invoice and posts to treasury'; result := 'PASS';
      detail := format('status=%s paid=%s cash %s -> %s', v_status, v_paid, v_cash_before, v_cash_after);
    ELSE
      test := 'payment settles invoice and posts to treasury'; result := 'FAIL';
      detail := format('status=%s paid=%s cash %s -> %s', v_status, v_paid, v_cash_before, v_cash_after);
    END IF;
    RETURN NEXT;
    RAISE EXCEPTION 'TEST_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TEST_ROLLBACK%' THEN
      test := 'payment settles invoice and posts to treasury'; result := 'ERROR';
      detail := left(SQLERRM, 120); RETURN NEXT;
    END IF;
  END;

  -- 7. Voiding a paid invoice must succeed and reverse the treasury.
  BEGIN
    -- add_treasury_tx() performs its own permission check, so the test must
    -- run under a real identity rather than the bare definer role.
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',(SELECT user_id FROM public.user_roles WHERE role::text='system_owner' LIMIT 1)::text,
                        'role','authenticated')::text, true);
    SELECT current_balance INTO v_cash_before FROM public.treasury WHERE branch_id = v_branch LIMIT 1;
    INSERT INTO public.patients (first_name_en, last_name_en, phone, branch_id)
      VALUES ('RegTest','Void','01000000000', v_branch) RETURNING id INTO v_patient;
    INSERT INTO public.invoices (patient_id, branch_id, invoice_date, subtotal, total)
      VALUES (v_patient, v_branch, current_date, 250, 250) RETURNING id INTO v_invoice;
    INSERT INTO public.payments (invoice_id, patient_id, branch_id, amount, payment_method, payment_date)
      VALUES (v_invoice, v_patient, v_branch, 250, 'cash', current_date);

    PERFORM public.void_invoice_financials(v_invoice, (SELECT user_id FROM public.user_roles WHERE role::text='system_owner' LIMIT 1));

    SELECT current_balance INTO v_cash_after FROM public.treasury WHERE branch_id = v_branch LIMIT 1;
    IF v_cash_after = v_cash_before THEN
      test := 'voiding an invoice reverses the treasury'; result := 'PASS';
      detail := format('cash returned to %s', v_cash_after);
    ELSE
      test := 'voiding an invoice reverses the treasury'; result := 'FAIL';
      detail := format('cash %s -> %s, expected %s', v_cash_before, v_cash_after, v_cash_before);
    END IF;
    RETURN NEXT;
    RAISE EXCEPTION 'TEST_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TEST_ROLLBACK%' THEN
      test := 'voiding an invoice reverses the treasury'; result := 'ERROR';
      detail := left(SQLERRM, 120); RETURN NEXT;
    END IF;
  END;

  -- 8. Booking an appointment enqueues exactly the reminders the selected
  --    branch is configured to send. The expected count is derived from that
  --    branch's own settings and templates, so the assertion is honest for an
  --    unconfigured branch (legacy path, default 24h + 2h) and for a branch
  --    that has reminder templates. The temporary patient opts in to WhatsApp
  --    so the consent gate is exercised rather than silently skipping rows.
  DECLARE
    v_scheduled timestamptz := now() + interval '3 days';
    v_expected int := 0;
    v_tpl_reminders int := 0;
    v_hours integer[];
    v_h int;
    v_provider text;
  BEGIN
    INSERT INTO public.patients (first_name_en, last_name_en, first_name_ar, last_name_ar, phone, branch_id, whatsapp_opt_in)
      VALUES ('RegTest','Remind','اختبار','تذكير','01000000000', v_branch, true) RETURNING id INTO v_patient;
    INSERT INTO public.appointments (patient_id, branch_id, scheduled_at, status)
      VALUES (v_patient, v_branch, v_scheduled, 'scheduled') RETURNING id INTO v_appt;

    SELECT COALESCE((SELECT whatsapp_provider::text FROM public.notification_settings WHERE branch_id = v_branch), 'custom')
      INTO v_provider;

    -- Templated path: enqueue_appointment_event() inserts one row per eligible
    -- template; reminders_appt_event_time_uniq collapses templates that land on
    -- the same (event_type, scheduled_time), which is what the counts below do.
    IF public.communication_event_enabled(v_branch, 'booking_confirmation') AND EXISTS (
      SELECT 1 FROM public.communication_templates t
       WHERE t.branch_id = v_branch AND t.event_type = 'booking_confirmation' AND t.enabled
         AND (t.channel <> 'whatsapp' OR v_provider <> 'meta' OR NULLIF(trim(t.meta_template_name), '') IS NOT NULL)
    ) THEN
      v_expected := v_expected + 1;
    END IF;

    IF public.communication_event_enabled(v_branch, 'appointment_reminder') THEN
      SELECT count(DISTINCT v_scheduled - make_interval(hours => t.hours_before))
        INTO v_tpl_reminders
        FROM public.communication_templates t
       WHERE t.branch_id = v_branch AND t.event_type = 'appointment_reminder' AND t.enabled
         AND t.hours_before IS NOT NULL AND t.hours_before > 0
         AND v_scheduled - make_interval(hours => t.hours_before) > now()
         AND (t.channel <> 'whatsapp' OR v_provider <> 'meta' OR NULLIF(trim(t.meta_template_name), '') IS NOT NULL);
      v_expected := v_expected + v_tpl_reminders;
    END IF;

    -- Legacy path: tg_appointment_create_reminders() only runs when the branch
    -- has no enabled reminder template, and inserts one row per configured hour
    -- that is still in the future (default 24h and 2h when unset).
    IF NOT EXISTS (
      SELECT 1 FROM public.communication_templates
       WHERE branch_id = v_branch AND event_type = 'appointment_reminder' AND enabled
    ) THEN
      IF public.communication_event_enabled(v_branch, 'appointment_reminder') AND v_scheduled > now() THEN
        SELECT reminder_hours_before INTO v_hours
          FROM public.appointment_settings WHERE branch_id = v_branch LIMIT 1;
        IF v_hours IS NULL OR array_length(v_hours, 1) IS NULL THEN
          v_hours := ARRAY[24, 2]::integer[];
        END IF;
        FOREACH v_h IN ARRAY v_hours LOOP
          IF v_scheduled - (v_h || ' hours')::interval > now() THEN
            v_expected := v_expected + 1;
          END IF;
        END LOOP;
      END IF;
    END IF;

    SELECT count(*) INTO v_n FROM public.reminders WHERE appointment_id = v_appt;

    IF v_n = v_expected THEN
      test := 'appointment reminders match branch config'; result := 'PASS';
      detail := format('%s reminders, expected %s from branch settings', v_n, v_expected);
    ELSE
      test := 'appointment reminders match branch config'; result := 'FAIL';
      detail := format('got %s reminders, expected %s from branch settings', v_n, v_expected);
    END IF;
    RETURN NEXT;
    RAISE EXCEPTION 'TEST_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TEST_ROLLBACK%' THEN
      test := 'appointment reminders match branch config'; result := 'ERROR';
      detail := left(SQLERRM, 120); RETURN NEXT;
    END IF;
  END;

  -- 9. Invoice numbers must carry the branch code.
  BEGIN
    INSERT INTO public.patients (first_name_en, last_name_en, phone, branch_id)
      VALUES ('RegTest','Numbering','01000000000', v_branch) RETURNING id INTO v_patient;
    INSERT INTO public.invoices (patient_id, branch_id, invoice_date, subtotal, total)
      VALUES (v_patient, v_branch, current_date, 100, 100) RETURNING id INTO v_invoice;
    SELECT invoice_number INTO v_num FROM public.invoices WHERE id = v_invoice;

    IF v_num LIKE 'INV-' || public.branch_invoice_code(v_branch) || '-%' THEN
      test := 'invoice number is per-branch'; result := 'PASS'; detail := v_num;
    ELSE
      test := 'invoice number is per-branch'; result := 'FAIL'; detail := 'got ' || v_num;
    END IF;
    RETURN NEXT;
    RAISE EXCEPTION 'TEST_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TEST_ROLLBACK%' THEN
      test := 'invoice number is per-branch'; result := 'ERROR';
      detail := left(SQLERRM, 120); RETURN NEXT;
    END IF;
  END;

  ------------------------------------------------------- book reconciliation
  -- 10. Every invoice's paid_amount equals the sum of its live payments.
  SELECT count(*) INTO v_n FROM (
    SELECT i.id
    FROM public.invoices i
    LEFT JOIN public.payments p ON p.invoice_id = i.id AND p.deleted_at IS NULL
    WHERE i.deleted_at IS NULL
    GROUP BY i.id, i.paid_amount
    HAVING coalesce(i.paid_amount,0) <> coalesce(sum(p.amount),0)
  ) x;
  test := 'paid_amount reconciles with payments';
  result := CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END;
  detail := format('%s invoice(s) disagree', v_n);
  RETURN NEXT;

  -- 11. Invoice arithmetic holds.
  SELECT count(*) INTO v_n FROM public.invoices
   WHERE deleted_at IS NULL
     AND total <> (coalesce(subtotal,0) - coalesce(discount,0) + coalesce(tax,0));
  test := 'invoice total = subtotal - discount + tax';
  result := CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END;
  detail := format('%s invoice(s) disagree', v_n);
  RETURN NEXT;

  -- 12. No live payment may exist without a treasury transaction.
  SELECT count(*) INTO v_n
    FROM public.payments p
   WHERE p.deleted_at IS NULL
     AND p.is_wallet_topup IS NOT TRUE
     AND NOT EXISTS (
       SELECT 1 FROM public.treasury_transactions t
        WHERE t.reference_id = p.id
     );
  test := 'every live payment has a treasury entry';
  result := CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END;
  detail := format('%s orphan payment(s)', v_n);
  RETURN NEXT;

  RETURN;
END;
$suite$;

DO $postflight$
DECLARE
  v_def text;
  v_seen boolean := false;
  r record;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_financial_regression_tests';

  IF position('ORDER BY name_en NULLS LAST, id' in v_def) = 0 THEN
    RAISE EXCEPTION 'postflight: deterministic branch order is missing';
  END IF;
  IF position('whatsapp_opt_in' in v_def) = 0 THEN
    RAISE EXCEPTION 'postflight: temporary patient does not opt in to WhatsApp';
  END IF;
  IF position('appointment reminders match branch config' in v_def) = 0 THEN
    RAISE EXCEPTION 'postflight: test #8 assertion is missing';
  END IF;

  FOR r IN SELECT * FROM public.run_financial_regression_tests()
            WHERE test = 'appointment reminders match branch config'
  LOOP
    v_seen := true;
    IF r.result <> 'PASS' THEN
      RAISE EXCEPTION 'postflight: test #8 returned % - %', r.result, r.detail;
    END IF;
  END LOOP;

  IF NOT v_seen THEN
    RAISE EXCEPTION 'postflight: test #8 produced no row';
  END IF;
END;
$postflight$;

COMMIT;
