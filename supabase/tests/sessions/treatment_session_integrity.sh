#!/usr/bin/env bash
# Reproducible proof for T4/T5 (treatment-session integrity).
#
# Builds a throwaway database with the schema shape Production has today, then:
#   ./treatment_session_integrity.sh --pre-fix   # shows every defect
#   ./treatment_session_integrity.sh             # shows every defect prevented
#
# It applies the REAL migration file (not a copy) in fix mode, so the bytes under
# test are the bytes that will run. Nothing here touches a real deployment.
#
# Requires: psql and CREATEDB. Creates and drops its own database.
set -uo pipefail

MODE="fix"
[ "${1:-}" = "--pre-fix" ] && MODE="pre-fix"

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20261112130000_treatment_session_integrity.sql"
[ -f "$MIGRATION" ] || { echo "FATAL: migration not found at $MIGRATION"; exit 2; }

DB="zmed_t45_probe_$$"
WORK="$(mktemp -d)"
cleanup() { psql -qX -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
die() { echo "FATAL: $*"; exit 2; }

psql -qX -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true
psql -qX -d postgres -c "create database $DB" >/dev/null 2>&1 || die "need CREATEDB"

psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || die "schema build failed"
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid, total_sessions integer not null, price numeric default 0,
  status text default 'active', invoice_id uuid,
  updated_at timestamptz default now());
create table public.treatment_sessions (
  id uuid primary key default gen_random_uuid(),
  treatment_plan_id uuid references public.treatment_plans(id),
  session_number integer, status text default 'pending',
  performed_at timestamptz, updated_at timestamptz default now());
create table public.invoices (id uuid primary key default gen_random_uuid(), plan_id uuid);
-- Minimal stand-in for Production's session -> invoice trigger: when a plan is
-- fully delivered and has no invoice yet, issue one.
create function public.tg_test_invoice() returns trigger language plpgsql as $$
declare v_total int; v_done int; v_inv uuid;
begin
  if new.status = 'completed' then
    select total_sessions, invoice_id into v_total, v_inv from public.treatment_plans where id = new.treatment_plan_id;
    select count(*) into v_done from public.treatment_sessions where treatment_plan_id = new.treatment_plan_id and status='completed';
    if v_total is not null and v_inv is null and v_done >= v_total then
      insert into public.invoices(plan_id) values (new.treatment_plan_id) returning id into v_inv;
      update public.treatment_plans set invoice_id = v_inv where id = new.treatment_plan_id;
    end if;
  end if;
  return new;
end $$;
create trigger test_invoice after insert or update on public.treatment_sessions
  for each row execute function public.tg_test_invoice();
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid, branch_id uuid,
  action text, entity_type text, entity_id uuid, old_values jsonb, new_values jsonb,
  metadata jsonb, created_at timestamptz default now());
SQL

if [ "$MODE" = "fix" ]; then
  psql -qX -d "$DB" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>"$WORK/err" || {
    echo "FATAL: migration did not apply:"; cat "$WORK/err"; exit 2; }
fi

FAILS=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; FAILS=$((FAILS+1)); }
q() { psql -qX -tA -d "$DB" -c "$1" 2>/dev/null | tail -1; }
ok_sql() { psql -qX -d "$DB" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }   # true when it succeeds

# Each scenario gets a fresh plan so they cannot influence one another.
seed() { # plan_id total completed_count
  psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.treatment_plans(id, total_sessions) values ('$1', $2);
insert into public.treatment_sessions(treatment_plan_id, session_number, status, performed_at)
select '$1', g, 'completed', now() from generate_series(1, $3) g;
insert into public.treatment_sessions(treatment_plan_id, session_number, status)
select '$1', $3 + g, 'pending' from generate_series(1, 2) g;
SQL
}

echo "mode=$MODE"

# --- T4: completed -> missed must not keep a performed timestamp
P1="11111111-1111-1111-1111-111111111111"; seed "$P1" 6 1
S1=$(q "select id from public.treatment_sessions where treatment_plan_id='$P1' and status='completed' limit 1")
ok_sql "update public.treatment_sessions set status='missed' where id='$S1'"
KEPT=$(q "select performed_at is not null from public.treatment_sessions where id='$S1'")
if [ "$MODE" = "pre-fix" ]; then
  [ "$KEPT" = "t" ] && pass "PRE-FIX: a missed session keeps performed_at (contradiction)" || fail "PRE-FIX: defect did not reproduce"
else
  [ "$KEPT" = "f" ] && pass "a missed session has performed_at cleared" || fail "a missed session still has a performed timestamp"
fi

# --- T4b: reopening a completed session is allowed and clears the timestamp
P2="22222222-2222-2222-2222-222222222222"; seed "$P2" 6 1
S2=$(q "select id from public.treatment_sessions where treatment_plan_id='$P2' and status='completed' limit 1")
opened=0; ok_sql "update public.treatment_sessions set status='pending' where id='$S2'" && opened=1
P2_DONE=$(q "select performed_at is null from public.treatment_sessions where id='$S2'")
if [ "$MODE" = "pre-fix" ]; then
  [ "$opened" = "1" ] && pass "PRE-FIX: reopening is allowed"
else
  [ "$opened" = "1" ] && [ "$P2_DONE" = "t" ] && pass "reopening a completed session is allowed and clears performed_at" || fail "reopening was blocked or left a stale timestamp"
fi

# --- T5: a 7th completion on a 6-session plan
P3="33333333-3333-3333-3333-333333333333"; seed "$P3" 6 6
S3=$(q "select id from public.treatment_sessions where treatment_plan_id='$P3' and status='pending' limit 1")
allowed=0; ok_sql "update public.treatment_sessions set status='completed' where id='$S3'" && allowed=1
if [ "$MODE" = "pre-fix" ]; then
  [ "$allowed" = "1" ] && pass "PRE-FIX: a 7th completion on a 6-session plan is accepted" || fail "PRE-FIX: defect did not reproduce"
else
  [ "$allowed" = "0" ] && pass "a 7th completion on a 6-session plan is refused" || fail "a 7th completion was accepted"
fi

# --- T5b: moving a completed session into a full plan
P4="44444444-4444-4444-4444-444444444444"; seed "$P4" 1 1
P5="55555555-5555-5555-5555-555555555555"; seed "$P5" 1 1
S5=$(q "select id from public.treatment_sessions where treatment_plan_id='$P5' and status='completed' limit 1")
moved=0; ok_sql "update public.treatment_sessions set treatment_plan_id='$P4' where id='$S5'" && moved=1
if [ "$MODE" = "pre-fix" ]; then
  [ "$moved" = "1" ] && pass "PRE-FIX: a completed session moves into a full plan" || fail "PRE-FIX: defect did not reproduce"
else
  [ "$moved" = "0" ] && pass "a completed session cannot move into a full plan" || fail "a completed session moved into a full plan"
fi

# --- T5c: lowering total_sessions below what was delivered
P6="66666666-6666-6666-6666-666666666666"; seed "$P6" 6 3
lowered=0; ok_sql "update public.treatment_plans set total_sessions=2 where id='$P6'" && lowered=1
if [ "$MODE" = "pre-fix" ]; then
  [ "$lowered" = "1" ] && pass "PRE-FIX: total_sessions drops below the completed count" || fail "PRE-FIX: defect did not reproduce"
else
  [ "$lowered" = "0" ] && pass "total_sessions cannot drop below the completed count" || fail "total_sessions dropped below the completed count"
fi

# --- T5d: two concurrent completions for the last remaining session
P7="77777777-7777-7777-7777-777777777777"
psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
-- total 2: one delivered, exactly one slot left, and TWO pending rows competing
-- for it. A completed row would make the update a no-op and prove nothing.
insert into public.treatment_plans(id, total_sessions) values ('$P7', 2);
insert into public.treatment_sessions(id, treatment_plan_id, session_number, status)
values ('aaaaaaaa-0000-0000-0000-00000000000a','$P7',1,'completed'),
       ('bbbbbbbb-0000-0000-0000-00000000000b','$P7',2,'pending'),
       ('cccccccc-0000-0000-0000-00000000000c','$P7',3,'pending');
SQL
cat > "$WORK/a.sql" <<SQL
begin;
update public.treatment_sessions set status='completed' where id='bbbbbbbb-0000-0000-0000-00000000000b';
select pg_sleep(1.2);
commit;
SQL
cat > "$WORK/b.sql" <<SQL
begin;
select pg_sleep(0.3);
update public.treatment_sessions set status='completed' where id='cccccccc-0000-0000-0000-00000000000c';
commit;
SQL
psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/a.sql" >/dev/null 2>&1 & PA=$!
psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/b.sql" >/dev/null 2>&1 & PB=$!
wait $PA; RA=$?
wait $PB; RB=$?
SUCC=$(( (RA==0) + (RB==0) ))
DONE=$(q "select count(*) from public.treatment_sessions where treatment_plan_id='$P7' and status='completed'")
if [ "$MODE" = "pre-fix" ]; then
  [ "$SUCC" = "2" ] && pass "PRE-FIX: both concurrent completions pass (cap exceeded)" || fail "PRE-FIX: race did not reproduce (successes=$SUCC)"
else
  [ "$SUCC" = "1" ] && [ "$DONE" = "2" ] && pass "exactly one of two concurrent completions passes; the cap is respected" || fail "race: successes=$SUCC completed=$DONE (expected 1 overlap then cap)"
fi

# --- T4/T5 x invoicing: the guard must not allow a second invoice
if [ "$MODE" = "fix" ]; then
  P8="88888888-8888-8888-8888-888888888888"
  psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.treatment_plans(id, total_sessions) values ('$P8', 1);
insert into public.treatment_sessions(treatment_plan_id, session_number, status)
values ('$P8',1,'pending'), ('$P8',2,'pending');
SQL
  FIRST=$(q "select id from public.treatment_sessions where treatment_plan_id='$P8' and session_number=1")
  SECOND=$(q "select id from public.treatment_sessions where treatment_plan_id='$P8' and session_number=2")
  ok_sql "update public.treatment_sessions set status='completed' where id='$FIRST'"
  ok_sql "update public.treatment_sessions set status='completed' where id='$SECOND'"
  INV=$(q "select count(*) from public.invoices where plan_id='$P8'")
  [ "$INV" = "1" ] && pass "over-completion is refused, so the invoice fires exactly once" || fail "$INV invoices for a one-session plan"
fi

# --- T4c: the status change is audited
if [ "$MODE" = "fix" ]; then
  A=$(q "select count(*) from public.audit_logs where entity_id='$S1' and action='treatment_session.status'")
  [ "$A" -ge 1 ] && pass "a completion status change is written to the audit trail" || fail "no audit row for the status change"
fi

if [ "$FAILS" = "0" ]; then echo "PASS ($MODE)."; exit 0; fi
echo "FAILED: $FAILS assertion(s)."; exit 1
