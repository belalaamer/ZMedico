-- Phase: QA Pass 2 — finalize permission matrix coupons rows
INSERT INTO public.role_permissions (role, module, actions) VALUES
  ('admin','coupons', ARRAY['view','create','edit','delete','export']),
  ('manager','coupons', ARRAY['view','create','edit','export']),
  ('accountant','coupons', ARRAY['view','create','edit','export']),
  ('receptionist','coupons', ARRAY['view']),
  ('doctor','coupons', ARRAY[]::text[]),
  ('nurse','coupons', ARRAY[]::text[]),
  ('hr','coupons', ARRAY[]::text[]),
  ('staff','coupons', ARRAY[]::text[])
ON CONFLICT (role, module) DO UPDATE SET actions = EXCLUDED.actions
WHERE public.role_permissions.actions = '{}'::text[];
