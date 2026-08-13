-- Security remediation: J-03 (RBAC audit)
--
-- Finding: public.admin_override_medical_record(_record_id uuid, _new_notes
-- text, _admin_id uuid) authorized the caller using has_role(_admin_id,
-- 'admin') -- a CLIENT-SUPPLIED uuid -- instead of has_role(auth.uid(),
-- 'admin'). Audit attribution (audit_logs.user_id and the new_values
-- 'overridden_by' field) also used the same client-supplied _admin_id.
--
-- Exploit chain confirmed live this audit: no `admin`-role user currently
-- exists, but `system_owner` does, and has_role(_id, 'admin') returns true
-- for a system_owner row (system_owner satisfies every role check). Both
-- current real non-admin users (doctor role) can already discover the
-- system_owner's UUID today via the profiles table's same-branch RLS grant
-- (profiles_select_same_branch), since the system_owner shares their branch.
-- A non-admin caller could therefore pass that UUID as _admin_id, pass the
-- flawed authorization check, and have the SECURITY DEFINER function update
-- any medical_records.notes_en row -- with the audit trail falsely
-- attributing the change to the impersonated identity.
--
-- Final consumer sweep (Phase J-03.1 / J-03.2) found ZERO confirmed
-- consumers of the _admin_id parameter anywhere in the application code
-- (all medical pages, patient pages, hooks, components, lib helpers) or in
-- the database itself (no other function, trigger, view, or cron job
-- references this function by name). Option A was therefore authorized:
-- keep the existing three-parameter signature unchanged for compatibility,
-- but internally bind both the authorization decision and the audit
-- attribution to auth.uid() -- the real authenticated caller -- ignoring
-- the caller-supplied _admin_id value entirely.
--
-- This migration changes ONLY those two identity references. Every other
-- statement (existing record lookup, the medical_records UPDATE of
-- notes_en/updated_at, the audit_logs insert's other fields, the "Medical
-- record not found" error) is reproduced byte-for-byte unchanged. Function
-- name, parameter count/types/order, return type, SECURITY DEFINER, owner,
-- language, volatility, and search_path are all unchanged (verified
-- before/after: OID 33301 unchanged, owner postgres, prosecdef=true,
-- language plpgsql, volatility VOLATILE, search_path=public).
--
-- Not touched by this migration: has_role(), user_has_branch_access(), any
-- RLS policy on medical_records/profiles, audit triggers, grants, roles,
-- the app_role enum, any other function, any Edge Function, any
-- application code, or any previously completed J-01/J-06..J-15/J-14/E-01/
-- H-01/H1-01/H1-01-S/retired-staff-role work.

CREATE OR REPLACE FUNCTION public.admin_override_medical_record(_record_id uuid, _new_notes text, _admin_id uuid)
RETURNS medical_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.medical_records%ROWTYPE;
  v_new public.medical_records%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins may override a medical record.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_old FROM public.medical_records WHERE id = _record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Medical record not found.';
  END IF;

  UPDATE public.medical_records
     SET notes_en   = _new_notes,
         updated_at = now()
   WHERE id = _record_id
  RETURNING * INTO v_new;

  INSERT INTO public.audit_logs (user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (
    auth.uid(),
    v_new.branch_id,
    'admin_override',
    'medical_records',
    _record_id,
    jsonb_build_object('notes_en', v_old.notes_en, 'status', v_old.status, 'doctor_id', v_old.doctor_id),
    jsonb_build_object('notes_en', v_new.notes_en, 'overridden_by', auth.uid(), 'overridden_at', now())
  );

  RETURN v_new;
END;
$function$;
