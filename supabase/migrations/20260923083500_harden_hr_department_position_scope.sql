-- Harden HR department/position tenancy and prevent cross-branch position merges.

drop policy if exists departments_read_scope_enforced on public.departments;
create policy departments_read_scope_enforced
on public.departments
as restrictive
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'system_owner'::public.app_role)
  or branch_id is null
  or public.user_has_branch_access(branch_id)
);

drop policy if exists staff_positions_read_scope_enforced on public.staff_positions;
create policy staff_positions_read_scope_enforced
on public.staff_positions
as restrictive
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'system_owner'::public.app_role)
  or department_id is null
  or exists (
    select 1
    from public.departments d
    where d.id = staff_positions.department_id
      and d.deleted_at is null
      and (
        d.branch_id is null
        or public.user_has_branch_access(d.branch_id)
      )
  )
);

drop policy if exists staff_positions_insert_scope_enforced on public.staff_positions;
create policy staff_positions_insert_scope_enforced
on public.staff_positions
as restrictive
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'system_owner'::public.app_role)
  or (
    department_id is not null
    and exists (
      select 1
      from public.departments d
      where d.id = staff_positions.department_id
        and d.deleted_at is null
        and d.branch_id is not null
        and public.user_has_branch_access(d.branch_id)
    )
  )
);

drop policy if exists staff_positions_update_scope_enforced on public.staff_positions;
create policy staff_positions_update_scope_enforced
on public.staff_positions
as restrictive
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'system_owner'::public.app_role)
  or (
    department_id is not null
    and exists (
      select 1
      from public.departments d
      where d.id = staff_positions.department_id
        and d.deleted_at is null
        and d.branch_id is not null
        and public.user_has_branch_access(d.branch_id)
    )
  )
)
with check (
  public.has_role((select auth.uid()), 'system_owner'::public.app_role)
  or (
    department_id is not null
    and exists (
      select 1
      from public.departments d
      where d.id = staff_positions.department_id
        and d.deleted_at is null
        and d.branch_id is not null
        and public.user_has_branch_access(d.branch_id)
    )
  )
);

drop policy if exists staff_positions_delete_scope_enforced on public.staff_positions;
create policy staff_positions_delete_scope_enforced
on public.staff_positions
as restrictive
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'system_owner'::public.app_role)
  or (
    department_id is not null
    and exists (
      select 1
      from public.departments d
      where d.id = staff_positions.department_id
        and d.deleted_at is null
        and d.branch_id is not null
        and public.user_has_branch_access(d.branch_id)
    )
  )
);

create or replace function public.merge_staff_position(source_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _is_system_owner boolean := false;
  _source_department uuid;
  _target_department uuid;
  _source_branch uuid;
  _target_branch uuid;
  _reassigned integer := 0;
begin
  if _uid is null then
    raise exception 'Forbidden: authentication required'
      using errcode = '42501';
  end if;

  _is_system_owner := public.has_role(_uid, 'system_owner'::public.app_role);

  if not _is_system_owner and not public.has_permission(_uid, 'hr.edit') then
    raise exception 'Forbidden: missing hr.edit permission'
      using errcode = '42501';
  end if;

  if source_id = target_id then
    return;
  end if;

  select sp.department_id, d.branch_id
    into _source_department, _source_branch
  from public.staff_positions sp
  left join public.departments d
    on d.id = sp.department_id
   and d.deleted_at is null
  where sp.id = source_id
    and sp.deleted_at is null;

  if not found then
    raise exception 'Source position not found'
      using errcode = 'P0002';
  end if;

  if _source_department is not null and not exists (
    select 1 from public.departments d
    where d.id = _source_department and d.deleted_at is null
  ) then
    raise exception 'Source position department is unavailable'
      using errcode = 'P0002';
  end if;

  select sp.department_id, d.branch_id
    into _target_department, _target_branch
  from public.staff_positions sp
  left join public.departments d
    on d.id = sp.department_id
   and d.deleted_at is null
  where sp.id = target_id
    and sp.deleted_at is null;

  if not found then
    raise exception 'Target position not found'
      using errcode = 'P0002';
  end if;

  if _target_department is not null and not exists (
    select 1 from public.departments d
    where d.id = _target_department and d.deleted_at is null
  ) then
    raise exception 'Target position department is unavailable'
      using errcode = 'P0002';
  end if;

  if _source_branch is distinct from _target_branch then
    raise exception 'Cannot merge positions across branches'
      using errcode = '42501';
  end if;

  if _source_branch is null then
    if not _is_system_owner then
      raise exception 'Only system owners may merge global positions'
        using errcode = '42501';
    end if;
  elsif not _is_system_owner and not public.user_has_branch_access(_source_branch) then
    raise exception 'Forbidden: no access to position branch'
      using errcode = '42501';
  end if;

  if _source_branch is not null and exists (
    select 1
    from public.staff_profiles sp
    where sp.position_id = source_id
      and sp.deleted_at is null
      and sp.branch_id is distinct from _source_branch
  ) then
    raise exception 'Source position has cross-branch staff assignments'
      using errcode = '23514';
  end if;

  update public.staff_profiles
     set position_id = target_id
   where position_id = source_id
     and (
       _source_branch is null
       or branch_id = _source_branch
     );
  get diagnostics _reassigned = row_count;

  update public.staff_positions
     set deleted_at = now()
   where id = source_id
     and deleted_at is null;

  begin
    insert into public.audit_logs (
      user_id, branch_id, action, entity_type, entity_id, metadata
    )
    values (
      _uid,
      _source_branch,
      'merge',
      'staff_position',
      source_id,
      jsonb_build_object(
        'source_id', source_id,
        'target_id', target_id,
        'branch_id', _source_branch,
        'reassigned_count', _reassigned
      )
    );
  exception when others then
    null;
  end;
end;
$function$;

revoke all on function public.merge_staff_position(uuid, uuid) from public;
revoke all on function public.merge_staff_position(uuid, uuid) from anon;
grant execute on function public.merge_staff_position(uuid, uuid) to authenticated;
grant execute on function public.merge_staff_position(uuid, uuid) to service_role;
