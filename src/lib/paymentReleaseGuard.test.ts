import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const sql=readFileSync(resolve(process.cwd(),"supabase/migrations/20261015152805_guard_serialized_invoice_payments_release.sql"),"utf8");
describe("reviewed invoice payment release boundaries",()=>{
  it("refuses unreviewed definitions before function replacement",()=>{
    expect(sql).toContain("e07fa070143bcc2136430ee8222c06c4");
    expect(sql).toContain("Reviewed payment dependency drift");
    expect(sql.indexOf("$preflight$;")).toBeLessThan(sql.indexOf("create or replace function"));
  });
  it("pins deployed treasury, wallet and reversal dependencies",()=>{
    for(const value of ["d098b056599914b6cea2adadec524bed","98a89e37f2671deb206feba371ef80e6","ef61ca409a3e40864952699b419ae326","aa20c5568127ff78263dda25cf3c940c"])expect(sql).toContain(value);
  });
  it("requires active trigger, enabled RLS and valid invoice index",()=>{
    for(const value of ["tgenabled='O' and tgtype=7","and not relrowsecurity","i.indisvalid and i.indisready","i.indkey[0]=a.attnum"])expect(sql).toContain(value);
  });
  it("counts active payments after taking the invoice lock",()=>{
    expect(sql.indexOf("for update;")).toBeLessThan(sql.indexOf("select coalesce(sum(p.amount), 0)"));
    expect(sql).toContain("p.invoice_id = new.invoice_id and p.deleted_at is null");
  });
  it("enforces invoice identity and rejects top-up bypass",()=>{
    for(const value of ["new.patient_id is distinct from v_patient_id","new.branch_id is distinct from v_branch_id","Wallet top-up cannot reference an invoice","i.deleted_at is null","v_status = 'cancelled'"])expect(sql).toContain(value);
  });
  it("keeps internal helper private and bounds deployment waits",()=>{
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("set search_path to ''");
    expect(sql).toContain("set local lock_timeout = '3s'");
    expect(sql).toContain("set local statement_timeout = '20s'");
  });
  it("does not rewrite history, balances, policies or rows",()=>{
    expect(sql).not.toMatch(/\b(?:insert\s+into|update\s+public\.|delete\s+from|drop\s+table|disable\s+row\s+level|create\s+policy|alter\s+policy|schema_migrations)\b/i);
  });
});
