#!/usr/bin/env bash
# Integration proof: T4/T5's session guard (#282) TOGETHER WITH T3's real invoice
# trigger (#281). This is deliberately separate from treatment_session_integrity.sh,
# which proves the guard alone. Neither result implies the other.
#
#   ./treatment_plan_invoice_integration.sh            # #282 + #281 (FOR UPDATE)
#   ./treatment_plan_invoice_integration.sh --pre-t3    # #282 + #281 with the lock stripped
#
# Both modes apply the REAL #281 function text read from its migration file; the
# --pre-t3 mode removes exactly the `FOR UPDATE` token and refuses to run if the
# token was not there to remove (so a silently-changed file cannot fake a result).
#
# Scenario is the T3 precondition: a plan whose sessions were all completed while
# the price was still 0, after which the price is entered. Every later session
# write re-runs the invoice trigger, and two concurrent edits race to issue the
# invoice.
#
# Requires psql and CREATEDB.
set -uo pipefail

MODE="integration"
[ "${1:-}" = "--pre-t3" ] && MODE="pre-t3"

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
GUARD="$REPO/supabase/migrations/20261112130000_treatment_session_integrity.sql"
# Prefer the real #281 migration when this checkout has it; otherwise use the
# committed fixture so the integration proof is reproducible from this branch
# alone. Either way the text must contain the `FOR UPDATE` the fix adds.
LIVE_T3="$REPO/supabase/migrations/20261112110000_treatment_plan_invoice_idempotency.sql"
FIXTURE_T3="$HERE/fixtures/t3_invoice_lock.sql"
INVOICE_MIGRATION="$FIXTURE_T3"
[ -f "$LIVE_T3" ] && INVOICE_MIGRATION="$LIVE_T3"
[ -f "$GUARD" ] || { echo "FATAL: #282 migration missing"; exit 2; }
[ -f "$INVOICE_MIGRATION" ] || { echo "FATAL: #281 migration/fixture missing"; exit 2; }
if [ -f "$LIVE_T3" ] && [ -f "$FIXTURE_T3" ]; then
  cmp -s "$LIVE_T3" "$FIXTURE_T3" || { echo "FATAL: the committed #281 fixture has drifted from the T3 migration"; exit 2; }
fi
grep -q "FOR UPDATE" "$INVOICE_MIGRATION" || { echo "FATAL: #281 trigger text has no FOR UPDATE"; exit 2; }

DB="zmed_int_probe_$$"
WORK="$(mktemp -d)"
cleanup() { psql -qX -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
die() { echo "FATAL: $*"; exit 2; }

psql -qX -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true
psql -qX -d postgres -c "create database $DB" >/dev/null 2>&1 || die "need CREATEDB"

psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || die "schema build failed"
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create type public.invoice_status as enum ('draft','pending','paid','partial','cancelled','overdue');
create type public.invoice_item_type as enum ('service','product','procedure','discount');

create table public.invoice_counters (year int primary key, last_value int not null);
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null, patient_id uuid, branch_id uuid, invoice_date date,
  subtotal numeric, total numeric, status public.invoice_status, notes text, created_by uuid,
  deleted_at timestamptz);
create unique index invoices_invoice_number_key on public.invoices(invoice_number);
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(), invoice_id uuid references public.invoices(id),
  description_en text, description_ar text, quantity numeric, unit_price numeric,
  total numeric, item_type public.invoice_item_type);
create table public.treatment_plans (
  id uuid primary key default gen_random_uuid(), patient_id uuid, branch_id uuid,
  name_en text, name_ar text, total_sessions int not null, price numeric default 0,
  status text default 'active', invoice_id uuid, created_by uuid, end_date date,
  updated_at timestamptz default now());
create table public.treatment_sessions (
  id uuid primary key default gen_random_uuid(),
  treatment_plan_id uuid references public.treatment_plans(id), session_number int,
  status text default 'pending', performed_at timestamptz, notes text,
  updated_at timestamptz default now());
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid, branch_id uuid,
  action text, entity_type text, entity_id uuid, old_values jsonb, new_values jsonb,
  metadata jsonb, created_at timestamptz default now());
create function public.tg_ts_updated_at() returns trigger language plpgsql as
  $$ begin new.updated_at := now(); return new; end $$;
create trigger trg_ts_updated_at before update on public.treatment_sessions
  for each row execute function public.tg_ts_updated_at();

-- Verbatim `generate_invoice_number` from Production: it allocates a DIFFERENT
-- number per caller, which is why a unique index on invoice_number cannot save us.
create or replace function public.generate_invoice_number() returns text
language plpgsql security definer set search_path='public' as $$
declare y int := extract(year from current_date)::int; n int;
begin
  insert into public.invoice_counters (year, last_value) values (y, 1)
  on conflict (year) do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into n;
  return 'INV-' || y::text || '-' || lpad(n::text, 4, '0');
end; $$;
SQL

# Order: #282 guard, then #281 trigger. The two touch different objects, so this
# order models "#282 merged, then T3 merged" without either overwriting the other.
psql -qX -d "$DB" -v ON_ERROR_STOP=1 -f "$GUARD" >/dev/null 2>"$WORK/e" || { echo "FATAL: #282 did not apply:"; cat "$WORK/e"; exit 2; }

if [ "$MODE" = "pre-t3" ]; then
  sed -e 's/FOR UPDATE//' "$INVOICE_MIGRATION" > "$WORK/t3.sql"
  grep -q "treatment_plans WHERE id = plan_id;" "$WORK/t3.sql" \
    || die "--pre-t3 could not strip the lock; refusing to report a misleading result"
else
  cp "$INVOICE_MIGRATION" "$WORK/t3.sql"
fi
psql -qX -d "$DB" -v ON_ERROR_STOP=1 -f "$WORK/t3.sql" >/dev/null 2>"$WORK/e" || { echo "FATAL: #281 did not apply:"; cat "$WORK/e"; exit 2; }

# #281 only REPLACES the function; the trigger that calls it already exists in
# Production (it was created outside this repository, see T1). The harness models
# it explicitly, which is also the honest statement of what #281 depends on.
psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null 2>"$WORK/e" <<'SQL' || { echo "FATAL: could not model the production trigger:"; cat "$WORK/e"; exit 2; }
create trigger tg_treatment_session_after_change
  after insert or delete or update on public.treatment_sessions
  for each row execute function public.tg_treatment_session_after_change();
SQL

FAILS=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; FAILS=$((FAILS+1)); }
q() { psql -qX -tA -d "$DB" -c "$1" 2>/dev/null | tail -1; }

PLAN="12121212-1212-1212-1212-121212121212"
PAT="13131313-1313-1313-1313-131313131313"
psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL || die "seed failed"
insert into public.treatment_plans (id, patient_id, name_en, total_sessions, price, status, created_by)
values ('$PLAN','$PAT','Rotator cuff rehab',2,0,'active','14141414-1414-1414-1414-141414141414');
insert into public.treatment_sessions (id, treatment_plan_id, session_number, status, performed_at, notes) values
 ('aaaaaaaa-1111-0000-0000-000000000001','$PLAN',1,'completed',now(),'session one'),
 ('aaaaaaaa-1111-0000-0000-000000000002','$PLAN',2,'completed',now(),'session two');
-- The precondition: the price is entered AFTER both sessions were completed, so
-- the trigger's invoice_id IS NULL AND price > 0 condition becomes true for both writers.
update public.treatment_plans set price=500 where id='$PLAN';
SQL

cat > "$WORK/one.sql" <<SQL
begin;
update public.treatment_sessions set notes='edited by A' where id='aaaaaaaa-1111-0000-0000-000000000001';
select pg_sleep(1.2);
commit;
SQL
cat > "$WORK/two.sql" <<SQL
begin;
select pg_sleep(0.3);
update public.treatment_sessions set notes='edited by B' where id='aaaaaaaa-1111-0000-0000-000000000002';
select pg_sleep(1.0);
commit;
SQL
psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/one.sql" >/dev/null 2>&1 & P1=$!
psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/two.sql" >/dev/null 2>&1 & P2=$!
wait $P1; wait $P2

INVOICES=$(q "select count(*) from public.invoices")
ORPHANS=$(q "select count(*) from public.invoices i where not exists (select 1 from public.treatment_plans p where p.invoice_id=i.id)")
LINKED=$(q "select count(*) from public.treatment_plans where invoice_id is not null")
echo "mode=$MODE invoices=$INVOICES orphans=$ORPHANS plans_linked=$LINKED"

if [ "$MODE" = "pre-t3" ]; then
  [ "$INVOICES" -ge 2 ] && [ "$ORPHANS" -ge 1 ] \
    && pass "WITHOUT #281 the real trigger issues duplicate invoices (#282 does not prevent this)" \
    || fail "expected duplicate invoices without #281, got $INVOICES / $ORPHANS"
  [ "$FAILS" = "0" ] && { echo "PASS (pre-t3)."; exit 0; } || exit 1
fi

[ "$INVOICES" = "1" ] && pass "with #281 + #282 exactly one invoice is issued" || fail "$INVOICES invoices issued (expected 1)"
[ "$ORPHANS" = "0" ] && pass "no orphan invoice is left" || fail "$ORPHANS orphan invoice(s)"
[ "$LINKED" = "1" ] && pass "the plan links to the single invoice" || fail "plan invoice link count=$LINKED"

# The guard and the invoice trigger must agree on the plan's status after the race.
PSTATUS=$(q "select status from public.treatment_plans where id='$PLAN'")
[ "$PSTATUS" = "completed" ] && pass "the plan is 'completed' after full delivery" || fail "plan status=$PSTATUS"

if [ "$FAILS" = "0" ]; then echo "PASS (integration)."; exit 0; fi
echo "FAILED: $FAILS assertion(s)."; exit 1
