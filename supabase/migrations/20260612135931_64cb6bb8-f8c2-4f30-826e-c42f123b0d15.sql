-- One-time legacy audit_logs PHI/PII cleanup
-- Cutoff: hardening migration timestamp 2026-06-12 13:46:27 UTC
-- Bypass append-only trigger only within this transaction via session_replication_role=replica.
-- Trigger remains enabled; no privileges altered.

BEGIN;
SET LOCAL session_replication_role = replica;

-- 1) medical_records: strip PHI free-text keys, keep whitelist
UPDATE public.audit_logs
SET
  old_values = CASE WHEN old_values IS NULL THEN NULL ELSE
    (old_values
      - 'chief_complaint' - 'chief_complaint_ar' - 'chief_complaint_en'
      - 'present_illness' - 'present_illness_ar' - 'present_illness_en'
      - 'notes' - 'notes_ar' - 'notes_en'
      - 'history_of_present_illness' - 'physical_examination'
      - 'assessment' - 'plan' - 'treatment_plan'
      - 'examination_findings' - 'clinical_notes' - 'private_notes'
    ) END,
  new_values = CASE WHEN new_values IS NULL THEN NULL ELSE
    (new_values
      - 'chief_complaint' - 'chief_complaint_ar' - 'chief_complaint_en'
      - 'present_illness' - 'present_illness_ar' - 'present_illness_en'
      - 'notes' - 'notes_ar' - 'notes_en'
      - 'history_of_present_illness' - 'physical_examination'
      - 'assessment' - 'plan' - 'treatment_plan'
      - 'examination_findings' - 'clinical_notes' - 'private_notes'
    ) END
WHERE entity_type = 'medical_records'
  AND created_at < TIMESTAMPTZ '2026-06-12 13:46:27+00';

-- 2) patients: strip PII identifiers
UPDATE public.audit_logs
SET
  old_values = CASE WHEN old_values IS NULL THEN NULL ELSE
    (old_values
      - 'full_name' - 'first_name' - 'last_name'
      - 'first_name_ar' - 'first_name_en' - 'last_name_ar' - 'last_name_en'
      - 'name_ar' - 'name_en' - 'name'
      - 'phone' - 'phone2' - 'mobile' - 'secondary_phone'
      - 'email'
      - 'national_id' - 'nationality_id' - 'id_number' - 'passport_number'
      - 'address' - 'address_ar' - 'address_en' - 'address_line1' - 'address_line2'
      - 'city' - 'country' - 'postal_code'
      - 'notes'
      - 'dob' - 'date_of_birth'
      - 'insurance_policy_number'
    ) END,
  new_values = CASE WHEN new_values IS NULL THEN NULL ELSE
    (new_values
      - 'full_name' - 'first_name' - 'last_name'
      - 'first_name_ar' - 'first_name_en' - 'last_name_ar' - 'last_name_en'
      - 'name_ar' - 'name_en' - 'name'
      - 'phone' - 'phone2' - 'mobile' - 'secondary_phone'
      - 'email'
      - 'national_id' - 'nationality_id' - 'id_number' - 'passport_number'
      - 'address' - 'address_ar' - 'address_en' - 'address_line1' - 'address_line2'
      - 'city' - 'country' - 'postal_code'
      - 'notes'
      - 'dob' - 'date_of_birth'
      - 'insurance_policy_number'
    ) END
WHERE entity_type = 'patients'
  AND created_at < TIMESTAMPTZ '2026-06-12 13:46:27+00';

-- 3) invoices: normalize to whitelist (idempotent via jsonb_build_object + COALESCE)
UPDATE public.audit_logs
SET
  old_values = CASE WHEN old_values IS NULL THEN NULL ELSE
    jsonb_strip_nulls(jsonb_build_object(
      'id',             old_values->'id',
      'invoice_number', old_values->'invoice_number',
      'patient_id',     old_values->'patient_id',
      'branch_id',      old_values->'branch_id',
      'status',         old_values->'status',
      'total',          old_values->'total',
      'paid_amount',    old_values->'paid_amount',
      'deleted_at',     old_values->'deleted_at'
    )) END,
  new_values = CASE WHEN new_values IS NULL THEN NULL ELSE
    jsonb_strip_nulls(jsonb_build_object(
      'id',             new_values->'id',
      'invoice_number', new_values->'invoice_number',
      'patient_id',     new_values->'patient_id',
      'branch_id',      new_values->'branch_id',
      'status',         new_values->'status',
      'total',          new_values->'total',
      'paid_amount',    new_values->'paid_amount',
      'deleted_at',     new_values->'deleted_at'
    )) END
WHERE entity_type = 'invoices'
  AND created_at < TIMESTAMPTZ '2026-06-12 13:46:27+00';

-- 4) payments: normalize to whitelist
UPDATE public.audit_logs
SET
  old_values = CASE WHEN old_values IS NULL THEN NULL ELSE
    jsonb_strip_nulls(jsonb_build_object(
      'id',             old_values->'id',
      'invoice_id',     old_values->'invoice_id',
      'patient_id',     old_values->'patient_id',
      'branch_id',      old_values->'branch_id',
      'amount',         old_values->'amount',
      'payment_method', old_values->'payment_method',
      'deleted_at',     old_values->'deleted_at'
    )) END,
  new_values = CASE WHEN new_values IS NULL THEN NULL ELSE
    jsonb_strip_nulls(jsonb_build_object(
      'id',             new_values->'id',
      'invoice_id',     new_values->'invoice_id',
      'patient_id',     new_values->'patient_id',
      'branch_id',      new_values->'branch_id',
      'amount',         new_values->'amount',
      'payment_method', new_values->'payment_method',
      'deleted_at',     new_values->'deleted_at'
    )) END
WHERE entity_type = 'payments'
  AND created_at < TIMESTAMPTZ '2026-06-12 13:46:27+00';

COMMIT;