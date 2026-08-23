-- Public pricing must not evaluate an admin-only helper for anon readers.
-- Keep active plans public, while separating authenticated admin writes.
DROP POLICY IF EXISTS plans_admin_write ON public.subscription_plans;
DROP POLICY IF EXISTS plans_public_read ON public.subscription_plans;
DROP POLICY IF EXISTS plans_admin_inactive_read ON public.subscription_plans;
DROP POLICY IF EXISTS plans_admin_insert ON public.subscription_plans;
DROP POLICY IF EXISTS plans_admin_update ON public.subscription_plans;
DROP POLICY IF EXISTS plans_admin_delete ON public.subscription_plans;

CREATE POLICY plans_public_read
  ON public.subscription_plans FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY plans_admin_inactive_read
  ON public.subscription_plans FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY plans_admin_insert
  ON public.subscription_plans FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY plans_admin_update
  ON public.subscription_plans FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY plans_admin_delete
  ON public.subscription_plans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
