import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';

async function run(failingTable:string|null=null,code='PT409',authError=false){
 let handler!:(request:Request)=>Promise<Response>;
 const deletes:string[]=[];
 const audits:unknown[]=[];
 const deleteUser=vi.fn(async()=>({error:authError?{message:'private Auth provider details'}:null}));
 const service={
  rpc:async()=>({data:true,error:null}),
  from:(table:string)=>({
   select:()=>({eq:async()=>({count:2,error:null})}),
   insert:async(row:unknown)=>{audits.push(row);return {error:null};},
   delete:()=>({eq:async()=>{deletes.push(table);return {error:table===failingTable?{code,message:'private database details'}:null};}}),
  }),
  auth:{admin:{deleteUser}},
 };
 const user={auth:{getUser:async()=>({data:{user:{id:'actor'}},error:null})}};
 const deno={env:{get:(key:string)=>key==='SUPABASE_ANON_KEY'?'anon':key==='SUPABASE_SERVICE_ROLE_KEY'?'service':'https://local.invalid'},serve:(h:typeof handler)=>handler=h};
 const source=readFileSync('supabase/functions/admin-delete-user/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText;
 const jsonResponse=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
 new Function('Deno','createClient','corsPreflight','jsonResponse','requireActiveSession',compiled)(deno,(_url:string,key:string)=>key==='anon'?user:service,()=>new Response('ok'),jsonResponse,async()=>null);
 const response=await handler(new Request('https://local.invalid',{method:'POST',headers:{Authorization:'Bearer test-only'},body:JSON.stringify({user_id:'target'})}));
 return {response,body:await response.json(),deletes,deleteUser,audits};
}

it('reports a role owner-invariant conflict without deleting the Auth account',async()=>{
 const r=await run('user_roles');expect(r.response.status).toBe(409);expect(r.body).toEqual({error:'The last System Owner cannot be deleted'});expect(r.deletes).toEqual(['user_roles']);expect(r.deleteUser).not.toHaveBeenCalled();
});
it('does not misclassify a different role-table failure as an owner conflict',async()=>{
 const r=await run('user_roles','42501');expect(r.response.status).toBe(500);expect(r.body).toEqual({error:'Unable to clean user_roles; auth deletion aborted'});expect(r.deleteUser).not.toHaveBeenCalled();
});
it('does not misclassify a staff conflict as last-owner protection',async()=>{
 const r=await run('staff_profiles');expect(r.response.status).toBe(500);expect(r.body).toEqual({error:'Unable to clean staff_profiles; auth deletion aborted'});expect(r.deletes).toEqual(['user_roles','staff_profiles']);expect(r.deleteUser).not.toHaveBeenCalled();
});
it('preserves normal successful account deletion',async()=>{
 const r=await run();expect(r.response.status).toBe(200);expect(r.body).toEqual({ok:true});expect(r.deletes).toEqual(['user_roles','staff_profiles','profiles']);expect(r.deleteUser).toHaveBeenCalledExactlyOnceWith('target');
});
it('never reports success after failed Auth deletion',async()=>{
 const r=await run(null,'PT409',true);expect(r.response.status).toBe(400);expect(r.body).toEqual({error:'Unable to delete user'});expect(r.deleteUser).toHaveBeenCalledOnce();
});

it('retains requester identity in the audit payload after the Auth foreign key is cleared',async()=>{
 const r=await run();expect(r.audits).toEqual([expect.objectContaining({user_id:'actor',new_values:expect.objectContaining({actor_user_id:'actor',target_user_id:'target'})})]);
});
