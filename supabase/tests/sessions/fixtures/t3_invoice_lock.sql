-- Serialise treatment-plan invoicing on the plan row.
--
-- THE BUG (reproduced, not inferred).
--
-- `tg_treatment_session_after_change()` (AFTER INSERT OR DELETE OR UPDATE on
-- public.treatment_sessions) creates the plan's invoice when the plan's sessions
-- are all completed:
--
--     SELECT * INTO v_plan FROM public.treatment_plans WHERE id = plan_id;   -- plain read
--     ...
--     IF v_plan.status <> 'cancelled' AND v_plan.invoice_id IS NULL AND price > 0 THEN
--        INSERT INTO invoices (...)  -- v_plan.invoice_id was read BEFORE this
--
-- The read takes no lock, so two concurrent transactions that both write a
-- treatment_sessions row of the same plan can each capture `invoice_id IS NULL`
-- and each insert an invoice. `generate_invoice_number()` allocates a *different*
-- number per caller (an atomic upsert on invoice_counters), so the unique index
-- on invoices.invoice_number does not collide and does not save us: two valid
-- invoices are created, the plan ends up pointing at whichever committed last,
-- and the other is an orphan that is still a real, payable bill for the patient.
--
-- Precondition: `done >= total_sessions` AND `invoice_id IS NULL` AND `price > 0`
-- at read time. Reached when the price is entered/corrected after the sessions
-- were already completed, or when total_sessions is lowered after delivery --
-- plus two concurrent writes on the plan's sessions (a completion and any edit
-- such as a note change; every write fires the trigger).
--
-- Sequential repeats do NOT duplicate: the second call reads the committed
-- invoice_id and skips. The defect is concurrency-specific.
--
-- THE FIX. One change to the read: `FOR UPDATE` on the plan row.
--
-- The first transaction to reach the trigger locks the plan; the second blocks
-- there until it commits, then re-reads the row and sees invoice_id set, so it
-- skips. Nothing else in the trigger changes: the same completion condition, the
-- same invoice fields, the same status transitions, the same behaviour when the
-- plan is cancelled or price is zero.
--
-- Cost: writers on the same plan serialise for the duration of one trigger run.
-- That is the intended semantic -- a plan is a single accounting unit -- and the
-- row is already updated unconditionally by this same trigger, so the lock adds
-- no new contention class.
--
-- Lock order is session row (from the caller's UPDATE) then plan row. Every other
-- path that touches a plan (`treatment_plans` UPDATE from the app) takes only the
-- plan row, so no cycle exists.
--
-- Verified reproducibly: `supabase/tests/concurrency/treatment_plan_invoice_race.sh`
-- runs two overlapping sessions against a scratch database and asserts exactly one
-- invoice and zero orphans. On the pre-fix body it reports 2 invoices / 1 orphan.
--
-- Status: NOT APPLIED. No change has been made to Production.

CREATE OR REPLACE FUNCTION public.tg_treatment_session_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  plan_id uuid;
  total int;
  done int;
  v_plan public.treatment_plans%ROWTYPE;
  v_invoice_id uuid;
  v_inv_num text;
BEGIN
  plan_id := COALESCE(NEW.treatment_plan_id, OLD.treatment_plan_id);

  -- The only behavioural change in this file. Without FOR UPDATE a concurrent
  -- transaction reads the pre-invoice snapshot of this row and issues a second
  -- invoice for the same plan. With it, the second transaction waits, then sees
  -- invoice_id already set and leaves the plan alone.
  SELECT * INTO v_plan FROM public.treatment_plans WHERE id = plan_id FOR UPDATE;

  total := v_plan.total_sessions;
  SELECT count(*) INTO done FROM public.treatment_sessions
    WHERE treatment_plan_id = plan_id AND status = 'completed';

  IF total IS NOT NULL THEN
    IF done >= total THEN
      UPDATE public.treatment_plans
        SET status = CASE WHEN status IN ('cancelled') THEN status ELSE 'completed' END,
            end_date = COALESCE(end_date, current_date),
            updated_at = now()
        WHERE id = plan_id AND status <> 'cancelled';

      IF v_plan.status <> 'cancelled' AND v_plan.invoice_id IS NULL AND COALESCE(v_plan.price, 0) > 0 THEN
        v_inv_num := public.generate_invoice_number();
        INSERT INTO public.invoices (invoice_number, patient_id, branch_id, invoice_date, subtotal, total, status, notes, created_by)
        VALUES (
          v_inv_num, v_plan.patient_id, v_plan.branch_id, current_date,
          v_plan.price, v_plan.price, 'pending'::invoice_status,
          COALESCE(v_plan.name_en, v_plan.name_ar), v_plan.created_by
        )
        RETURNING id INTO v_invoice_id;

        INSERT INTO public.invoice_items (invoice_id, description_en, description_ar, quantity, unit_price, total, item_type)
        VALUES (
          v_invoice_id,
          COALESCE(v_plan.name_en, v_plan.name_ar, 'Treatment Plan'),
          COALESCE(v_plan.name_ar, v_plan.name_en, 'خطة علاج'),
          1, v_plan.price, v_plan.price, 'service'::invoice_item_type
        );

        UPDATE public.treatment_plans SET invoice_id = v_invoice_id WHERE id = plan_id;
      END IF;
    ELSE
      UPDATE public.treatment_plans
        SET status = CASE WHEN status = 'completed' THEN 'active' ELSE status END,
            updated_at = now()
        WHERE id = plan_id AND status = 'completed';
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.tg_treatment_session_after_change() IS
  'Completes the plan and issues its invoice when every session is delivered. Reads the plan FOR UPDATE so two concurrent session writes cannot each issue an invoice for the same plan (orphan duplicate invoices).';