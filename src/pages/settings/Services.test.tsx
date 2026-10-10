import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
const state=vi.hoisted(()=>({lang:'en',result:{data:{id:'service-qa'} as {id:string}|null,error:null as null|{code:string,message:string}},failure:null as Error|null,pending:null as Promise<unknown>|null,failRead:false}));
const updates=vi.hoisted(()=>vi.fn());const reads=vi.hoisted(()=>vi.fn());
const notify=vi.hoisted(()=>({error:vi.fn(),success:vi.fn()}));
vi.mock('sonner',()=>({toast:notify}));
vi.mock('./SettingsLayout',()=>({default:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock('@/components/ConsumablesEditor',()=>({ConsumablesEditor:()=>null}));
vi.mock('@/contexts/BranchContext',()=>({useBranch:()=>({subscription:{tenant_id:'tenant-qa'}})}));
vi.mock('@/contexts/I18nContext',()=>({useI18n:()=>({t:(key:string)=>key,lang:state.lang})}));
vi.mock('@/components/ui/tabs',()=>({Tabs:({children}:{children:ReactNode})=><div>{children}</div>,TabsList:({children}:{children:ReactNode})=><div>{children}</div>,TabsTrigger:({children}:{children:ReactNode})=><button>{children}</button>,TabsContent:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock('@/components/ui/dropdown-menu',()=>({DropdownMenu:({children}:{children:ReactNode})=><div>{children}</div>,DropdownMenuTrigger:({children}:{children:ReactNode})=><>{children}</>,DropdownMenuContent:({children}:{children:ReactNode})=><div>{children}</div>,DropdownMenuItem:({children,onClick}:{children:ReactNode,onClick:()=>void})=><button onClick={onClick}>{children}</button>,DropdownMenuSeparator:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>({
 select:()=>({is:()=>({order:()=>{reads(table);if(state.failRead)return Promise.reject(new Error('private refresh diagnostics'));return Promise.resolve({data:table==='services'?[{id:'service-qa',name_en:'QA Service',name_ar:'خدمة اختبار',category_id:null,is_active:true,default_price:10,default_duration_minutes:30,deleted_at:null}]:[{id:'category-qa',name_en:'QA Category',name_ar:'تصنيف اختبار',is_active:true,display_order:0,deleted_at:null}]});}})}),
 update:(payload:unknown)=>({eq:(_key:string,id:string)=>{updates(table,id,payload);const pending=state.pending??(state.failure?Promise.reject(state.failure):Promise.resolve(state.result));return Object.assign(pending,{select:()=>({maybeSingle:()=>pending})});}}),
})}}));
import Services from './Services';
beforeEach(()=>{state.lang='en';state.result={data:{id:'service-qa'},error:null};state.failure=null;state.pending=null;state.failRead=false;updates.mockReset();reads.mockReset();notify.error.mockReset();notify.success.mockReset();});
afterEach(()=>cleanup());
async function button(title:string,action='inactive'){await screen.findByText(title);return within(screen.getByText(title).closest('tr')!).getByRole('button',{name:action});}
it('reports rejected service activation instead of silently refreshing',async()=>{
 state.result={data:null,error:{code:'42501',message:'private policy diagnostic'}};
 render(<Services/>);fireEvent.click(await button('QA Service'));
 await waitFor(()=>expect(notify.error).toHaveBeenCalled());
 expect(notify.error.mock.calls.flat().join()).not.toContain('private policy');
 expect(reads).toHaveBeenCalledTimes(2);expect(notify.success).not.toHaveBeenCalled();
});
it('treats zero affected rows as an unconfirmed change, not success',async()=>{
 state.result={data:null,error:null};render(<Services/>);fireEvent.click(await button('QA Service'));
 await waitFor(()=>expect(notify.error).toHaveBeenCalled());expect(notify.success).not.toHaveBeenCalled();expect(reads).toHaveBeenCalledTimes(2);
});
it('handles thrown transport errors and releases the row lock for retry',async()=>{
 state.failure=new Error('private network stack');render(<Services/>);const toggle=await button('QA Service');fireEvent.click(toggle);
 await waitFor(()=>expect(notify.error).toHaveBeenCalledTimes(1));state.failure=null;fireEvent.click(toggle);
 await waitFor(()=>expect(notify.success).toHaveBeenCalledTimes(1));expect(updates).toHaveBeenCalledTimes(2);
});
it('suppresses duplicate same-row activation while request is pending',async()=>{
 let finish!:(v:unknown)=>void;state.pending=new Promise(resolve=>{finish=resolve;});render(<Services/>);const toggle=await button('QA Service');
 fireEvent.click(toggle);fireEvent.click(toggle);expect(updates).toHaveBeenCalledTimes(1);
 await act(async()=>{finish({data:{id:'service-qa'},error:null});});await waitFor(()=>expect(notify.success).toHaveBeenCalledTimes(1));
});
it('reports rejected category activation with Arabic guidance',async()=>{
 state.lang='ar';state.result={data:null,error:{code:'42501',message:'private policy diagnostic'}};render(<Services/>);fireEvent.click(await button('تصنيف اختبار'));
 await waitFor(()=>expect(notify.error).toHaveBeenCalledWith('ليس لديك صلاحية تعديل هذا السجل.'));expect(reads).toHaveBeenCalledTimes(2);
});
it('confirms category change only after exact returned identity',async()=>{
 state.result={data:{id:'category-qa'},error:null};render(<Services/>);fireEvent.click(await button('QA Category'));
 await waitFor(()=>expect(notify.success).toHaveBeenCalledWith('saved'));expect(updates).toHaveBeenCalledWith('service_categories','category-qa',{is_active:false});await waitFor(()=>expect(reads).toHaveBeenCalledTimes(4));
});
it('does not acknowledge a different returned row',async()=>{
 state.result={data:{id:'another-row'},error:null};render(<Services/>);fireEvent.click(await button('QA Service'));
 await waitFor(()=>expect(notify.error).toHaveBeenCalled());expect(notify.success).not.toHaveBeenCalled();
});
it('distinguishes failed refresh from a confirmed saved change',async()=>{
 render(<Services/>);const toggle=await button('QA Service');state.failRead=true;fireEvent.click(toggle);
 await waitFor(()=>expect(notify.error).toHaveBeenCalledWith('The change was saved, but the list could not be refreshed. Refresh the page.'));
 expect(notify.success).toHaveBeenCalledWith('saved');expect(updates).toHaveBeenCalledTimes(1);
 expect(notify.error.mock.calls.flat().join()).not.toContain('private refresh');
});
