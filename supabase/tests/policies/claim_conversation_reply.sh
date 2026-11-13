#!/usr/bin/env bash
# Reproducible proof for the send-claim lifecycle (B4, review point 3).
#
# Extracts `claim_conversation_reply` from the REAL migration file (not a copy),
# so the bytes under test are the bytes that will run. Then exercises the three
# states that matter:
#
#   1. first claim wins, second concurrent claim is refused (no double send);
#   2. a claim left behind by a crashed attempt is reclaimable after the stale
#      window, so the row cannot get stuck at `queued` forever;
#   3. a delivered row is never reclaimable.
#
# It deliberately does NOT assert exactly-once delivery at the provider: the
# database cannot know whether the provider accepted a message before the process
# died. That limit is documented rather than pretended away.
#
# Requires: psql and CREATEDB. Creates and drops its own database.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20261112093000_communication_inbox_and_human_handoff.sql"
[ -f "$MIGRATION" ] || { echo "FATAL: migration not found"; exit 2; }

DB="zmed_claim_probe_$$"
cleanup() { psql -qX -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true; rm -f "/tmp/claim_$$.sql"; }
trap cleanup EXIT
die() { echo "FATAL: $*"; exit 2; }

psql -qX -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true
psql -qX -d postgres -c "create database $DB" >/dev/null 2>&1 || die "need CREATEDB"

psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || die "surface build failed"
create table public.messages (
  id uuid primary key,
  delivery_status text not null default 'queued',
  raw_payload jsonb);
SQL

# Extract the function verbatim from the migration.
python3 - "$MIGRATION" "/tmp/claim_$$.sql" <<'PY' || die "could not extract claim_conversation_reply"
import sys,re
src=open(sys.argv[1]).read()
m=re.search(r"create or replace function public\.claim_conversation_reply\b.*?\n\$\$;", src, re.S|re.I)
if not m: sys.exit("function not found in migration")
open(sys.argv[2],"w").write(m.group(0))
PY
psql -qX -d "$DB" -v ON_ERROR_STOP=1 -f "/tmp/claim_$$.sql" >/dev/null 2>&1 || die "claim function did not apply"

MID="99999999-9999-9999-9999-999999999999"
psql -qX -d "$DB" -c "insert into public.messages(id) values ('$MID')" >/dev/null

FAILS=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; FAILS=$((FAILS+1)); }
claim() { psql -qX -tA -d "$DB" -c "select public.claim_conversation_reply('$MID'${1:+,$1})" | tail -1; }
attempts() { psql -qX -tA -d "$DB" -c "select coalesce(raw_payload->>'send_attempt','0') from public.messages where id='$MID'" | tail -1; }

[ "$(claim)" = "t" ] && pass "first claim wins" || fail "first claim was refused"
[ "$(claim)" = "f" ] && pass "second concurrent claim is refused (no double send)" || fail "second claim was allowed"
[ "$(attempts)" = "1" ] && pass "the refused claim did not increment the attempt counter" || fail "attempt counter moved on a refused claim"

# Simulate a crash after claiming: the marker is 5 minutes old, status still queued.
psql -qX -d "$DB" -c "update public.messages set raw_payload = raw_payload || jsonb_build_object('send_claimed_at', now() - interval '5 minutes') where id='$MID'" >/dev/null
[ "$(claim)" = "t" ] && pass "a stale claim is reclaimable, so a crashed attempt cannot wedge the row" || fail "a stale claim was not reclaimable"
[ "$(attempts)" = "2" ] && pass "the reclaim records a second attempt" || fail "the reclaim did not record an attempt"

# A delivered row is terminal.
psql -qX -d "$DB" -c "update public.messages set delivery_status='sent', raw_payload = raw_payload || jsonb_build_object('send_claimed_at', now() - interval '1 hour') where id='$MID'" >/dev/null
[ "$(claim)" = "f" ] && pass "a delivered row is never reclaimable, even when stale" || fail "a delivered row was reclaimed"

if [ "$FAILS" = "0" ]; then echo "PASS: claim lifecycle holds."; exit 0; fi
echo "FAILED: $FAILS assertion(s)."; exit 1
