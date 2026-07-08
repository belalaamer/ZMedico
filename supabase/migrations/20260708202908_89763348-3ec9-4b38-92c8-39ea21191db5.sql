
-- =========================================================================
-- R3 — RPC Authorization Unification
-- Zero authorization behavior change. Adds fine-grained permission keys
-- that mirror the exact role sets currently hard-coded inside each
-- client-callable SECURITY DEFINER RPC, then rewrites those RPCs to
-- authorize through has_permission() and to derive the acting user from
-- auth.uid() (never from client-supplied _by / _actor / _user_id).
-- =========================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. New permission keys (fine-grained; catalog additions)
-- ---------------------------------------------------------------------
INSERT INTO public.authz_permissions (key, group_key, display_name, description, risk_level, default_scope, introduced_in)
VALUES
  ('treasury.tx.write',         'treasury',  'Record treasury movements',        'Record cash / non-cash treasury transactions', 'high',   'branch', 'R3'),
  ('treasury.daily_close.view', 'treasury',  'View treasury daily close',        'View treasury day cash summary for closing',   'medium', 'branch', 'R3'),
  ('inventory.tx.write',        'inventory', 'Record inventory movements',       'Record inventory stock adjustments',           'high',   'branch', 'R3'),
  ('inventory.alerts.manage',   'inventory', 'Manage inventory expiry alerts',   'Run and refresh product expiry alert scans',   'medium', 'branch', 'R3'),
  ('invoices.coupon.apply',     'invoices',  'Apply coupon codes',               'Validate and apply coupon codes to invoices',  'medium', 'branch', 'R3'),
  ('purchase_orders.receive',   'purchase_orders', 'Receive purchase-order items','Receive PO lines and post inventory',         'high',   'branch', 'R3')
ON CONFLICT (key) DO UPDATE
  SET deprecated = false,
      updated_at = now();

-- ---------------------------------------------------------------------
-- 2. Bundle grants — mirror the exact role sets currently in the RPC
--    bodies (admin is short-circuited by has_permission, but we still
--    grant it for catalog completeness).
-- ---------------------------------------------------------------------
INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
VALUES
  -- treasury.tx.write  <-  admin, receptionist  (add_treasury_tx)
  ('bundle.role.admin',        'treasury.tx.write'),
  ('bundle.role.receptionist', 'treasury.tx.write'),
  -- treasury.daily_close.view <- admin, accountant, manager
  ('bundle.role.admin',        'treasury.daily_close.view'),
  ('bundle.role.accountant',   'treasury.daily_close.view'),
  ('bundle.role.manager',      'treasury.daily_close.view'),
  -- inventory.tx.write <- admin
  ('bundle.role.admin',        'inventory.tx.write'),
  -- inventory.alerts.manage <- admin, manager
  ('bundle.role.admin',        'inventory.alerts.manage'),
  ('bundle.role.manager',      'inventory.alerts.manage'),
  -- invoices.coupon.apply <- admin, manager, accountant, receptionist
  ('bundle.role.admin',        'invoices.coupon.apply'),
  ('bundle.role.manager',      'invoices.coupon.apply'),
  ('bundle.role.accountant',   'invoices.coupon.apply'),
  ('bundle.role.receptionist', 'invoices.coupon.apply'),
  -- purchase_orders.receive <- admin
  ('bundle.role.admin',        'purchase_orders.receive')
ON CONFLICT (bundle_key, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Rewritten SECURITY DEFINER RPCs — has_permission() + auth.uid()
--    Signatures preserved to keep callers untouched. Any client-supplied
--    _by parameter is IGNORED for audit-actor purposes; auth.uid() is
--    authoritative.
-- ---------------------------------------------------------------------

-- 3a. add_treasury_tx --------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_treasury_tx(
  _treasury_id uuid, _type treasury_tx_type, _amount numeric, _ref_type text,
  _ref_id uuid, _desc_en text, _desc_ar text, _by uuid, _is_cash boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cur numeric(14,2); new_balance numeric(14,2); delta numeric(14,2); new_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'treasury.tx.write') THEN
    RAISE EXCEPTION 'Forbidden: missing permission treasury.tx.write';
  END IF;
  PERFORM set_config('app.allow_treasury_balance_update','on', true);

  IF _is_cash THEN
    SELECT current_balance  INTO cur FROM public.treasury WHERE id=_treasury_id FOR UPDATE;
  ELSE
    SELECT non_cash_balance INTO cur FROM public.treasury WHERE id=_treasury_id FOR UPDATE;
  END IF;
  IF cur IS NULL THEN RAISE EXCEPTION 'Treasury % not found', _treasury_id; END IF;
  delta := CASE WHEN _type='income' THEN _amount ELSE -_amount END;
  new_balance := cur + delta;
  INSERT INTO public.treasury_transactions(
    treasury_id, transaction_type, amount, balance_after,
    reference_type, reference_id, description_en, description_ar, created_by, is_cash)
  VALUES (_treasury_id, _type, _amount, new_balance,
          _ref_type, _ref_id, _desc_en, _desc_ar, v_actor, _is_cash)
  RETURNING id INTO new_id;
  IF _is_cash THEN
    UPDATE public.treasury SET current_balance=new_balance, updated_at=now() WHERE id=_treasury_id;
  ELSE
    UPDATE public.treasury SET non_cash_balance=new_balance, updated_at=now() WHERE id=_treasury_id;
  END IF;
  RETURN new_id;
END;
$function$;

-- 3b. apply_coupon_code -----------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_coupon_code(_code text, _subtotal numeric)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  disc numeric(14,2) := 0;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'invoices.coupon.apply') THEN
    RAISE EXCEPTION 'Forbidden: missing permission invoices.coupon.apply';
  END IF;

  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(_code);
  IF c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error','not_found'); END IF;
  IF NOT c.is_active THEN RETURN jsonb_build_object('ok', false, 'error','disabled'); END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > current_date THEN RETURN jsonb_build_object('ok', false, 'error','not_started'); END IF;
  IF c.ends_at IS NOT NULL AND c.ends_at < current_date THEN RETURN jsonb_build_object('ok', false, 'error','expired'); END IF;
  IF c.usage_limit IS NOT NULL AND c.usage_count >= c.usage_limit THEN RETURN jsonb_build_object('ok', false, 'error','limit_reached'); END IF;
  IF COALESCE(c.min_order_amount,0) > _subtotal THEN
    RETURN jsonb_build_object('ok', false, 'error','min_order', 'min', c.min_order_amount);
  END IF;

  IF c.discount_type = 'percent' THEN
    disc := round(_subtotal * c.discount_value / 100, 2);
  ELSE
    disc := c.discount_value;
  END IF;
  IF c.max_discount_amount IS NOT NULL AND disc > c.max_discount_amount THEN
    disc := c.max_discount_amount;
  END IF;
  IF disc > _subtotal THEN disc := _subtotal; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'coupon_id', c.id,
    'code', c.code,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'discount_amount', disc
  );
END;
$function$;

-- 3c. apply_inventory_tx ----------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_inventory_tx(
  _product_id uuid, _branch_id uuid, _type inventory_tx_type, _signed_qty numeric,
  _unit_cost numeric, _ref_type text, _ref_id uuid, _notes_en text, _notes_ar text,
  _expiry date, _batch text, _by uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cur numeric(14,3); newq numeric(14,3); inv_id uuid; tx_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'inventory.tx.write') THEN
    RAISE EXCEPTION 'Forbidden: missing permission inventory.tx.write';
  END IF;

  INSERT INTO public.inventory(product_id, branch_id, quantity)
    VALUES (_product_id, _branch_id, 0)
    ON CONFLICT (product_id, branch_id) DO NOTHING;
  SELECT id, quantity INTO inv_id, cur FROM public.inventory
    WHERE product_id = _product_id AND branch_id = _branch_id FOR UPDATE;

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

-- 3d. check_expiry_alerts ---------------------------------------------
CREATE OR REPLACE FUNCTION public.check_expiry_alerts()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cnt int := 0;
  r record;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'inventory.alerts.manage') THEN
    RAISE EXCEPTION 'Forbidden: missing permission inventory.alerts.manage';
  END IF;

  FOR r IN
    SELECT t.product_id, t.branch_id
      FROM public.inventory_transactions t
      JOIN public.products p ON p.id = t.product_id
     WHERE p.expiry_tracking = true
       AND t.expiry_date IS NOT NULL
       AND t.expiry_date < current_date
       AND t.transaction_type = 'purchase'
       AND public.user_has_branch_access(t.branch_id)
     GROUP BY t.product_id, t.branch_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.stock_alerts
       WHERE product_id = r.product_id AND branch_id = r.branch_id
         AND alert_type = 'expired' AND is_resolved = false
    ) THEN
      INSERT INTO public.stock_alerts(product_id, branch_id, alert_type, quantity)
      VALUES (r.product_id, r.branch_id, 'expired', 0);
      cnt := cnt + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT t.product_id, t.branch_id
      FROM public.inventory_transactions t
      JOIN public.products p ON p.id = t.product_id
     WHERE p.expiry_tracking = true
       AND t.expiry_date IS NOT NULL
       AND t.expiry_date >= current_date
       AND t.expiry_date <= current_date + interval '30 days'
       AND t.transaction_type = 'purchase'
       AND public.user_has_branch_access(t.branch_id)
     GROUP BY t.product_id, t.branch_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.stock_alerts
       WHERE product_id = r.product_id AND branch_id = r.branch_id
         AND alert_type IN ('expiring_soon','expired') AND is_resolved = false
    ) THEN
      INSERT INTO public.stock_alerts(product_id, branch_id, alert_type, quantity)
      VALUES (r.product_id, r.branch_id, 'expiring_soon', 0);
      cnt := cnt + 1;
    END IF;
  END LOOP;

  RETURN cnt;
END;
$function$;

-- 3e. fn_treasury_day_cash_summary ------------------------------------
CREATE OR REPLACE FUNCTION public.fn_treasury_day_cash_summary(
  _treasury_id uuid, _business_date date, _tz text DEFAULT 'Africa/Cairo'::text)
RETURNS TABLE(opening_cash numeric, cash_income numeric, cash_expense numeric,
              expected_cash numeric, non_cash_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  tz text := COALESCE(NULLIF(_tz, ''), 'Africa/Cairo');
  cur_cash numeric(14,2);
  day_start timestamptz;
  day_end   timestamptz;
  net_cash_after_open numeric(14,2);
  v_open numeric(14,2);
  v_in   numeric(14,2);
  v_out  numeric(14,2);
  v_nc   numeric(14,2);
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'treasury.daily_close.view') THEN
    RAISE EXCEPTION 'Forbidden: missing permission treasury.daily_close.view';
  END IF;

  day_start := (_business_date::timestamp) AT TIME ZONE tz;
  day_end   := ((_business_date + 1)::timestamp) AT TIME ZONE tz;

  SELECT COALESCE(current_balance, 0) INTO cur_cash
    FROM public.treasury WHERE id = _treasury_id;

  SELECT COALESCE(SUM(
    CASE WHEN transaction_type = 'income'::public.treasury_tx_type THEN amount
         WHEN transaction_type = 'expense'::public.treasury_tx_type THEN -amount
         ELSE 0 END
  ), 0) INTO net_cash_after_open
    FROM public.treasury_transactions
   WHERE treasury_id = _treasury_id
     AND is_cash = true
     AND created_at >= day_start;

  v_open := COALESCE(cur_cash, 0) - COALESCE(net_cash_after_open, 0);

  SELECT COALESCE(SUM(amount), 0) INTO v_in
    FROM public.treasury_transactions
   WHERE treasury_id = _treasury_id AND is_cash = true
     AND transaction_type = 'income'::public.treasury_tx_type
     AND created_at >= day_start AND created_at < day_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_out
    FROM public.treasury_transactions
   WHERE treasury_id = _treasury_id AND is_cash = true
     AND transaction_type = 'expense'::public.treasury_tx_type
     AND created_at >= day_start AND created_at < day_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_nc
    FROM public.treasury_transactions
   WHERE treasury_id = _treasury_id AND is_cash = false
     AND transaction_type = 'income'::public.treasury_tx_type
     AND created_at >= day_start AND created_at < day_end;

  opening_cash   := v_open;
  cash_income    := v_in;
  cash_expense   := v_out;
  expected_cash  := v_open + v_in - v_out;
  non_cash_total := v_nc;
  RETURN NEXT;
END;
$function$;

-- 3f. receive_po_item -------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_po_item(
  _po_item_id uuid, _qty numeric, _expiry date, _batch text, _by uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  po record;
  it record;
  total_ord numeric;
  total_rec numeric;
  new_status po_status;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'purchase_orders.receive') THEN
    RAISE EXCEPTION 'Forbidden: missing permission purchase_orders.receive';
  END IF;

  SELECT * INTO it FROM public.purchase_order_items WHERE id = _po_item_id;
  IF it.id IS NULL THEN RAISE EXCEPTION 'PO item not found'; END IF;
  SELECT * INTO po FROM public.purchase_orders WHERE id = it.purchase_order_id;

  PERFORM public.apply_inventory_tx(
    it.product_id, po.branch_id, 'purchase'::inventory_tx_type, _qty,
    it.unit_cost, 'purchase_order', po.id,
    'Received from PO ' || po.po_number, 'استلام من أمر شراء ' || po.po_number,
    _expiry, _batch, v_actor
  );

  UPDATE public.purchase_order_items
     SET quantity_received = quantity_received + _qty
   WHERE id = _po_item_id;

  SELECT COALESCE(SUM(quantity_ordered),0), COALESCE(SUM(quantity_received),0)
    INTO total_ord, total_rec
    FROM public.purchase_order_items WHERE purchase_order_id = po.id;

  IF total_rec >= total_ord THEN new_status := 'received';
  ELSIF total_rec > 0        THEN new_status := 'partial';
  ELSE                             new_status := po.status; END IF;

  UPDATE public.purchase_orders SET status = new_status WHERE id = po.id;
END;
$function$;

COMMIT;
