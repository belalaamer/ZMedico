import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261017223212_guard_treasury_summary_scope.sql', 'utf8');
const executable = sql.replace(/--[^\n]*/g, '');

it('fails closed on summary or authorization dependency drift before replacement', () => {
  for (const hash of ['008943f2080c10bcd43e1a73d06bf794', '4a77243167edf154de0192c7105f8bde', 'acaa996750bb4c6d9240f8517d90f6fe', '7f2cdef867fe831f64d2bf82f20ca645']) expect(sql).toContain(hash);
  expect(sql.indexOf('authorization dependency drift')).toBeLessThan(sql.indexOf('CREATE OR REPLACE FUNCTION'));
});

it('checks actual private session authority rather than an invoker-only assertion inside a definer', () => {
  expect(executable).toContain('IF NOT COALESCE(zmedico_security.session_is_active(), false)');
  expect(executable).not.toContain('public.assert_active_session(');
  expect(executable.indexOf('IF NOT COALESCE')).toBeLessThan(executable.indexOf('public.has_permission(v_actor'));
  expect(executable).not.toMatch(/current_user|user_metadata|service_role/i);
});

it('authorizes the exact treasury branch without changing historical visibility semantics', () => {
  expect(sql).toContain('SELECT t.branch_id INTO v_branch');
  expect(sql).toContain('WHERE t.id=_treasury_id');
  expect(executable).not.toMatch(/t\.is_active|t\.deleted_at|b\.is_active/);
  expect(sql).toContain('IF v_branch IS NULL OR NOT public.user_has_branch_access(v_branch)');
  expect(sql).toContain("'Forbidden: treasury outside caller scope' USING ERRCODE='42501'");
  expect(sql.indexOf('IF v_branch IS NULL')).toBeLessThan(sql.indexOf('SELECT COALESCE(current_balance, 0)'));
});

it('retains daily-close permission, public signature, stable definer and time-zone semantics', () => {
  expect(sql).toContain("public.has_permission(v_actor, 'treasury.daily_close.view')");
  expect(sql).toContain("_treasury_id uuid, _business_date date, _tz text DEFAULT 'Africa/Cairo'::text");
  expect(sql).toContain('STABLE SECURITY DEFINER');
  expect(sql).toContain("SET search_path TO 'public'");
  expect(sql).toContain("tz text := COALESCE(NULLIF(_tz, ''), 'Africa/Cairo')");
});

it('retains cash opening/income/expense and separate noncash financial calculation', () => {
  for (const part of ['v_open := COALESCE(cur_cash, 0) - COALESCE(net_cash_after_open, 0)', 'expected_cash  := v_open + v_in - v_out', 'non_cash_total := v_nc', 'is_cash = false', 'created_at >= day_start AND created_at < day_end', 'RETURN NEXT']) expect(sql).toContain(part);
});

it('changes only one existing function without data repair, grant or RLS changes', () => {
  expect(executable.match(/CREATE OR REPLACE FUNCTION/gi)).toHaveLength(1);
  expect(executable).not.toMatch(/\b(?:grant|revoke|insert|update|delete|truncate|alter table|create policy|drop function)\b/i);
});
