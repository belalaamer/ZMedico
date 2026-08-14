-- RBAC-09: medical_records could never be completed by the attending doctor
--
-- Finding (discovered during a full front-desk-to-clinical workflow
-- end-to-end test: register patient -> book appointment -> check in ->
-- doctor consult -> attempt to finalize the record):
--
-- The only UPDATE policy on public.medical_records for non-admin callers is:
--   rec_update_clinical
--     USING:      (doctor_id = auth.uid() AND status = 'draft' AND deleted_at IS NULL)
--     WITH CHECK: (doctor_id = auth.uid() AND status = 'draft')
--
-- WITH CHECK is evaluated against the NEW (post-update) row. Pinning it to
-- status = 'draft' means the resulting row must ALSO still be 'draft' --
-- so a doctor can never use this policy to change status to 'completed' or
-- 'reviewed' (the only other two values of medical_record_status). This is
-- not a hypothetical: the application's own MedicalRecordEditor.tsx ships a
-- live Status dropdown (draft/completed/reviewed) on its Overview tab with
-- a "Save changes" button wired to exactly this UPDATE, and its error
-- handler has dedicated copy for a "this record is locked, completed
-- records can only be edited by the attending doctor within the grace
-- window" scenario -- confirming the intended design was: a doctor drafts
-- a record, marks it completed, and the record then locks (only an admin
-- override can touch it afterward). That intended lock-after-completion
-- behavior already works correctly via the USING clause (status='draft'
-- required to open the row for editing at all) -- but the completion
-- transition itself was never reachable because of the WITH CHECK's extra
-- status pin.
--
-- Reproduced live end-to-end as a real test doctor (RLS enforced, not
-- bypassed): created a real draft record for a real (test) patient/
-- appointment with doctor_id correctly set to self, successfully edited
-- notes while still draft (correct), then attempted
-- UPDATE ... SET status = 'completed' -- rejected with 42501 "new row
-- violates row-level security policy". No RPC or admin-only path exists to
-- perform this transition either (admin_override_medical_record only
-- rewrites notes_en, never status).
--
-- Fix: remove the status='draft' condition from WITH CHECK only. USING is
-- left completely unchanged, so the existing, correct, already-relied-upon
-- behavior is preserved in every other respect:
--   * A doctor can still only ever open a record for editing while it is
--     their own AND currently in 'draft' (USING, unchanged) -- once a
--     record's status leaves 'draft' via this fix, USING will no longer
--     match it on any future attempt, so the record locks immediately
--     after completion exactly as the frontend's copy already describes.
--   * WITH CHECK now only re-asserts doctor_id = auth.uid() (a doctor can
--     never reassign a record to a different doctor as part of the same
--     update), matching the ownership half of the original condition
--     exactly -- it just no longer also demands the impossible-to-satisfy
--     "and it must stay draft forever" clause.
--   * This does not touch rec_select_clinical, rec_insert_clinical,
--     rec_delete, any other table's policy, any grant, any function, or
--     J-14. Only the one WITH CHECK expression on rec_update_clinical is
--     replaced.

DROP POLICY rec_update_clinical ON public.medical_records;

CREATE POLICY rec_update_clinical
  ON public.medical_records
  FOR UPDATE
  TO authenticated
  USING (doctor_id = auth.uid() AND status = 'draft'::medical_record_status AND deleted_at IS NULL)
  WITH CHECK (doctor_id = auth.uid());
