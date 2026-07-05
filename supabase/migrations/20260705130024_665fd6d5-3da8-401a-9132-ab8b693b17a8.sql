
-- 1) queue_settings: restrict writes to admin/manager with branch access
DROP POLICY IF EXISTS qs_insert_branch_access ON public.queue_settings;
DROP POLICY IF EXISTS qs_update_branch_access ON public.queue_settings;
DROP POLICY IF EXISTS qs_delete_branch_access ON public.queue_settings;

CREATE POLICY qs_insert_manager ON public.queue_settings
FOR INSERT TO authenticated
WITH CHECK (
  user_has_branch_access(branch_id)
  AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
);

CREATE POLICY qs_update_manager ON public.queue_settings
FOR UPDATE TO authenticated
USING (
  user_has_branch_access(branch_id)
  AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
)
WITH CHECK (
  user_has_branch_access(branch_id)
  AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
);

CREATE POLICY qs_delete_manager ON public.queue_settings
FOR DELETE TO authenticated
USING (
  user_has_branch_access(branch_id)
  AND has_role(auth.uid(),'admin'::app_role)
);

-- 2 + 3) staff self-update guard: cover commission_percent AND linked_user_id path
CREATE OR REPLACE FUNCTION public.tg_staff_self_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'hr'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() OR OLD.linked_user_id = auth.uid() THEN
    IF NEW.employee_id            IS DISTINCT FROM OLD.employee_id
       OR NEW.position_id         IS DISTINCT FROM OLD.position_id
       OR NEW.department_id       IS DISTINCT FROM OLD.department_id
       OR NEW.branch_id           IS DISTINCT FROM OLD.branch_id
       OR NEW.hire_date           IS DISTINCT FROM OLD.hire_date
       OR NEW.contract_type       IS DISTINCT FROM OLD.contract_type
       OR NEW.contract_end_date   IS DISTINCT FROM OLD.contract_end_date
       OR NEW.salary              IS DISTINCT FROM OLD.salary
       OR NEW.salary_currency     IS DISTINCT FROM OLD.salary_currency
       OR NEW.commission_percent  IS DISTINCT FROM OLD.commission_percent
       OR NEW.bank_name           IS DISTINCT FROM OLD.bank_name
       OR NEW.bank_account        IS DISTINCT FROM OLD.bank_account
       OR NEW.working_hours_per_week IS DISTINCT FROM OLD.working_hours_per_week
       OR NEW.annual_leave_balance   IS DISTINCT FROM OLD.annual_leave_balance
       OR NEW.sick_leave_balance     IS DISTINCT FROM OLD.sick_leave_balance
       OR NEW.national_id         IS DISTINCT FROM OLD.national_id
       OR NEW.date_of_birth       IS DISTINCT FROM OLD.date_of_birth
       OR NEW.status              IS DISTINCT FROM OLD.status
       OR NEW.termination_date    IS DISTINCT FROM OLD.termination_date
       OR NEW.termination_reason  IS DISTINCT FROM OLD.termination_reason
       OR NEW.linked_user_id      IS DISTINCT FROM OLD.linked_user_id
       OR NEW.id                  IS DISTINCT FROM OLD.id
    THEN
      RAISE EXCEPTION 'Forbidden: only HR/admin may modify employment, salary, commission, or identity fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
