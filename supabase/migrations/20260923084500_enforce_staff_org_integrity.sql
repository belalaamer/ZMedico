-- Enforce HR relational integrity between staff branch, department and position.

create or replace function public.tg_staff_profile_org_integrity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_department_branch uuid;
  v_position_department uuid;
  v_position_branch uuid;
  v_position_department_exists boolean;
begin
  if new.department_id is not null then
    select d.branch_id
      into v_department_branch
    from public.departments d
    where d.id = new.department_id
      and d.deleted_at is null;

    if not found then
      raise exception 'Department is unavailable'
        using errcode = '23503';
    end if;

    if v_department_branch is not null
       and new.branch_id is distinct from v_department_branch then
      raise exception 'Staff department must belong to the staff branch'
        using errcode = '23514';
    end if;
  end if;

  if new.position_id is not null then
    select p.department_id, d.branch_id, (d.id is not null)
      into v_position_department, v_position_branch, v_position_department_exists
    from public.staff_positions p
    left join public.departments d
      on d.id = p.department_id
     and d.deleted_at is null
    where p.id = new.position_id
      and p.deleted_at is null;

    if not found then
      raise exception 'Position is unavailable'
        using errcode = '23503';
    end if;

    if v_position_department is not null and not v_position_department_exists then
      raise exception 'Position department is unavailable'
        using errcode = '23503';
    end if;

    if v_position_department is not null
       and new.department_id is distinct from v_position_department then
      raise exception 'Staff position must belong to the selected department'
        using errcode = '23514';
    end if;

    if v_position_branch is not null
       and new.branch_id is distinct from v_position_branch then
      raise exception 'Staff position must belong to the staff branch'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.tg_staff_profile_org_integrity() from public;
revoke all on function public.tg_staff_profile_org_integrity() from anon;
revoke all on function public.tg_staff_profile_org_integrity() from authenticated;
grant execute on function public.tg_staff_profile_org_integrity() to service_role;

drop trigger if exists trg_staff_profile_org_integrity on public.staff_profiles;
create trigger trg_staff_profile_org_integrity
before insert or update of branch_id, department_id, position_id
on public.staff_profiles
for each row
execute function public.tg_staff_profile_org_integrity();
