#!/usr/bin/env bash
# Reproducible proof for the treatment-plan invoice race (T3).
#
# Creates a throwaway database, builds the minimal schema the trigger touches,
# applies supabase/migrations/20261112110000_treatment_plan_invoice_idempotency.sql,
# then runs two OVERLAPPING psql sessions that both write a treatment_sessions row
# of the same plan -- the exact shape that produced duplicate invoices.
#
# Asserts: exactly ONE invoice, ZERO orphans (invoices no plan points at).
#
#   ./treatment_plan_invoice_race.sh                    # tests the fix
#   ./treatment_plan_invoice_race.sh --pre-fix          # shows the bug (expects 2/1)
#
# Requires: psql on PATH and a role that may CREATE DATABASE. Nothing here touches
# a real deployment: the database is created and dropped by this script.
#
# Why a script and not pgTAP: pgTAP runs inside one session, and this defect only
# exists between two concurrent transactions. Two psql processes are the smallest
# honest reproduction.
set -uo pipefail

PRE_FIX=0
[ "${1:-}" = "--pre-fix" ] && PRE_FIX=1

HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATION="$HERE/../../migrations/20261112110000_treatment_plan_invoice_idempotency.sql"
[ -f "$MIGRATION" ] || { echo "FATAL: migration not found at $MIGRATION"; exit 2; }

DB="zmed_t3_probe_$$"
WORK="$(mktemp -d)"
cleanup() {
  psql -q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

die() { echo "FATAL: $*"; exit 2; }
psql -q -d postgres -c "create database $DB" >/dev/null 2>&1 || die "cannot create a scratch database (need CREATEDB on the target server)"

# ---------------------------------------------------------------- schema
psql -q -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || die "schema build failed"
create type invoice_status as enum ('draft','pending','paid','partial','cancelled','overdue');
create type invoice_item_type as enum ('service','product','procedure','discount');
create table invoice_counters (year int primary key, last_value int not null);
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null, patient_id uuid, branch_id uuid, invoice_date date,
  subtotal numeric, total numeric, status invoice_status, notes text, created_by uuid,
  deleted_at timestamptz);
create unique index invoices_invoice_number_key on invoices(invoice_number);
create table invoice_items (
  id uuid primary key default gen_random_uuid(), invoice_id uuid references invoices(id),
  description_en text, description_ar text, quantity numeric, unit_price numeric,
  total numeric, item_type invoice_item_type);
create table treatment_plans (
  id uuid primary key default gen_random_uuid(), patient_id uuid, branch_id uuid,
  name_en text, name_ar text, total_sessions int, price numeric default 0,
  status text default 'active', invoice_id uuid, created_by uuid, end_date date,
  updated_at timestamptz default now());
create table treatment_sessions (
  id uuid primary key default gen_random_uuid(),
  treatment_plan_id uuid references treatment_plans(id), session_number int,
  status text default 'pending', performed_at timestamptz, notes text,
  updated_at timestamptz default now());
-- verbatim from Production
create or replace function generate_invoice_number() returns text
language plpgsql security definer set search_path='public' as $$
declare y int := extract(year from current_date)::int; n int;
begin
  insert into public.invoice_counters (year, last_value) values (y, 1)
  on conflict (year) do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into n;
  return 'INV-' || y::text || '-' || lpad(n::text, 4, '0');
end; $$;
SQL

# ---------------------------------------------------------------- trigger under test
if [ "$PRE_FIX" = "1" ]; then
  # The shipped body, with the one line the fix adds removed.
  sed -e 's/WHERE id = plan_id FOR UPDATE;/WHERE id = plan_id;/' \
      -e 's/^  SELECT \* INTO v_plan FROM public.treatment_plans WHERE id = plan_id$/  SELECT * INTO v_plan FROM public.treatment_plans WHERE id = plan_id;/' \
      "$MIGRATION" > "$WORK/trigger.sql"
  # Only the executable read matters; the file's comments legitimately mention FOR UPDATE.
  grep -qE '^[[:space:]]*SELECT \* INTO v_plan .*FOR UPDATE' "$WORK/trigger.sql" \
    && die "--pre-fix could not strip the lock; refusing to report a misleading result"
else
  cp "$MIGRATION" "$WORK/trigger.sql"
fi
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$WORK/trigger.sql" >/dev/null || die "migration did not apply"
psql -q -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || die "trigger install failed"
create trigger trg_ts_after_change after insert or delete or update on treatment_sessions
  for each row execute function tg_treatment_session_after_change();
SQL

# ---------------------------------------------------------------- the scenario
# A plan whose sessions were completed while the price was still 0 (so no invoice
# was issued then), after which the clinic enters the price. Every later write to
# a session re-runs the trigger, and `done >= total` is already true.
psql -q -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || die "seed failed"
insert into treatment_plans (id, patient_id, branch_id, name_en, total_sessions, price, created_by)
values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333','Rotator cuff rehab',2,0,
        '44444444-4444-4444-4444-444444444444');
insert into treatment_sessions (id, treatment_plan_id, session_number, status, performed_at) values
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',1,'completed',now()),
 ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',2,'completed',now());
update treatment_plans set price=500 where id='11111111-1111-1111-1111-111111111111';
SQL

cat > "$WORK/s1.sql" <<'SQL'
begin;
update treatment_sessions set notes='staff A edited session 1' where id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_sleep(1);
commit;
SQL
cat > "$WORK/s2.sql" <<'SQL'
begin;
select pg_sleep(0.3);
update treatment_sessions set notes='staff B edited session 2' where id='aaaaaaaa-0000-0000-0000-000000000002';
select pg_sleep(1);
commit;
SQL
psql -q -d "$DB" -f "$WORK/s1.sql" >/dev/null 2>&1 &
psql -q -d "$DB" -f "$WORK/s2.sql" >/dev/null 2>&1 &
wait

INVOICES=$(psql -tAq -d "$DB" -c "select count(*) from invoices")
ORPHANS=$(psql -tAq -d "$DB" -c "select count(*) from invoices i where not exists (select 1 from treatment_plans p where p.invoice_id=i.id)")
LINKED=$(psql -tAq -d "$DB" -c "select count(*) from treatment_plans where invoice_id is not null")

echo "mode=$( [ "$PRE_FIX" = "1" ] && echo pre-fix || echo with-fix ) invoices=$INVOICES orphans=$ORPHANS plans_linked_to_an_invoice=$LINKED"

if [ "$PRE_FIX" = "1" ]; then
  if [ "$INVOICES" -ge 2 ] && [ "$ORPHANS" -ge 1 ]; then
    echo "REPRODUCED: two sessions produced $INVOICES invoices for one plan, $ORPHANS orphaned."
    exit 0
  fi
  echo "NOT REPRODUCED on this machine -- the harness is not reproducing the defect, so the fix is unproven."
  exit 1
fi

if [ "$INVOICES" = "1" ] && [ "$ORPHANS" = "0" ] && [ "$LINKED" = "1" ]; then
  echo "FIXED: one invoice, no orphans, plan linked."
  exit 0
fi
echo "STILL BROKEN: expected 1 invoice / 0 orphans, got $INVOICES / $ORPHANS."
exit 1