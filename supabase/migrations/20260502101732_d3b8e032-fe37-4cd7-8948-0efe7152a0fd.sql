-- Tighten SELECT on HR tables to self/admin
DROP POLICY IF EXISTS lr_select ON public.leave_requests;
CREATE POLICY lr_select ON public.leave_requests
  FOR SELECT TO authenticated
  USING ((staff_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS att_select ON public.attendance;
CREATE POLICY att_select ON public.attendance
  FOR SELECT TO authenticated
  USING ((staff_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS ws_select ON public.work_schedules;
CREATE POLICY ws_select ON public.work_schedules
  FOR SELECT TO authenticated
  USING ((staff_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Restrict report_schedules SELECT to admin
DROP POLICY IF EXISTS rs_select ON public.report_schedules;
CREATE POLICY rs_select ON public.report_schedules
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Notifications: only allow inserting for own user_id (triggers are SECURITY DEFINER, unaffected)
DROP POLICY IF EXISTS notif_insert_any ON public.notifications;
CREATE POLICY notif_insert_own ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Products: restrict mutations to admin
DROP POLICY IF EXISTS prd_insert ON public.products;
DROP POLICY IF EXISTS prd_update ON public.products;
CREATE POLICY prd_insert_admin ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY prd_update_admin ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Suppliers: restrict mutations to admin
DROP POLICY IF EXISTS sup_insert ON public.suppliers;
DROP POLICY IF EXISTS sup_update ON public.suppliers;
CREATE POLICY sup_insert_admin ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY sup_update_admin ON public.suppliers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Product categories: restrict mutations to admin
DROP POLICY IF EXISTS cat_insert ON public.product_categories;
DROP POLICY IF EXISTS cat_update ON public.product_categories;
CREATE POLICY cat_insert_admin ON public.product_categories
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY cat_update_admin ON public.product_categories
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Reminders: restrict UPDATE to creator or admin
DROP POLICY IF EXISTS rem_update ON public.reminders;
CREATE POLICY rem_update_admin_or_creator ON public.reminders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR (created_by = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR (created_by = auth.uid()));
