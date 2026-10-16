import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/20261008225753_atomic_queue_consultation_handoff.sql','utf8');
it('requires a live session before inspecting or locking a clinical appointment',()=>{
 const guard=sql.indexOf('perform public.assert_active_session();');
 expect(guard).toBeGreaterThan(0);
 expect(guard).toBeLessThan(sql.indexOf('if v_user is null'));
 expect(guard).toBeLessThan(sql.indexOf('select a.* into v_appointment'));
});
it('retains invoker RLS, role/branch checks, lock and one atomic handoff',()=>{
 expect(sql).toMatch(/security invoker\s+set search_path = ''/i);
 expect(sql).toContain('public.user_has_branch_access(_branch_id)');
 expect(sql).toContain("public.has_role(v_user, 'doctor'::public.app_role)");
 expect(sql).toContain('for update;');
 expect(sql.replace(/--[^\n]*/g,'')).not.toMatch(/security definer|disable row level security/i);
});
