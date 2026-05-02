-- 1. inventory_transactions: admin-only UPDATE
DROP POLICY IF EXISTS invtx_update_admin ON public.inventory_transactions;
CREATE POLICY invtx_update_admin ON public.inventory_transactions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. treasury_transactions: admin-only UPDATE
DROP POLICY IF EXISTS tx_update_admin ON public.treasury_transactions;
CREATE POLICY tx_update_admin ON public.treasury_transactions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. leave_requests: prevent self-approval via column-guard trigger
CREATE OR REPLACE FUNCTION public.tg_leave_request_self_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.staff_id = auth.uid() THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
      RAISE EXCEPTION 'Forbidden: only admins can approve, reject, or change ownership of leave requests';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Forbidden: cannot update leave requests for other staff';
END;
$$;

DROP TRIGGER IF EXISTS leave_request_self_guard ON public.leave_requests;
CREATE TRIGGER leave_request_self_guard
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_leave_request_self_guard();

-- 4. product-images public bucket: explicit public SELECT policy
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');
