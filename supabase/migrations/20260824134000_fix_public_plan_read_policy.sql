DROP POLICY IF EXISTS plans_public_read ON public.subscription_plans;
DROP POLICY IF EXISTS plans_system_owner_read_inactive ON public.subscription_plans;

-- Keep the public policy free of auth-only function calls. PostgreSQL may
-- evaluate both sides of an OR, so has_role must not appear in the anon policy.
CREATE POLICY plans_public_read
  ON public.subscription_plans FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY plans_system_owner_read_inactive
  ON public.subscription_plans FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role));
