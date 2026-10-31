import {act,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({loading:true,owner:false,user:{id:'qa-user'} as {id:string}|null,queries:[] as Array<(value:unknown)=>void>,rejects:[] as Array<(reason:unknown)=>void>,handoffs:[] as Array<(value:unknown)=>void>,filters:[] as string[],sync:null as null|(()=>void)}));
vi.mock('./AuthContext',()=>({useAuth:()=>({user:state.user})}));
vi.mock('@/hooks/useUserRole',()=>({useUserRole:()=>({isSystemOwner:state.owner,loading:state.loading})}));
vi.mock('@/lib/dataSync',()=>({subscribeDataSync:(_topics:unknown,callback:()=>void)=>{state.sync=callback;return()=>{if(state.sync===callback)state.sync=null;};}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
  from:()=>({select:(columns:string)=>columns==='tenant_id'
    ?{eq:()=>({maybeSingle:()=>state.owner?new Promise(resolve=>state.handoffs.push(resolve)):Promise.resolve({data:null,error:null})})}
    :{order:()=>{const promise=new Promise((resolve,reject)=>{state.queries.push(resolve);state.rejects.push(reject);});return Object.assign(promise,{eq:(_column:string,value:string)=>{state.filters.push(value);return promise;}});}}}),
  rpc:async()=>({data:{access_allowed:true,plan_features:{}},error:null}),
}}));
import {BranchProvider,useBranch} from './BranchContext';
function Probe(){const branch=useBranch();return <><span data-testid="ready">{String(branch.branchSelectionReady)}</span><span data-testid="sub-loading">{String(branch.subscriptionLoading)}</span><span data-testid="branches">{branch.branches.map(b=>b.id).join(',')}</span></>;}
const tree=()=> <MemoryRouter initialEntries={['/patients']}><BranchProvider><Probe/></BranchProvider></MemoryRouter>;
describe('branch bootstrap response ordering',()=>{
  beforeEach(()=>{state.loading=true;state.owner=false;state.user={id:'qa-user'};state.queries=[];state.rejects=[];state.handoffs=[];state.filters=[];state.sync=null;localStorage.clear();sessionStorage.clear();});
  it('ignores an older role-loading result after newer branch selection is ready',async()=>{
    const view=render(tree());
    await waitFor(()=>expect(state.queries).toHaveLength(1));
    state.loading=false;view.rerender(tree());
    await waitFor(()=>expect(state.queries).toHaveLength(2));
    const response={data:[{id:'qa-branch',name_en:'QA',name_ar:'اختبار'}],error:null};
    await act(async()=>{state.queries[1](response);});
    await waitFor(()=>expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    await act(async()=>{state.queries[0](response);});
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
  });
  it('data-sync reload uses the current role readiness rather than the initial closure',async()=>{
    const view=render(tree());
    await waitFor(()=>expect(state.queries).toHaveLength(1));
    state.loading=false;view.rerender(tree());
    await waitFor(()=>expect(state.queries).toHaveLength(2));
    const response={data:[{id:'qa-branch',name_en:'QA',name_ar:'اختبار'}],error:null};
    await act(async()=>{state.queries[0](response);state.queries[1](response);});
    await waitFor(()=>expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    await act(async()=>{state.sync?.();});
    await waitFor(()=>expect(state.queries).toHaveLength(3));
    await act(async()=>{state.queries[2](response);});
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
  });
  it('a data-sync refresh never drops readiness or the blocking subscription gate',async()=>{
    state.loading=false;const view=render(tree());
    await waitFor(()=>expect(state.queries).toHaveLength(1));
    const response={data:[{id:'qa-branch',name_en:'QA',name_ar:'اختبار'}],error:null};
    await act(async()=>{state.queries[0](response);});
    await waitFor(()=>expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    await waitFor(()=>expect(screen.getByTestId('sub-loading')).toHaveTextContent('false'));
    await act(async()=>{state.sync?.();});
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
    expect(screen.getByTestId('sub-loading')).toHaveTextContent('false');
    await waitFor(()=>expect(state.queries).toHaveLength(2));
    await act(async()=>{state.queries[1](response);});
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
    expect(screen.getByTestId('sub-loading')).toHaveTextContent('false');
    expect(screen.getByTestId('branches')).toHaveTextContent('qa-branch');
  });
  it('a failed background refresh keeps the last valid branch instead of blanking it',async()=>{
    state.loading=false;const view=render(tree());
    await waitFor(()=>expect(state.queries).toHaveLength(1));
    await act(async()=>{state.queries[0]({data:[{id:'qa-branch',name_en:'QA',name_ar:'اختبار'}],error:null});});
    await waitFor(()=>expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    await act(async()=>{state.sync?.();});
    await waitFor(()=>expect(state.queries).toHaveLength(2));
    await act(async()=>{state.rejects[1](new Error('Controlled background failure'));});
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
    expect(screen.getByTestId('branches')).toHaveTextContent('qa-branch');
    expect(screen.getByTestId('sub-loading')).toHaveTextContent('false');
  });
  it('ignores a previous user response after the next user branches load',async()=>{
    state.loading=false;const view=render(tree());
    await waitFor(()=>expect(state.queries).toHaveLength(1));
    state.user={id:'qa-next-user'};view.rerender(tree());
    await waitFor(()=>expect(state.queries).toHaveLength(2));
    await act(async()=>{state.queries[1]({data:[{id:'next-branch',name_en:'Next',name_ar:'التالي'}]});});
    await waitFor(()=>expect(screen.getByTestId('branches')).toHaveTextContent('next-branch'));
    await act(async()=>{state.queries[0]({data:[{id:'old-branch',name_en:'Old',name_ar:'السابق'}]});});
    expect(screen.getByTestId('branches')).toHaveTextContent('next-branch');
    expect(localStorage.getItem('zmedico.branch')).toBe('next-branch');
  });
  it('late response after logout cannot restore branch list or local selection',async()=>{
    state.loading=false;const view=render(tree());
    await waitFor(()=>expect(state.queries).toHaveLength(1));
    state.user=null;view.rerender(tree());
    await act(async()=>{state.queries[0]({data:[{id:'old-branch',name_en:'Old',name_ar:'السابق'}]});});
    expect(screen.getByTestId('ready')).toHaveTextContent('false');
    expect(screen.getByTestId('branches')).toBeEmptyDOMElement();
    expect(localStorage.getItem('zmedico.branch')).toBeNull();
  });
  it('late rejection cannot clear a newer valid branch result',async()=>{
    const view=render(tree());await waitFor(()=>expect(state.queries).toHaveLength(1));
    state.loading=false;view.rerender(tree());await waitFor(()=>expect(state.queries).toHaveLength(2));
    await act(async()=>{state.queries[1]({data:[{id:'new-branch',name_en:'New',name_ar:'جديد'}]});});
    await waitFor(()=>expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    await act(async()=>{state.rejects[0](new Error('Controlled outdated failure'));});
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
    expect(screen.getByTestId('branches')).toHaveTextContent('new-branch');
  });
  it('obsolete owner handoff cannot issue a branch query for its old tenant',async()=>{
    state.owner=true;sessionStorage.setItem('zmedico.platform.workspace.branch','owner-branch');
    const view=render(tree());await waitFor(()=>expect(state.handoffs).toHaveLength(1));
    state.loading=false;view.rerender(tree());await waitFor(()=>expect(state.handoffs).toHaveLength(2));
    await act(async()=>{state.handoffs[1]({data:{tenant_id:'current-tenant'}});});
    await waitFor(()=>expect(state.queries).toHaveLength(1));
    await act(async()=>{state.queries[0]({data:[{id:'owner-branch',name_en:'Current',name_ar:'الحالي'}]});});
    await waitFor(()=>expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    await act(async()=>{state.handoffs[0]({data:{tenant_id:'obsolete-tenant'}});});
    expect(state.queries).toHaveLength(1);
    expect(state.filters).toEqual(['current-tenant']);
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
  });
});
