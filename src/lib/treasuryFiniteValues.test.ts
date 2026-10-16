import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/20261016100859_guard_finite_treasury_ledger_amount.sql','utf8');
it('refuses drift or replay of the exact ledger function',()=>{
 expect(sql).toContain("is distinct from 'd098b056599914b6cea2adadec524bed'");
 expect(sql).toContain('pg_catalog.pg_get_functiondef');
});
it('rejects all non-finite amounts before selecting or updating a balance',()=>{
 const guard=sql.indexOf("IF _amount::text IN ('NaN','Infinity','-Infinity')");
 expect(guard).toBeGreaterThan(0);
 expect(guard).toBeLessThan(sql.indexOf('IF _amount IS NULL OR _amount <= 0'));
 expect(guard).toBeLessThan(sql.indexOf('SELECT branch_id'));
 expect(sql).toContain("USING ERRCODE='22023'");
});
it('retains actor, branch, payment reversal and two cash-bucket semantics',()=>{
 for(const part of ['v_actor uuid := auth.uid()', 'public.user_has_branch_access(v_treasury_branch)', "_ref_type = 'payment_reversal'", 'v_actor, _is_cash', 'SET current_balance = new_balance', 'SET non_cash_balance = new_balance'])expect(sql).toContain(part);
});
it('changes one existing function without altering grants or policies',()=>{
 const executable=sql.replace(/--[^\n]*/g,'');
 expect(executable.match(/CREATE OR REPLACE FUNCTION/gi)).toHaveLength(1);
 expect(executable).not.toMatch(/\b(?:grant|revoke|alter table|create policy|drop function)\b/i);
});
