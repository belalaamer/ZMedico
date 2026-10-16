import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({fetch:vi.fn(),legacy:vi.fn(),actor:'actor'}));
vi.mock('@/hooks/useUserRole',()=>({useUserRole:()=>({roles:['receptionist'],isAdmin:false,loading:false})}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:mocks.actor}})}));
vi.mock('@/lib/authz/useAuthzState',()=>({useAuthzState:()=>({fingerprint:null})}));
vi.mock('@/lib/authz/canonicalFlag',()=>({isCanonicalAuthzEnabled:()=>true}));
vi.mock('@/lib/authz/canonicalPermissions',()=>({fetchCanonicalPermissions:(id:string)=>mocks.fetch(id)}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
 if(table==='staff_profiles_self')return{select:()=>({neq:()=>({limit:()=>({maybeSingle:async()=>({data:{status:'active'},error:null})})})})};
 mocks.legacy(table);throw Error('Legacy catalog must not be queried');
}}}));
import {usePermissions} from './usePermissions';
beforeEach(()=>{vi.clearAllMocks();mocks.actor='actor';mocks.fetch.mockResolvedValue({appointments:new Set(['view'])});});
afterEach(cleanup);
it('accepts actual canonical grants for the current actor',async()=>{const{result}=renderHook(usePermissions);await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.can('appointments')).toBe(true);expect(mocks.legacy).not.toHaveBeenCalled();});
it.each(['42501','PGRST202','503'])('canonical %s denial never grants legacy defaults',async code=>{mocks.fetch.mockRejectedValue({code,message:'private'});const{result}=renderHook(usePermissions);await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.can('appointments')).toBe(false);expect(mocks.legacy).not.toHaveBeenCalled();});
it('an intentionally empty response remains denied',async()=>{mocks.fetch.mockResolvedValue({});const{result}=renderHook(usePermissions);await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.can('appointments')).toBe(false);expect(mocks.legacy).not.toHaveBeenCalled();});
it('late grants from a prior identity cannot replace current deny',async()=>{
 let finish!:(v:unknown)=>void;mocks.fetch.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValue({});
 const{result,rerender}=renderHook(usePermissions);mocks.actor='new';rerender();await waitFor(()=>expect(result.current.loading).toBe(false));
 await act(async()=>{finish({settings:new Set(['edit'])});});expect(result.current.can('settings','edit')).toBe(false);expect(mocks.legacy).not.toHaveBeenCalled();
});
