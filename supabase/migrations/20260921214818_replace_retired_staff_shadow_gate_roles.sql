UPDATE public.authz_shadow_slice_gate
SET required_denying_bundles = ARRAY['bundle.role.doctor']::text[],
    required_denied_roles = ARRAY['doctor'::public.app_role],
    notes = regexp_replace(notes, 'staff', 'doctor', 'gi'),
    updated_at = now()
WHERE slice = 'settings';

UPDATE public.authz_shadow_slice_gate
SET required_denying_bundles = ARRAY['bundle.role.hr']::text[],
    required_denied_roles = ARRAY['hr'::public.app_role],
    notes = regexp_replace(notes, 'staff', 'hr', 'gi'),
    updated_at = now()
WHERE slice = 'patients';

UPDATE public.authz_shadow_slice_gate
SET required_denying_bundles = ARRAY['bundle.role.accountant']::text[],
    required_denied_roles = ARRAY['accountant'::public.app_role],
    notes = regexp_replace(notes, 'staff', 'accountant', 'gi'),
    updated_at = now()
WHERE slice = 'medical_records';

UPDATE public.authz_shadow_slice_gate
SET required_denying_bundles = ARRAY['bundle.role.accountant']::text[],
    required_denied_roles = ARRAY['accountant'::public.app_role],
    notes = regexp_replace(notes, 'staff', 'accountant', 'gi'),
    updated_at = now()
WHERE slice = 'hr';

UPDATE public.authz_shadow_slice_gate
SET required_denying_bundles = ARRAY['bundle.role.doctor']::text[],
    required_denied_roles = ARRAY['doctor'::public.app_role],
    notes = regexp_replace(notes, 'staff', 'doctor', 'gi'),
    updated_at = now()
WHERE slice = 'invoices';
