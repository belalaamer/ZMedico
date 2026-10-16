import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/20261015213250_guard_finite_inventory_values.sql','utf8');

it('requires the exact reviewed inventory core before replacement',()=>{
 expect(sql).toContain('9eab0ab0d1df589f7cb65c0b8f883a21');
 expect(sql).toContain('is distinct from');
 expect(sql).toContain('review the current definition before applying');
});
it('rejects all non-finite quantities and costs before the first write',()=>{
 for(const field of ['p_signed_qty','p_unit_cost']){
  const guard=field+"::text in ('NaN','Infinity','-Infinity')";
  expect(sql).toContain(guard);expect(sql.indexOf(guard)).toBeLessThan(sql.indexOf('insert into public.inventory('));
 }
 expect(sql.match(/must be finite' using errcode='22023'/g)).toHaveLength(2);
});
it('preserves tenant, locking, reserved-stock and negative-balance invariants',()=>{
 for(const invariant of ['v_branch_tenant is distinct from v_product_tenant','p_signed_qty is null or p_signed_qty=0','p_unit_cost<0','for update;','newq<0','newq<reserved','newq:=cur+p_signed_qty;'])expect(sql).toContain(invariant);
 expect(sql).toContain("security definer set search_path = ''");
});
it('does not widen grants or add policies, tables or replacement RPCs',()=>{
 expect(sql.match(/create or replace function/gi)).toHaveLength(1);
 expect(sql.replace(/--[^\n]*/g,'')).not.toMatch(/\b(?:grant|revoke|create\s+policy|alter\s+table|drop\s+|disable\s+)/i);
 expect(sql).toContain('p_expiry,nullif(btrim(p_batch),\'\'),p_actor');
});
