-- =====================================================================
-- 1. Retire the 'staff' role.
--
-- It declared exactly one permission (appointments.view) and RLS never honoured
-- it, so the role granted nothing at all: the sweep showed 0 patients and 0
-- appointments. A role that cannot perform its only stated duty is worse than no
-- role -- it looks like access control while providing neither access nor control,
-- and anyone assigned it silently sees empty screens with no error.
--
-- Both holders were verified to be test accounts with no operational history:
--   qa.staff@qa.local            (EMP-0025, last sign-in 2026-07-17, 0 payments)
--   test-staff@belalaamer.com    (EMP-0019, last sign-in 2026-06-27, 0 payments)
-- Neither is a doctor on any appointment nor received any payment, so no real
-- employee loses access here.
--
-- NOTE ON THE ENUM: PostgreSQL cannot remove a value from an enum type in place.
-- Doing it properly means creating a new type, rewriting every dependent column
-- and every policy that casts to app_role, then dropping the old type -- a large,
-- risky change for no functional gain. Instead the label is left in place and made
-- unusable: all grants are revoked, the declared bundles are removed, and a
-- trigger refuses any future grant. The enum label is inert.
-- =====================================================================

-- Remove the two test grants.
DELETE FROM public.user_roles WHERE role = 'staff'::public.app_role;

-- Remove it from the canonical (declared) model.
DELETE FROM public.authz_role_bundles WHERE role = 'staff'::public.app_role;

-- Remove it from the legacy permission table.
-- role_permissions.role is text, not the app_role enum.
DELETE FROM public.role_permissions WHERE role = 'staff';

-- Refuse any future attempt to grant it, so the role cannot quietly come back.
CREATE OR REPLACE FUNCTION public.tg_reject_retired_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.role = 'staff'::public.app_role THEN
    RAISE EXCEPTION 'The staff role was retired on 2026-08-05 because it granted no access. Assign a role that matches the person''s actual duties instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_reject_retired_roles ON public.user_roles;
CREATE TRIGGER trg_reject_retired_roles
  BEFORE INSERT OR UPDATE OF role ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_retired_roles();


-- =====================================================================
-- 2. Need-to-know on catalog data (ISO/IEC 27001:2022 A.5.15).
--
-- These tables were readable with USING (true) -- every authenticated user, on
-- every screen, regardless of job. Read access is now tied to the business
-- function that needs it.
--
-- SCOPE LIMIT, STATED PLAINLY: this is need-to-know by ROLE, not isolation
-- between clinics. Most of these tables have no branch_id or tenant_id column at
-- all, so two clinics sharing this database would still share one supplier list
-- and one price list. Closing that requires adding a scope column and migrating
-- the existing rows, which is a schema change and belongs in its own piece of
-- work before a second customer is onboarded. It is NOT fixed here.
--
-- Deliberately left readable to all staff, because every clinical and front-desk
-- role genuinely needs them: diagnoses, medications, procedures,
-- medical_specialties, payment_methods, expense_categories, leave_types,
-- system_languages, the message templates, report_templates and the ID counters.
-- =====================================================================

-- Procurement and stock: inventory function only.
DROP POLICY IF EXISTS sup_select ON public.suppliers;
CREATE POLICY sup_select ON public.suppliers FOR SELECT
  USING (public.has_permission(auth.uid(), 'inventory.view')
      OR public.has_permission(auth.uid(), 'settings.view'));

DROP POLICY IF EXISTS prd_select ON public.products;
CREATE POLICY prd_select ON public.products FOR SELECT
  USING (public.has_permission(auth.uid(), 'inventory.view')
      OR public.has_permission(auth.uid(), 'settings.view'));

DROP POLICY IF EXISTS cat_select ON public.product_categories;
CREATE POLICY cat_select ON public.product_categories FOR SELECT
  USING (public.has_permission(auth.uid(), 'inventory.view')
      OR public.has_permission(auth.uid(), 'settings.view'));

DROP POLICY IF EXISTS inv_select ON public.inventory;
CREATE POLICY inv_select ON public.inventory FOR SELECT
  USING (
    (public.has_permission(auth.uid(), 'inventory.view')
     OR public.has_permission(auth.uid(), 'settings.view'))
    AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
  );

DROP POLICY IF EXISTS sc_select ON public.service_consumables;
CREATE POLICY sc_select ON public.service_consumables FOR SELECT
  USING (public.has_permission(auth.uid(), 'inventory.view')
      OR public.has_permission(auth.uid(), 'settings.view'));

-- Negotiated insurance rates are commercially sensitive: billing and settings only.
DROP POLICY IF EXISTS ic_read ON public.insurance_companies;
CREATE POLICY ic_read ON public.insurance_companies FOR SELECT
  USING (public.has_permission(auth.uid(), 'invoices.view')
      OR public.has_permission(auth.uid(), 'settings.view'));

DROP POLICY IF EXISTS contract_rules_read_authenticated ON public.insurance_contract_rules;
CREATE POLICY contract_rules_read_authenticated ON public.insurance_contract_rules FOR SELECT
  USING (public.has_permission(auth.uid(), 'invoices.view')
      OR public.has_permission(auth.uid(), 'settings.view'));

-- The price list is needed by anyone who books, treats or bills -- which after
-- retiring 'staff' is every remaining role. Written as an explicit need-to-know
-- test anyway, so a future role added without a stated need does not inherit it.
DROP POLICY IF EXISTS sv_select ON public.services;
CREATE POLICY sv_select ON public.services FOR SELECT
  USING (
    public.has_permission(auth.uid(), 'invoices.view')
    OR public.has_permission(auth.uid(), 'appointments.view')
    OR public.has_permission(auth.uid(), 'medical_records.view')
    OR public.has_permission(auth.uid(), 'settings.view')
  );

-- The authorization model itself should not be browsable by every user
-- (ISO/IEC 27001:2022 A.8.2 -- restrict information about privileged access).
-- v_authz_effective_permissions stays available: it is already scoped to the
-- calling user, which is what the UI actually needs.
DROP POLICY IF EXISTS "authz_bundles readable by authenticated" ON public.authz_bundles;
CREATE POLICY "authz_bundles readable by authenticated" ON public.authz_bundles FOR SELECT
  USING (public.has_permission(auth.uid(), 'settings.view'));

DROP POLICY IF EXISTS "authz_bundle_permissions readable by authenticated" ON public.authz_bundle_permissions;
CREATE POLICY "authz_bundle_permissions readable by authenticated" ON public.authz_bundle_permissions FOR SELECT
  USING (public.has_permission(auth.uid(), 'settings.view'));

DROP POLICY IF EXISTS "authz_bundle_implies readable by authenticated" ON public.authz_bundle_implies;
CREATE POLICY "authz_bundle_implies readable by authenticated" ON public.authz_bundle_implies FOR SELECT
  USING (public.has_permission(auth.uid(), 'settings.view'));

DROP POLICY IF EXISTS "authz_role_bundles readable by authenticated" ON public.authz_role_bundles;
CREATE POLICY "authz_role_bundles readable by authenticated" ON public.authz_role_bundles FOR SELECT
  USING (public.has_permission(auth.uid(), 'settings.view'));

DROP POLICY IF EXISTS "authz_permissions readable by authenticated" ON public.authz_permissions;
CREATE POLICY "authz_permissions readable by authenticated" ON public.authz_permissions FOR SELECT
  USING (public.has_permission(auth.uid(), 'settings.view'));

-- role_permissions is deliberately NOT restricted. VITE_AUTHZ_CANONICAL can still
-- be flipped to the legacy path in the browser, and a user who could not read this
-- table on that path would end up with no permissions at all and a blank app.
-- It is revisited when the legacy fallback is removed.
