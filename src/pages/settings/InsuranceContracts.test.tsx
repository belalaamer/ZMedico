import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,useNavigate,useLocation} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
type Result={data:unknown[];error?:unknown};
const state=vi.hoisted(()=>({contracts:new Map<string,Promise<Result>>(),rules:new Map<string,Promise<Result>>()}));
vi.mock('./SettingsLayout',()=>({default:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock('@/contexts/I18nContext',()=>({useI18n:()=>({lang:'en',t:(key:string)=>key})}));
vi.mock('@/lib/authz/useAuthorization',()=>({useAuthorization:()=>({authz:{isSuperAdmin:()=>false}})}));
vi.mock('@/components/ui/combobox',()=>({Combobox:({value,onChange,options}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]})=><select aria-label="Company" value={value} onChange={e=>onChange(e.target.value)}><option value="">Choose</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
 const filters:Record<string,string>={};
 const result=()=>table==='insurance_companies'?Promise.resolve({data:[{id:'A',name_en:'Company A'},{id:'B',name_en:'Company B'}]}):table==='insurance_contracts'?(state.contracts.get(filters.insurance_company_id)??Promise.resolve({data:[]})):table==='insurance_contract_rules'?(state.rules.get(filters.contract_id)??Promise.resolve({data:[]})):Promise.resolve({data:[]});
 const query={select:()=>query,eq:(key:string,value:string)=>{filters[key]=value;return query;},order:()=>query,limit:()=>query,then:(yes:(v:Result)=>unknown,no?:(e:unknown)=>unknown)=>result().then(yes,no)};return query;
}}}));
import InsuranceContracts from './InsuranceContracts';
function deferred(){let resolve!:(v:Result)=>void;const promise=new Promise<Result>(r=>{resolve=r;});return {promise,resolve};}
const contract=(id:string,company:string)=>({id,insurance_company_id:company,name_en:id,default_coverage_percent:0,is_active:true});
const rule=(id:string,contractId:string,percent:number)=>({id,contract_id:contractId,scope:'item_type',item_type:'service',coverage_percent:percent,priority:100});
function mount(){render(<MemoryRouter initialEntries={['/?company=A']}><InsuranceContracts/></MemoryRouter>);}
function Navigation(){const navigate=useNavigate();const location=useLocation();return <><output aria-label="URL">{location.search}</output><button onClick={()=>navigate('/?company=B')}>Direct B</button><button onClick={()=>navigate('/?view=keep')}>Clear Company</button><button onClick={()=>navigate(-1)}>Back</button><button onClick={()=>navigate(1)}>Forward</button></>;}
beforeEach(()=>{state.contracts.clear();state.rules.clear();});afterEach(()=>cleanup());
it('follows direct query navigation and browser back/forward without remount',async()=>{
 state.contracts.set('A',Promise.resolve({data:[contract('A Contract','A')]}));state.contracts.set('B',Promise.resolve({data:[contract('B Contract','B')]}));
 render(<MemoryRouter initialEntries={['/?company=A']}><Navigation/><InsuranceContracts/></MemoryRouter>);
 await screen.findAllByText('A Contract');fireEvent.click(screen.getByText('Direct B'));await screen.findAllByText('B Contract');
 fireEvent.click(screen.getByText('Back'));await screen.findAllByText('A Contract');expect(screen.getByLabelText('Company')).toHaveValue('A');
 fireEvent.click(screen.getByText('Forward'));await screen.findAllByText('B Contract');expect(screen.getByLabelText('Company')).toHaveValue('B');
});
it('preserves unrelated query parameters when choosing a company',async()=>{
 state.contracts.set('A',Promise.resolve({data:[contract('A Contract','A')]}));state.contracts.set('B',Promise.resolve({data:[contract('B Contract','B')]}));
 render(<MemoryRouter initialEntries={['/?company=A&view=keep']}><Navigation/><InsuranceContracts/></MemoryRouter>);
 await screen.findAllByText('A Contract');fireEvent.change(screen.getByLabelText('Company'),{target:{value:'B'}});await screen.findAllByText('B Contract');
 const params=new URLSearchParams(screen.getByLabelText('URL').textContent!);expect(params.get('company')).toBe('B');expect(params.get('view')).toBe('keep');
});
it('clears selection and old contracts when company is removed from the URL',async()=>{
 state.contracts.set('A',Promise.resolve({data:[contract('A Contract','A')]}));
 render(<MemoryRouter initialEntries={['/?company=A']}><Navigation/><InsuranceContracts/></MemoryRouter>);
 await screen.findAllByText('A Contract');fireEvent.click(screen.getByText('Clear Company'));
 await screen.findByText('Select an insurance company to manage its contracts.');expect(screen.getByLabelText('Company')).toHaveValue('');expect(screen.queryAllByText('A Contract')).toHaveLength(0);
});
it('ignores a previous company response arriving after the current company',async()=>{
 const old=deferred();state.contracts.set('A',old.promise);state.contracts.set('B',Promise.resolve({data:[contract('B Contract','B')]}));mount();
 await screen.findByRole('option',{name:'Company B'});fireEvent.change(screen.getByLabelText('Company'),{target:{value:'B'}});
 await screen.findAllByText('B Contract');await act(async()=>old.resolve({data:[contract('A Contract','A')]}));
 expect(screen.queryAllByText('A Contract')).toHaveLength(0);expect(screen.getAllByText('B Contract')).toHaveLength(2);
});
it('ignores a previous contract rule response after selecting another contract',async()=>{
 const old=deferred();state.contracts.set('A',Promise.resolve({data:[contract('A One','A'),contract('A Two','A')]}));state.rules.set('A One',old.promise);state.rules.set('A Two',Promise.resolve({data:[rule('r2','A Two',40)]}));mount();
 fireEvent.click(await screen.findByRole('button',{name:/A Two/}));await screen.findByText('40%');
 await act(async()=>old.resolve({data:[rule('r1','A One',15)]}));expect(screen.queryByText('15%')).not.toBeInTheDocument();expect(screen.getByText('40%')).toBeInTheDocument();
});
it('does not expose old contracts while a newly selected company is still loading',async()=>{
 state.contracts.set('A',Promise.resolve({data:[contract('A Contract','A')]}));const next=deferred();state.contracts.set('B',next.promise);mount();
 await screen.findAllByText('A Contract');fireEvent.change(screen.getByLabelText('Company'),{target:{value:'B'}});
 await waitFor(()=>expect(screen.queryAllByText('A Contract')).toHaveLength(0));
 await act(async()=>next.resolve({data:[contract('B Contract','B')]}));expect(screen.getAllByText('B Contract')).toHaveLength(2);
});
it('invalidates the first request even after company A to B to A',async()=>{
 const old=deferred();state.contracts.set('A',old.promise);state.contracts.set('B',Promise.resolve({data:[contract('B Contract','B')]}));mount();
 await screen.findByRole('option',{name:'Company B'});fireEvent.change(screen.getByLabelText('Company'),{target:{value:'B'}});await screen.findAllByText('B Contract');
 state.contracts.set('A',Promise.resolve({data:[contract('A Fresh','A')]}));fireEvent.change(screen.getByLabelText('Company'),{target:{value:'A'}});await screen.findAllByText('A Fresh');
 await act(async()=>old.resolve({data:[contract('A Stale','A')]}));expect(screen.queryAllByText('A Stale')).toHaveLength(0);expect(screen.getAllByText('A Fresh')).toHaveLength(2);
});
it('invalidates the first rule request when returning to the same contract',async()=>{
 const old=deferred();state.contracts.set('A',Promise.resolve({data:[contract('A One','A'),contract('A Two','A')]}));state.rules.set('A One',old.promise);state.rules.set('A Two',Promise.resolve({data:[rule('r2','A Two',40)]}));mount();
 fireEvent.click(await screen.findByRole('button',{name:/A Two/}));await screen.findByText('40%');
 state.rules.set('A One',Promise.resolve({data:[rule('fresh','A One',80)]}));fireEvent.click(screen.getByRole('button',{name:/A One/}));await screen.findByText('80%');
 await act(async()=>old.resolve({data:[rule('stale','A One',15)]}));expect(screen.queryByText('15%')).not.toBeInTheDocument();expect(screen.getByText('80%')).toBeInTheDocument();
});
