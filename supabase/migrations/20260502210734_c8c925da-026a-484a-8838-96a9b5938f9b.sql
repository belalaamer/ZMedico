-- Update leave request guard to allow HR to approve/reject
CREATE OR REPLACE FUNCTION public.tg_leave_request_self_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.staff_id = auth.uid() THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
      RAISE EXCEPTION 'Forbidden: only admins or HR can approve, reject, or change ownership of leave requests';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Forbidden: cannot update leave requests for other staff';
END;
$function$;

-- Update staff self-update guard to allow HR to modify employment fields
CREATE OR REPLACE FUNCTION public.tg_staff_self_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.position_id IS DISTINCT FROM OLD.position_id
       OR NEW.department_id IS DISTINCT FROM OLD.department_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.hire_date IS DISTINCT FROM OLD.hire_date
       OR NEW.contract_type IS DISTINCT FROM OLD.contract_type
       OR NEW.contract_end_date IS DISTINCT FROM OLD.contract_end_date
       OR NEW.salary IS DISTINCT FROM OLD.salary
       OR NEW.salary_currency IS DISTINCT FROM OLD.salary_currency
       OR NEW.bank_name IS DISTINCT FROM OLD.bank_name
       OR NEW.bank_account IS DISTINCT FROM OLD.bank_account
       OR NEW.working_hours_per_week IS DISTINCT FROM OLD.working_hours_per_week
       OR NEW.annual_leave_balance IS DISTINCT FROM OLD.annual_leave_balance
       OR NEW.sick_leave_balance IS DISTINCT FROM OLD.sick_leave_balance
       OR NEW.national_id IS DISTINCT FROM OLD.national_id
       OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.termination_date IS DISTINCT FROM OLD.termination_date
       OR NEW.termination_reason IS DISTINCT FROM OLD.termination_reason
    THEN
      RAISE EXCEPTION 'Forbidden: only HR/admin may modify employment, salary, or identity fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;