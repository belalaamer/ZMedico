-- SECURITY DEFINER guardrails found by the full RLS audit.
-- Keep supported workflows callable, but enforce actor/branch scope inside the
-- function so API callers cannot rely on the client UI or bypass RLS.

CREATE OR REPLACE FUNCTION public.admin_archive_branch(_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND public.user_has_branch_access(_branch_id)
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to archive this branch'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.branches
     SET is_active = false,
         is_main_branch = false,
         updated_at = now()
   WHERE id = _branch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'branch_id', _branch_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_override_medical_record(
  _record_id uuid,
  _new_notes text,
  _admin_id uuid
)
RETURNS public.medical_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.medical_records%ROWTYPE;
  v_new public.medical_records%ROWTYPE;
BEGIN
  SELECT * INTO v_old
    FROM public.medical_records
   WHERE id = _record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Medical record not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND public.user_has_branch_access(v_old.branch_id)
    )
  ) THEN
    RAISE EXCEPTION 'Only an authorized admin for this branch may override a medical record.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.medical_records
     SET notes_en = _new_notes,
         updated_at = now()
   WHERE id = _record_id
  RETURNING * INTO v_new;

  INSERT INTO public.audit_logs
    (user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
  VALUES
    (auth.uid(), v_new.branch_id, 'admin_override', 'medical_records', _record_id,
     jsonb_build_object('notes_en', v_old.notes_en, 'status', v_old.status, 'doctor_id', v_old.doctor_id),
     jsonb_build_object('notes_en', v_new.notes_en, 'overridden_by', auth.uid(), 'overridden_at', now()));

  RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_inventory_tx(
  _product_id uuid,
  _branch_id uuid,
  _type public.inventory_tx_type,
  _signed_qty numeric,
  _unit_cost numeric,
  _ref_type text,
  _ref_id uuid,
  _notes_en text,
  _notes_ar text,
  _expiry date,
  _batch text,
  _by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cur numeric(14,3);
  newq numeric(14,3);
  inv_id uuid;
  tx_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'inventory.tx.write') THEN
    RAISE EXCEPTION 'Forbidden: missing permission inventory.tx.write'
      USING ERRCODE = '42501';
  END IF;
  IF _branch_id IS NULL OR NOT public.user_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to inventory branch'
      USING ERRCODE = '42501';
  END IF;
  IF _product_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = _product_id
  ) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;
  IF _signed_qty IS NULL OR _signed_qty = 0 THEN
    RAISE EXCEPTION 'Inventory quantity must not be zero' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inventory(product_id, branch_id, quantity)
    VALUES (_product_id, _branch_id, 0)
    ON CONFLICT (product_id, branch_id) DO NOTHING;
  SELECT id, quantity INTO inv_id, cur
    FROM public.inventory
   WHERE product_id = _product_id AND branch_id = _branch_id
   FOR UPDATE;

  newq := cur + _signed_qty;
  IF newq < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: have %, need %', cur, abs(_signed_qty);
  END IF;

  UPDATE public.inventory
     SET quantity = newq,
         last_restocked_at = CASE WHEN _signed_qty > 0 THEN now() ELSE last_restocked_at END,
         updated_at = now()
   WHERE id = inv_id;

  INSERT INTO public.inventory_transactions(
    product_id, branch_id, transaction_type, quantity, quantity_before, quantity_after,
    unit_cost, reference_type, reference_id, notes_en, notes_ar, expiry_date, batch_number, created_by
  ) VALUES (
    _product_id, _branch_id, _type, _signed_qty, cur, newq,
    _unit_cost, _ref_type, _ref_id, _notes_en, _notes_ar, _expiry, _batch, v_actor
  ) RETURNING id INTO tx_id;

  RETURN tx_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_wallet_tx(
  _patient_id uuid,
  _tx_type public.wallet_tx_type,
  _amount numeric,
  _reference_type text,
  _reference_id uuid,
  _notes_en text,
  _notes_ar text,
  _branch_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _required_perm text;
  dir smallint;
  cur numeric(14,2);
  new_bal numeric(14,2);
  new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden: authentication required' USING ERRCODE = '42501';
  END IF;

  _required_perm := CASE
    WHEN _tx_type IN ('adjustment_credit', 'adjustment_debit') THEN 'patients.delete'
    ELSE 'patients.edit'
  END;
  IF NOT public.has_permission(_uid, _required_perm) THEN
    RAISE EXCEPTION 'Forbidden: missing % permission', _required_perm USING ERRCODE = '42501';
  END IF;
  IF _branch_id IS NULL OR NOT public.user_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Forbidden: a scoped branch is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = _patient_id
      AND p.deleted_at IS NULL
      AND p.branch_id IS NOT NULL
      AND public.user_has_branch_access(p.branch_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden: patient is outside the caller branch scope'
      USING ERRCODE = '42501';
  END IF;
  IF _patient_id IS NULL THEN RAISE EXCEPTION 'patient_id required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;

  dir := CASE _tx_type
    WHEN 'topup' THEN 1
    WHEN 'refund' THEN -1
    WHEN 'spend' THEN -1
    WHEN 'referral_reward' THEN 1
    WHEN 'adjustment_credit' THEN 1
    WHEN 'adjustment_debit' THEN -1
  END;

  INSERT INTO public.patient_wallets(patient_id, balance)
    VALUES (_patient_id, 0)
    ON CONFLICT (patient_id) DO NOTHING;

  SELECT balance INTO cur FROM public.patient_wallets
   WHERE patient_id = _patient_id FOR UPDATE;
  new_bal := cur + (dir * _amount);
  IF new_bal < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance: have %, need %', cur, _amount;
  END IF;

  INSERT INTO public.patient_wallet_transactions(
    patient_id, branch_id, tx_type, direction, amount, balance_after,
    reference_type, reference_id, notes_en, notes_ar, created_by
  ) VALUES (
    _patient_id, _branch_id, _tx_type, dir, _amount, new_bal,
    _reference_type, _reference_id, _notes_en, _notes_ar, _uid
  ) RETURNING id INTO new_id;

  UPDATE public.patient_wallets
     SET balance = new_bal, updated_at = now()
   WHERE patient_id = _patient_id;

  RETURN new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_archive_branch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_archive_branch(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_force_delete_branch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_delete_branch(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_override_medical_record(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_override_medical_record(uuid, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_inventory_tx(uuid, uuid, public.inventory_tx_type, numeric, numeric, text, uuid, text, text, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_inventory_tx(uuid, uuid, public.inventory_tx_type, numeric, numeric, text, uuid, text, text, date, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_wallet_tx(uuid, public.wallet_tx_type, numeric, text, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_wallet_tx(uuid, public.wallet_tx_type, numeric, text, uuid, text, text, uuid) TO authenticated;
