import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:mocks}));
import {fetchCanonicalPermissions} from './canonicalPermissions';
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue({data:[],error:null});});
it('calls only the self RPC without sending a user identifier',async()=>{
 mocks.rpc.mockResolvedValue({data:[{user_id:'actor',permission_key:'appointments.view'}],error:null});
 expect((await fetchCanonicalPermissions('actor')).appointments.has('view')).toBe(true);
 expect(mocks.rpc).toHaveBeenCalledWith('current_user_effective_permissions');expect(mocks.from).not.toHaveBeenCalled();
});
it('preserves an intentionally empty grant set without fallback',async()=>{expect(await fetchCanonicalPermissions('actor')).toEqual({});expect(mocks.rpc).toHaveBeenCalledTimes(1);});
it('denies absent caller scope before making a request',async()=>{await expect(fetchCanonicalPermissions('')).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();});
it.each(['42501','PGRST202','503'])('propagates %s without catalog or legacy requests',async code=>{
 const error={code,message:'private details'};mocks.rpc.mockResolvedValue({data:null,error});await expect(fetchCanonicalPermissions('actor')).rejects.toBe(error);expect(mocks.from).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('does not retry an ambiguous transport failure',async()=>{mocks.rpc.mockRejectedValue(new Error('transport'));await expect(fetchCanonicalPermissions('actor')).rejects.toThrow('transport');expect(mocks.rpc).toHaveBeenCalledTimes(1);});
it('rejects stale identity responses',async()=>{mocks.rpc.mockResolvedValue({data:[{user_id:'previous',permission_key:'settings.edit'}],error:null});await expect(fetchCanonicalPermissions('actor')).rejects.toThrow('scope');});
it.each([null,{},[{user_id:'actor',permission_key:null}]])('rejects malformed success payload %#',async data=>{mocks.rpc.mockResolvedValue({data,error:null});await expect(fetchCanonicalPermissions('actor')).rejects.toThrow();});
