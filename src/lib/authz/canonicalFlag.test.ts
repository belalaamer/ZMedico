import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {isCanonicalAuthzEnabled,setCanonicalAuthzOverride} from './canonicalFlag';

beforeEach(()=>{localStorage.clear();vi.stubEnv('DEV',false);vi.stubEnv('VITE_AUTHZ_CANONICAL','true');});
afterEach(()=>{vi.unstubAllEnvs();localStorage.clear();});
describe('canonical authorization build flag',()=>{
 it('uses the enabled production build flag',()=>{expect(isCanonicalAuthzEnabled()).toBe(true);});
 it('uses the disabled production build flag',()=>{vi.stubEnv('VITE_AUTHZ_CANONICAL','false');expect(isCanonicalAuthzEnabled()).toBe(false);});
 it('ignores a browser override disabling production authorization',()=>{localStorage.setItem('authz_canonical','false');expect(isCanonicalAuthzEnabled()).toBe(true);});
 it('ignores a browser override enabling a disabled production flag',()=>{vi.stubEnv('VITE_AUTHZ_CANONICAL','false');localStorage.setItem('authz_canonical','true');expect(isCanonicalAuthzEnabled()).toBe(false);});
 it('does not write development overrides in production',()=>{setCanonicalAuthzOverride(false);expect(localStorage.getItem('authz_canonical')).toBeNull();});
 it('allows the existing development-only override',()=>{vi.stubEnv('DEV',true);setCanonicalAuthzOverride(false);expect(isCanonicalAuthzEnabled()).toBe(false);setCanonicalAuthzOverride(true);expect(isCanonicalAuthzEnabled()).toBe(true);});
 it('removes the development override and restores the build flag',()=>{vi.stubEnv('DEV',true);setCanonicalAuthzOverride(false);setCanonicalAuthzOverride(null);expect(isCanonicalAuthzEnabled()).toBe(true);expect(localStorage.getItem('authz_canonical')).toBeNull();});
 it('denies malformed flag values',()=>{vi.stubEnv('VITE_AUTHZ_CANONICAL','TRUE');expect(isCanonicalAuthzEnabled()).toBe(false);});
});
