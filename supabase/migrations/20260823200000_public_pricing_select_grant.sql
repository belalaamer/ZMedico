-- Public pricing must be readable by unauthenticated visitors.
-- Policies alone do not grant table privileges in PostgREST.
REVOKE ALL ON TABLE public.subscription_plans FROM anon;
GRANT SELECT ON TABLE public.subscription_plans TO anon;
GRANT SELECT ON TABLE public.subscription_plans TO authenticated;
