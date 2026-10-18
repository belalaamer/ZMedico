import {supabase} from '@/integrations/supabase/client';

export type StaffAccountSnapshot = {
  id: string;
  linked_user_id: string | null;
  updated_at: string;
};

/** One server transaction owns link, optional move, roles and audit. */
export async function manageStaffAccount(
  staff: StaffAccountSnapshot,
  userId: string | null,
  options: {previous?: StaffAccountSnapshot; role?: string} = {},
) {
  if (!staff.id || !staff.updated_at || (options.previous && !options.previous.updated_at)) {
    throw new Error('Staff record changed or is incomplete. Reload before retrying.');
  }
  const rpc=supabase.rpc.bind(supabase) as unknown as (name:string,args:Record<string,unknown>)=>Promise<{
    data:{staff_id:string;linked_user_id:string|null}|null;
    error:{message:string;code?:string}|null;
  }>;
  const {data, error} = await rpc('hr_manage_staff_user_link', {
    p_staff_id: staff.id,
    p_new_user_id: userId,
    p_expected_staff: {linked_user_id: staff.linked_user_id, updated_at: staff.updated_at},
    p_previous_staff_id: options.previous?.id ?? null,
    p_expected_previous_staff: options.previous
      ? {linked_user_id: options.previous.linked_user_id, updated_at: options.previous.updated_at}
      : null,
    p_new_role: options.role ?? null,
    p_apply_role: options.role !== undefined,
  });
  if (error) throw error;
  if (!data || data.staff_id !== staff.id || data.linked_user_id !== userId) {
    throw new Error('Staff operation could not be confirmed. Reload before retrying.');
  }
  return data;
}

export function staffAccountError(error:unknown,fallback:string){
  return typeof error==='object'&&error!==null&&'message' in error&&typeof error.message==='string'?error.message:fallback;
}

export type StaffAccountRow = StaffAccountSnapshot & {
  branch_id:string|null;
  employee_id:string|null;
  deleted_at?:string|null;
};

/** Explicit links win over legacy id-based branch metadata in either read order. */
export function indexStaffAccountRows(rows:StaffAccountRow[]){
  const index:Record<string,StaffAccountRow>={};
  for(const row of rows){
    if(row.deleted_at)continue;
    const key=row.linked_user_id ?? row.id;
    if(!row.linked_user_id&&index[key]?.linked_user_id)continue;
    index[key]=row;
  }
  return index;
}
