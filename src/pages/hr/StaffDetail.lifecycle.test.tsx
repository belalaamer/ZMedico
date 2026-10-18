import {act,fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({can:true,id:'staff-a',branch:'branch-a',user:'admin-a',rpc:vi.fn(),from:vi.fn(),success:vi.fn(),error:vi.fn(),staffReads:new Map<string,Promise<unknown>>() }));
vi.mock('react-router-dom',()=>({useParams:()=>({id:state.id}),Link:({children,...props}:React.ComponentProps<'a'>)=> <a {...props}>{children}</a>}));
vi.mock('@/contexts/I18nContext',()=>({useI18n:()=>({lang:'en',t:(k:string)=>k})}));
vi.mock('@/contexts/BranchContext',()=>({useBranch:()=>({currentBranchId:state.branch})}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:state.user}})}));
vi.mock('@/lib/authz/useAuthorization',()=>({useAuthorization:()=>({authz:{hasRoleAny:()=>true,can:()=>state.can}})}));
vi.mock('@/components/Can',()=>({Can:({children}:{children:React.ReactNode})=>children}));
vi.mock('./Staff',()=>({statusLabel:(s:string)=>s}));
vi.mock('./StaffBranchesTab',()=>({default:()=>null}));
vi.mock('./DoctorServicesTab',()=>({default:()=>null}));
vi.mock('sonner',()=>({toast:{success:state.success,error:state.error}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:state.from,rpc:state.rpc}}));
import StaffDetail from './StaffDetail';
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
const staff=(id:string,linked:string|null=null)=>({id,linked_user_id:linked,updated_at:'2026-10-18T08:00:00Z',status:'active',employee_id:id,branch_id:'branch-a'});
beforeEach(()=>{
 state.can=true;state.id='staff-a';state.branch='branch-a';state.user='admin-a';state.staffReads.clear();state.rpc.mockReset();state.success.mockReset();state.error.mockReset();
 state.from.mockImplementation((table:string)=>{
  let id:string|undefined,kind='';const q:Record<string,unknown>={};
  for(const method of ['select','eq','order','limit','not','is'])q[method]=(...args:unknown[])=>{if(method==='eq'&&args[0]==='id')id=String(args[1]);if(method==='not')kind='taken';return q;};
  q.maybeSingle=()=>{if(table==='staff_profiles')return state.staffReads.get(id!) ?? Promise.resolve({data:staff(id!)});if(table==='profiles')return Promise.resolve({data:{id,full_name:'Profile '+id,email:id+'@example.invalid'}});return Promise.resolve({data:null});};
  q.then=(resolve:(v:unknown)=>void)=>resolve({data:table==='profiles'?[{id:'target',full_name:'Target user',email:'target@example.invalid'}]:kind==='taken'?[]:[]});return q;
 });
});
afterEach(cleanup);
describe('staff detail operation ownership',()=>{
 it('reloads when late authorization resolution changes the scope generation',async()=>{
  state.can=false;const old=deferred<unknown>();state.staffReads.set('staff-a',old.promise);
  const {rerender}=render(<StaffDetail/>);state.can=true;state.staffReads.set('staff-a',Promise.resolve({data:staff('staff-a','authorized-account')}));rerender(<StaffDetail/>);
  await screen.findByText('Profile authorized-account');await act(async()=>old.resolve({data:staff('staff-a','stale-account')}));
  expect(screen.queryByText('Profile stale-account')).toBeNull();
 });
 it('ignores an old A read after navigating A→B→A',async()=>{
  const old=deferred<unknown>();state.staffReads.set('staff-a',old.promise);const {rerender}=render(<StaffDetail/>);
  state.id='staff-b';rerender(<StaffDetail/>);await screen.findByText('Profile staff-b');
  state.id='staff-a';state.staffReads.set('staff-a',Promise.resolve({data:staff('staff-a','fresh-account')}));rerender(<StaffDetail/>);await screen.findByText('Profile fresh-account');
  await act(async()=>old.resolve({data:staff('staff-a','stale-account')}));
  expect(screen.queryByText('Profile stale-account')).toBeNull();expect(screen.getByText('Profile fresh-account')).toBeTruthy();
 });
 it('submits once and ignores an old successful write after changing record',async()=>{
  const pending=deferred<unknown>();state.rpc.mockReturnValue(pending.promise);const {rerender}=render(<StaffDetail/>);
  fireEvent.click(await screen.findByRole('button',{name:'Link to user'}));fireEvent.click(await screen.findByRole('button',{name:/Target user/}));
  const save=screen.getByRole('button',{name:'Link'});fireEvent.click(save);fireEvent.click(save);expect(state.rpc).toHaveBeenCalledTimes(1);
  expect(state.rpc.mock.calls[0][1].p_expected_staff.linked_user_id).toBeNull();
  state.id='staff-b';rerender(<StaffDetail/>);await screen.findByText('Profile staff-b');
  await act(async()=>pending.resolve({data:{staff_id:'staff-a',linked_user_id:'target'},error:null}));
  expect(state.success).not.toHaveBeenCalled();expect(screen.queryByText('Profile target')).toBeNull();expect(screen.getByText('Profile staff-b')).toBeTruthy();
 });
 it('ignores a late write after the same administrator identity changes to another account',async()=>{
  const pending=deferred<unknown>();state.rpc.mockReturnValue(pending.promise);const {rerender}=render(<StaffDetail/>);
  fireEvent.click(await screen.findByRole('button',{name:'Link to user'}));fireEvent.click(await screen.findByRole('button',{name:/Target user/}));fireEvent.click(screen.getByRole('button',{name:'Link'}));
  state.user='admin-b';rerender(<StaffDetail/>);await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  await act(async()=>pending.resolve({data:{staff_id:'staff-a',linked_user_id:'target'},error:null}));expect(state.success).not.toHaveBeenCalled();expect(state.error).not.toHaveBeenCalled();
 });
});
