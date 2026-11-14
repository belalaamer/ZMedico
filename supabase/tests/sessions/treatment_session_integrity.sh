#!/usr/bin/env bash
# Reproducible proof for T4/T5 (treatment-session integrity) — the GUARD ITSELF.
#
# This file proves three different things and keeps them separate:
#   A. the guard's per-row rules (performed_at, cap, plan reassignment, plan total);
#   B. real concurrency: the second writer is shown waiting on the plan lock and is
#      then refused with SQLSTATE 23514 specifically (not a deadlock, not 40P01);
#   C. the total_sessions-vs-completion race cannot let completion exceed the cap.
#
# Invoicing is NOT proven here. A simplified trigger would prove the wrong thing;
# see treatment_plan_invoice_integration.sh, which combines this migration with
# T3's real trigger.
#
#   ./treatment_session_integrity.sh --pre-fix   # shows every defect
#   ./treatment_session_integrity.sh             # shows every defect prevented
#
# Requires psql and CREATEDB. Creates and drops its own database.
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
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
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
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid, branch_id uuid,
  action text, entity_type text, entity_id uuid, old_values jsonb, new_values jsonb,
  metadata jsonb, created_at timestamptz default now());
create table public.probe (label text, sqlstate text);
create table public.t0 (ts timestamptz);

-- Production has `trg_ts_updated_at`; it sorts AFTER `treatment_sessions_integrity`
-- ("tre" < "trg"), which is exactly why the guard must not read new.updated_at.
create function public.tg_ts_updated_at() returns trigger language plpgsql as
  $$ begin new.updated_at := now(); return new; end $$;
create trigger trg_ts_updated_at before update on public.treatment_sessions
  for each row execute function public.tg_ts_updated_at();
SQL

if [ "$MODE" = "fix" ]; then
  psql -qX -d "$DB" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>"$WORK/err" || {
    echo "FATAL: migration did not apply:"; cat "$WORK/err"; exit 2; }
fi

FAILS=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; FAILS=$((FAILS+1)); }
q() { psql -qX -tA -d "$DB" -c "$1" 2>/dev/null | tail -1; }
ok_sql() { psql -qX -v ON_ERROR_STOP=1 -d "$DB" -c "$1" >/dev/null 2>&1; }
err_sql() { # prints the SQLSTATE of a statement (or OK)
  psql -qX -tA -d "$DB" 2>/dev/null <<SQL | tail -1
do \$\$ begin
  $1;
  raise notice 'ok';
exception when others then
  insert into public.probe(label, sqlstate) values ('probe', sqlstate);
end \$\$;
select coalesce((select sqlstate from public.probe order by ctid desc limit 1), 'ok');
SQL
}
reset_probe() { psql -qX -d "$DB" -c "truncate public.probe" >/dev/null 2>&1; }

# Poll until a backend is seen waiting on a lock matching the pattern, while the
# lock holder is still alive. Polling (rather than one sample) removes the race
# with psql startup; asserting the *sender* is alive keeps it a real overlap.
lock_wait_seen() { # holder_pid query_pattern
  local pid="$1" pat="$2" i c
  for i in $(seq 1 40); do
    c=$(q "select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike '$pat'")
    [ "${c:-0}" -ge 1 ] && return 0
    kill -0 "$pid" 2>/dev/null || return 1
    sleep 0.2
  done
  return 1
}

seed() { # plan_id total completed
  psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.treatment_plans(id, total_sessions) values ('$1', $2);
insert into public.treatment_sessions(treatment_plan_id, session_number, status, performed_at)
select '$1', g, 'completed', now() from generate_series(1, $3) g;
insert into public.treatment_sessions(treatment_plan_id, session_number, status)
select '$1', $3 + g, 'pending' from generate_series(1, 3) g;
SQL
}

echo "mode=$MODE"

# ===========================================================================
# A1. performed_at must be the completion time, not the previous updated_at
# ===========================================================================
P1="11111111-1111-1111-1111-111111111111"; seed "$P1" 6 0
S1=$(q "select id from public.treatment_sessions where treatment_plan_id='$P1' and session_number=1")
psql -qX -d "$DB" -c "update public.treatment_sessions set updated_at='2020-01-01T00:00:00Z' where id='$S1'" >/dev/null
ok_sql "update public.treatment_sessions set status='completed' where id='$S1'"
REC=$(q "select performed_at from public.treatment_sessions where id='$S1'")
STALE=$(q "select performed_at < '2021-01-01'::timestamptz from public.treatment_sessions where id='$S1'")
RECENT=$(q "select performed_at > now() - interval '10 minutes' from public.treatment_sessions where id='$S1'")
if [ "$MODE" = "pre-fix" ]; then
  # With no guard, the column is simply left NULL (and no trigger fills it).
  [ -z "$REC" ] && pass "PRE-FIX: completing without performed_at leaves it NULL" || pass "PRE-FIX: performed_at=$REC (no guard)"
else
  [ "$RECENT" = "t" ] && pass "performed_at is the completion time, not NULL and not the stale updated_at" || fail "performed_at=$REC is not the completion time"
  [ "$STALE" = "f" ] && pass "performed_at is not the old updated_at value" || fail "performed_at was copied from the stale updated_at"
fi

# ---- A1b. performed_at is the completion statement time, not the transaction start
if [ "$MODE" = "fix" ]; then
  P1B="11111111-1111-1111-1111-1111111111b1"
  psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.treatment_plans(id, total_sessions) values ('$P1B', 2);
insert into public.treatment_sessions(id, treatment_plan_id, session_number, status)
values ('b1000000-0000-0000-0000-0000000000b1','$P1B',1,'pending');
SQL
  cat > "$WORK/long.sql" <<SQL
insert into public.t0(ts) values (clock_timestamp());
begin;
select pg_sleep(3);
update public.treatment_sessions set status='completed' where id='b1000000-0000-0000-0000-0000000000b1';
commit;
SQL
  psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/long.sql" >/dev/null 2>&1
  LAG=$(q "select extract(epoch from (s.performed_at - (select ts from public.t0 order by ts desc limit 1))) from public.treatment_sessions s where s.id='b1000000-0000-0000-0000-0000000000b1'")
  # If the guard used now()/transaction_timestamp(), the lag would be ~0. It must
  # reflect the UPDATE, which ran ~3s after the transaction began.
  if awk "BEGIN{exit !($LAG > 2)}"; then
    pass "performed_at reflects the completing statement (${LAG}s after the transaction began)"
  else
    fail "performed_at lag is ${LAG}s: it followed the transaction start, not the completion"
  fi
fi

# ===========================================================================
# A2. completed -> missed clears the timestamp; reopening stays allowed
# ===========================================================================
# With no guard, nothing fills performed_at, so model the client that does set it
# explicitly; otherwise the transition being tested has no timestamp to keep.
[ "$MODE" = "pre-fix" ] && ok_sql "update public.treatment_sessions set performed_at=now() where id='$S1'"
ok_sql "update public.treatment_sessions set status='missed' where id='$S1'"
KEPT=$(q "select performed_at is not null from public.treatment_sessions where id='$S1'")
if [ "$MODE" = "pre-fix" ]; then
  [ "$KEPT" = "t" ] && pass "PRE-FIX: a missed session keeps performed_at (contradiction)" || fail "PRE-FIX: defect did not reproduce"
else
  [ "$KEPT" = "f" ] && pass "a missed session has performed_at cleared" || fail "a missed session still has a performed timestamp"
fi

# ===========================================================================
# A3. the cap
# ===========================================================================
P3="33333333-3333-3333-3333-333333333333"; seed "$P3" 6 6
S3=$(q "select id from public.treatment_sessions where treatment_plan_id='$P3' and status='pending' limit 1")
if ok_sql "update public.treatment_sessions set status='completed' where id='$S3'"; then A3=1; else A3=0; fi
if [ "$MODE" = "pre-fix" ]; then
  [ "$A3" = "1" ] && pass "PRE-FIX: a 7th completion on a 6-session plan is accepted" || fail "PRE-FIX: defect did not reproduce"
else
  [ "$A3" = "0" ] && pass "a 7th completion on a 6-session plan is refused" || fail "a 7th completion was accepted"
fi

# ===========================================================================
# A4. moving a completed session between plans, both sides consistent
# ===========================================================================
# A4a: source not invoiced, target has room -> allowed; source status recomputed.
SRC="a1000000-0000-0000-0000-000000000001"; DST="a1000000-0000-0000-0000-000000000002"
seed "$SRC" 2 2; seed "$DST" 3 1
psql -qX -d "$DB" -c "update public.treatment_plans set status='completed' where id='$SRC'" >/dev/null
MS=$(q "select id from public.treatment_sessions where treatment_plan_id='$SRC' and status='completed' limit 1")
moved=0; ok_sql "update public.treatment_sessions set treatment_plan_id='$DST' where id='$MS'" && moved=1
SRC_DONE=$(q "select count(*) from public.treatment_sessions where treatment_plan_id='$SRC' and status='completed'")
SRC_STATUS=$(q "select status from public.treatment_plans where id='$SRC'")
DST_DONE=$(q "select count(*) from public.treatment_sessions where treatment_plan_id='$DST' and status='completed'")
if [ "$MODE" = "pre-fix" ]; then
  [ "$moved" = "1" ] && pass "PRE-FIX: a completed session moves between plans" || fail "PRE-FIX: move was blocked"
  [ "$SRC_STATUS" = "completed" ] && pass "PRE-FIX: the source plan stays 'completed' while under-delivered" || pass "PRE-FIX: source status=$SRC_STATUS"
else
  [ "$moved" = "1" ] && pass "a completed session may move into a plan with capacity" || fail "a legal move was blocked"
  [ "$SRC_DONE" = "1" ] && [ "$DST_DONE" = "2" ] && pass "both plans' completed counts are correct after the move" || fail "counts: source=$SRC_DONE target=$DST_DONE"
  [ "$SRC_STATUS" = "active" ] && pass "the source plan is no longer 'completed' once under-delivered" || fail "source plan status is $SRC_STATUS (expected active)"
fi

# A4b: target is full -> refused.
FULL="a1000000-0000-0000-0000-000000000003"; seed "$FULL" 1 1
SRC2="a1000000-0000-0000-0000-000000000004"; seed "$SRC2" 3 1
MS2=$(q "select id from public.treatment_sessions where treatment_plan_id='$SRC2' and status='completed' limit 1")
if ok_sql "update public.treatment_sessions set treatment_plan_id='$FULL' where id='$MS2'"; then A4b=1; else A4b=0; fi
if [ "$MODE" = "pre-fix" ]; then
  [ "$A4b" = "1" ] && pass "PRE-FIX: a completed session moves into a full plan" || fail "PRE-FIX: defect did not reproduce"
else
  [ "$A4b" = "0" ] && pass "a completed session cannot move into a full plan" || fail "a completed session moved into a full plan"
fi

# A4c: source has an issued invoice and would become under-delivered -> refused.
INV="a1000000-0000-0000-0000-000000000005"; DST3="a1000000-0000-0000-0000-000000000006"
seed "$INV" 2 2; seed "$DST3" 5 0
psql -qX -d "$DB" -c "update public.treatment_plans set status='completed', invoice_id=gen_random_uuid() where id='$INV'" >/dev/null
MS3=$(q "select id from public.treatment_sessions where treatment_plan_id='$INV' and status='completed' limit 1")
if ok_sql "update public.treatment_sessions set treatment_plan_id='$DST3' where id='$MS3'"; then A4c=1; else A4c=0; fi
if [ "$MODE" = "pre-fix" ]; then
  [ "$A4c" = "1" ] && pass "PRE-FIX: an invoiced plan is silently under-delivered by a move" || fail "PRE-FIX: defect did not reproduce"
else
  [ "$A4c" = "0" ] && pass "a move that would under-deliver an invoiced plan is refused" || fail "an invoiced plan was silently under-delivered"
fi

# ===========================================================================
# A5. lowering total_sessions below the completed count
# ===========================================================================
P6="66666666-6666-6666-6666-666666666666"; seed "$P6" 6 3
if ok_sql "update public.treatment_plans set total_sessions=2 where id='$P6'"; then A5=1; else A5=0; fi
if [ "$MODE" = "pre-fix" ]; then
  [ "$A5" = "1" ] && pass "PRE-FIX: total_sessions drops below the completed count" || fail "PRE-FIX: defect did not reproduce"
else
  [ "$A5" = "0" ] && pass "total_sessions cannot drop below the completed count" || fail "total_sessions dropped below the completed count"
fi

if [ "$MODE" = "fix" ]; then
  # =========================================================================
  # B. Real concurrency: prove the wait, then the exact SQLSTATE.
  # =========================================================================
  P7="77777777-7777-7777-7777-777777777777"
  psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.treatment_plans(id, total_sessions) values ('$P7', 2);
insert into public.treatment_sessions(id, treatment_plan_id, session_number, status)
values ('aaaaaaaa-0000-0000-0000-0000000000a1','$P7',1,'completed'),
       ('bbbbbbbb-0000-0000-0000-0000000000b1','$P7',2,'pending'),
       ('cccccccc-0000-0000-0000-0000000000c1','$P7',3,'pending');
SQL
  # Session A claims the plan lock and holds it.
  cat > "$WORK/a.sql" <<SQL
begin;
update public.treatment_sessions set status='completed' where id='bbbbbbbb-0000-0000-0000-0000000000b1';
select pg_sleep(3.0);
commit;
SQL
  # Session B waits for the lock, then is refused. A DO block captures SQLSTATE.
  cat > "$WORK/b.sql" <<SQL
begin;
select pg_sleep(0.3);
do \$\$ begin
  update public.treatment_sessions set status='completed' where id='cccccccc-0000-0000-0000-0000000000c1';
  insert into public.probe(label, sqlstate) values ('B','ok');
exception when others then
  insert into public.probe(label, sqlstate) values ('B', sqlstate);
end \$\$;
commit;
SQL
  psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/a.sql" >/dev/null 2>&1 & PA=$!
  sleep 0.2
  psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/b.sql" >/dev/null 2>&1 & PB=$!
  # While A still holds the lock, B must be seen waiting on a Lock, not merely sleeping.
  lock_wait_seen "$PA" '%treatment_sessions%' && pass "the second writer is genuinely waiting on a lock held by the first" || fail "no backend was waiting on a lock during the overlap"
  wait $PA; wait $PB
  BSTATE=$(q "select sqlstate from public.probe where label='B' order by ctid desc limit 1")
  DONE=$(q "select count(*) from public.treatment_sessions where treatment_plan_id='$P7' and status='completed'")
  [ "$BSTATE" = "23514" ] && pass "the second writer is refused with 23514 (session cap), not a deadlock" || fail "second writer SQLSTATE=$BSTATE (expected 23514)"
  [ "$DONE" = "2" ] && pass "the plan ends with exactly its cap of completed sessions" || fail "plan has $DONE completed sessions"

  # =========================================================================
  # C. total_sessions lowered while a completion is in flight.
  # =========================================================================
  P9="99999999-9999-9999-9999-999999999999"
  psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.treatment_plans(id, total_sessions) values ('$P9', 5);
insert into public.treatment_sessions(treatment_plan_id, session_number, status, performed_at)
select '$P9', g, 'completed', now() from generate_series(1, 4) g;
insert into public.treatment_sessions(id, treatment_plan_id, session_number, status)
values ('dddddddd-0000-0000-0000-0000000000d1','$P9',5,'pending');
SQL
  cat > "$WORK/c.sql" <<SQL
begin;
update public.treatment_plans set total_sessions=4 where id='$P9';
select pg_sleep(4.0);
commit;
SQL
  cat > "$WORK/d.sql" <<SQL
begin;
select pg_sleep(0.3);
do \$\$ begin
  update public.treatment_sessions set status='completed' where id='dddddddd-0000-0000-0000-0000000000d1';
  insert into public.probe(label, sqlstate) values ('D','ok');
exception when others then
  insert into public.probe(label, sqlstate) values ('D', sqlstate);
end \$\$;
commit;
SQL
  psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/c.sql" >/dev/null 2>&1 & PC=$!
  sleep 0.2
  psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/d.sql" >/dev/null 2>&1 & PD=$!
  lock_wait_seen "$PC" '%treatment_sessions%' && pass "the completion is genuinely waiting on the plan lock held by the total_sessions update" || fail "no backend was waiting during the total_sessions overlap"
  wait $PC; wait $PD
  DSTATE=$(q "select sqlstate from public.probe where label='D' order by ctid desc limit 1")
  TOT=$(q "select total_sessions from public.treatment_plans where id='$P9'")
  CDONE=$(q "select count(*) from public.treatment_sessions where treatment_plan_id='$P9' and status='completed'")
  [ "$CDONE" -le "$TOT" ] && pass "completed ($CDONE) never exceeds total ($TOT) when the total is lowered mid-completion" || fail "completed $CDONE exceeds total $TOT"
  [ "$DSTATE" = "23514" ] && pass "the concurrent completion is refused with 23514 against the lowered total" || fail "concurrent completion SQLSTATE=$DSTATE"

  # =========================================================================
  # A6. the status change is audited
  # =========================================================================
  A=$(q "select count(*) from public.audit_logs where entity_id='$S1' and action='treatment_session.status'")
  [ "$A" -ge 1 ] && pass "a completion status change is written to the audit trail" || fail "no audit row for the status change"
fi

if [ "$FAILS" = "0" ]; then echo "PASS ($MODE)."; exit 0; fi
echo "FAILED: $FAILS assertion(s)."; exit 1
