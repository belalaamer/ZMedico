import {renderHook} from '@testing-library/react';
import {expect,it} from 'vitest';
import {useOperationScope} from './useOperationScope';
it('accepts a completion while its current scope is unchanged',()=>{
 const h=renderHook(()=>useOperationScope('user:a:write'));expect(h.result.current()()).toBe(true);
});
it.each(['user:b:write','other:a:write','user:a:read',null])('invalidates a completion after scope changes to %s',scope=>{
 const h=renderHook(({scope})=>useOperationScope(scope),{initialProps:{scope:'user:a:write' as string|null}});
 const current=h.result.current();h.rerender({scope});expect(current()).toBe(false);
});
it('does not resurrect an old callback after leaving and returning to the same scope',()=>{
 const h=renderHook(({scope})=>useOperationScope(scope),{initialProps:{scope:'user:a:write'}});
 const old=h.result.current();h.rerender({scope:'user:b:write'});h.rerender({scope:'user:a:write'});
 expect(old()).toBe(false);expect(h.result.current()()).toBe(true);
});
it('invalidates pending callbacks when the page unmounts',()=>{
 const h=renderHook(()=>useOperationScope('user:a:write'));const current=h.result.current();h.unmount();expect(current()).toBe(false);
});
