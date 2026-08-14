-- RBAC-10: hr could never approve or reject a leave request
--
-- Finding (discovered continuing the same live end-to-end workflow test
-- as RBAC-09): after a doctor submitted their own leave request
-- (self-service, via the existing lr_insert_self policy) and hr correctly
-- saw it in their queue (thanks to the RBAC-08 branch fix), hr's attempt
-- to approve it returned zero rows -- silently blocked by RLS.
--
-- Root cause: the only UPDATE policy on public.leave_requests is:
--   lr_update: USING (has_role(auth.uid(),'admin') OR staff_id = auth.uid())
-- This never grants the hr role UPDATE access at all -- hr is not admin,
-- and is (correctly) not the row's own staff_id in the normal case of
-- approving someone else's leave. So hr never gets past the RLS row
-- filter in the first place.
--
-- This is confirmed to be a genuine oversight, not an intentional
-- restriction: this table already has a BEFORE UPDATE trigger,
-- tg_leave_request_self_guard(), whose own logic explicitly reads:
--   IF has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr') THEN
--     RETURN NEW;  -- admins and hr may change anything, including
--                     status/approved_by/approved_at/rejection_reason
--   END IF;
--   -- self-service staff may only touch their own row, and only on
--   -- non-approval fields; changing status/approver at all is rejected
--   -- with 'Forbidden: only admins or HR can approve...'
-- The trigger already assumes hr can approve; the RLS policy layer in
-- front of it never actually let hr's UPDATE attempts reach that trigger.
--
-- Fix: add an hr-scoped UPDATE policy mirroring the exact branch-scoping
-- shape already used and reviewed for hr_leave_select on this same table
-- (hr may act on a leave request only if the staff member it belongs to
-- is in a branch hr has access to; branch_id IS NULL is also allowed,
-- matching the existing SELECT policy's own semantics). This does not
-- touch lr_update, lr_delete, lr_insert_self, hr_leave_insert,
-- hr_leave_select, or lr_select -- all four of which are left completely
-- as-is -- and does not touch the trigger, any other table, any grant, or
-- J-14. Delete is deliberately left admin-only (unchanged); this migration
-- only adds the missing UPDATE (approve/reject) capability for hr.

CREATE POLICY hr_leave_update
  ON public.leave_requests
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'hr'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = leave_requests.staff_id
        AND (sp.branch_id IS NULL OR user_has_branch_access(sp.branch_id))
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'hr'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = leave_requests.staff_id
        AND (sp.branch_id IS NULL OR user_has_branch_access(sp.branch_id))
    )
  );
