import {beforeEach,describe,expect,it,vi} from 'vitest';
const {rpc,client}=vi.hoisted(()=>{const rpc=vi.fn();return {rpc,client:{rpc}};});
vi.mock('@/integrations/supabase/client',()=>({supabase:client}));
import {manageStaffAccount,indexStaffAccountRows} from './staffAccountLifecycle';
const staff={id:'staff-a',linked_user_id:'old-user',updated_at:'2026-10-18T08:00:00Z'};
beforeEach(()=>{rpc.mockReset();});
describe('staff lifecycle client transaction',()=>{
 it('retains the Supabase client receiver when calling rpc',async()=>{
  rpc.mockImplementation(function(this:unknown){expect(this).toBe(client);return Promise.resolve({data:{staff_id:staff.id,linked_user_id:'new-user'},error:null});});
  await manageStaffAccount(staff,'new-user');
 });
 it('sends observed versions for both sides of a move and the selected role in one request',async()=>{
  rpc.mockResolvedValue({data:{staff_id:staff.id,linked_user_id:'new-user'},error:null});
  const source={id:'staff-b',linked_user_id:'new-user',updated_at:'2026-10-18T07:00:00Z'};
  await manageStaffAccount(staff,'new-user',{previous:source,role:'doctor'});
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('hr_manage_staff_user_link',{
   p_staff_id:'staff-a',p_new_user_id:'new-user',p_expected_staff:{linked_user_id:'old-user',updated_at:staff.updated_at},
   p_previous_staff_id:'staff-b',p_expected_previous_staff:{linked_user_id:'new-user',updated_at:source.updated_at},p_new_role:'doctor',p_apply_role:true,
  });
 });
 it('preserves null as an explicit observed unlinked state',async()=>{
  rpc.mockResolvedValue({data:{staff_id:staff.id,linked_user_id:'new-user'},error:null});
  await manageStaffAccount({...staff,linked_user_id:null},'new-user');
  expect(rpc.mock.calls[0][1].p_expected_staff).toEqual({linked_user_id:null,updated_at:staff.updated_at});
  expect(rpc.mock.calls[0][1].p_apply_role).toBe(false);
 });
 it('refuses a missing version before sending a write',async()=>{
  await expect(manageStaffAccount({...staff,updated_at:''},null)).rejects.toThrow(/Reload/);
  expect(rpc).not.toHaveBeenCalled();
 });
 it('does not retry a conflict or issue a client-side compensation',async()=>{
  const error={message:'Staff link changed',code:'PT409'};rpc.mockResolvedValue({data:null,error});
  await expect(manageStaffAccount(staff,null)).rejects.toEqual(error);expect(rpc).toHaveBeenCalledTimes(1);
 });
 it.each([null,{staff_id:'other-staff',linked_user_id:'new-user'},{staff_id:staff.id,linked_user_id:'other-user'}])('rejects an unconfirmed or mismatched acknowledgement: %j',async data=>{
  rpc.mockResolvedValue({data,error:null});await expect(manageStaffAccount(staff,'new-user')).rejects.toThrow(/could not be confirmed/);
 });
});

describe('explicit account link indexing',()=>{
 const legacy={id:'user-x',linked_user_id:null,updated_at:'old',branch_id:'branch-a',employee_id:'legacy'};
 const explicit={id:'employee-a',linked_user_id:'user-x',updated_at:'new',branch_id:'branch-a',employee_id:'current'};
 it.each([[legacy,explicit],[explicit,legacy]])('keeps actual link regardless of query order: %j',(...rows)=>{
  expect(indexStaffAccountRows(rows)['user-x']).toEqual(explicit);
 });
 it('retains legacy branch metadata but ignores deleted links',()=>{
  expect(indexStaffAccountRows([legacy,{...explicit,deleted_at:'2026-10-18'}])['user-x']).toEqual(legacy);
 });
});
