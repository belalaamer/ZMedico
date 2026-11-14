#!/usr/bin/env bash
# T1: build a database from the repository alone and report how far it gets.
#
#   ./clean-build.sh                 # supabase/migrations only
#   ./clean-build.sh --with-recovered # + supabase/migrations.recovered, by version
#
# Creates a throwaway database, loads the declared platform base
# (tools/t1/platform-base.sql), then applies every migration with ON_ERROR_STOP.
# It stops at the first failure and prints that file and the error: a partial
# build is reported as partial, never as success.
#
# Requires psql and CREATEDB. Never touches Production.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WITH_RECOVERED=0
[ "${1:-}" = "--with-recovered" ] && WITH_RECOVERED=1
DB="zmed_t1_build_$$"
cleanup() { psql -qX -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true; rm -rf "${TMPDIR:-/tmp}/t1set_$$"; }
trap cleanup EXIT
die() { echo "FATAL: $*"; exit 2; }

psql -qX -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true
psql -qX -d postgres -c "create database $DB" >/dev/null 2>&1 || die "need CREATEDB"
psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/platform-base.sql" >/dev/null 2>&1 || die "platform base failed"

SET="${TMPDIR:-/tmp}/t1set_$$"; mkdir -p "$SET"
cp "$REPO"/supabase/migrations/*.sql "$SET"/ 2>/dev/null
if [ "$WITH_RECOVERED" = "1" ]; then cp "$REPO"/supabase/migrations.recovered/*.sql "$SET"/ 2>/dev/null; fi
TOTAL=$(ls "$SET"/*.sql 2>/dev/null | wc -l | tr -d ' ')

n=0; fail=""
for f in $(ls "$SET"/*.sql | sort); do
  n=$((n+1))
  if ! psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>"$SET/err"; then fail="$f"; break; fi
done

if [ -z "$fail" ]; then
  echo "CLEAN BUILD OK: all $TOTAL migrations applied."
  exit 0
fi
echo "PARTIAL: $((n-1)) of $TOTAL applied."
echo "FIRST FAILURE: $(basename "$fail")"
sed -n '1,3p' "$SET/err"
exit 1
