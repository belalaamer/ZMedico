#!/usr/bin/env bash
# Reproducible proof for B2 (RLS on patient conversations).
#
# Builds a throwaway database whose conversations/messages policies mirror the
# ones measured on Production (permissive, staff-insert keyed on sender_type),
# then applies the REAL migration file under test and asserts how policy
# aggregation behaves for real roles.
#
#   ./conversation_inbox_rls.sh              # tests the fix (expects AI insert DENIED)
#   ./conversation_inbox_rls.sh --pre-fix    # tests the shipped PR #280 policies (expects AI insert ALLOWED)
#
# The --pre-fix mode applies a COMMITTED fixture of the original (permissive)
# migration under supabase/tests/policies/fixtures/. It does not read git history,
# so it behaves identically from a clean checkout, a shallow clone, or CI.
#
# Requires: psql and CREATEDB. Creates and drops its own database.
set -uo pipefail

MODE="fix"
[ "${1:-}" = "--pre-fix" ] && MODE="pre-fix"

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20261112093000_communication_inbox_and_human_handoff.sql"
[ -f "$MIGRATION" ] || { echo "FATAL: migration not found at $MIGRATION"; exit 2; }

DB="zmed_b2_probe_$$"
TENANT="11111111-1111-1111-1111-111111111111"
B1="22222222-2222-2222-2222-222222222222"
B2="33333333-3333-3333-3333-333333333333"
STAFF1="aaaaaaaa-0000-0000-0000-000000000001"   # view+respond, branch B1
STAFF2="aaaaaaaa-0000-0000-0000-000000000002"   # view+respond, branch B2
STAFF3="aaaaaaaa-0000-0000-0000-000000000003"   # branch B1, NO communication permission
OWNER="aaaaaaaa-0000-0000-0000-000000000004"   # system_owner
CONV="44444444-4444-4444-4444-444444444444"    # branch B1, human held
CONV_NULL="55555555-5555-5555-5555-555555555555" # branch NULL, tenant T1

cleanup() { psql -qX -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT
die() { echo "FATAL: $*"; exit 2; }

psql -qX -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true
psql -qX -d postgres -c "create database $DB" >/dev/null 2>&1 || die "cannot create a scratch database (need CREATEDB)"

# ---------------------------------------------------------------- the surface
psql -qX -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || die "surface build failed"
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
-- Supabase's auth.uid() reads the request JWT. Here it reads a GUC we set, which
-- is the same shape: `auth.uid()` inside a policy is `current_setting`-driven and
-- is NULL when the client is the service role.
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create type public.app_role as enum ('admin','doctor','receptionist','staff','hr','manager','nurse','system_owner');
create table public.authz_permissions (
  key text primary key, group_key text, display_name text, description text,
  risk_level text default 'low', default_scope text default 'branch',
  deprecated boolean default false, updated_at timestamptz default now());
create table public.authz_bundle_permissions (bundle_key text, permission_key text);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid, branch_id uuid,
  action text, entity_type text, entity_id uuid, metadata jsonb, created_at timestamptz default now());

create table public.conversations (
  id uuid primary key, tenant_id uuid, branch_id uuid, status text default 'human_active',
  channel_account_id uuid, external_contact_id text, handoff_reason text, handoff_at timestamptz,
  assigned_staff_id uuid, last_message_at timestamptz default now());
create table public.messages (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, conversation_id uuid,
  direction text, sender_type text, content text, delivery_status text default 'queued',
  external_message_id text, raw_payload jsonb, ai_generated boolean default false);

-- Scope helpers, shaped exactly like Production: they read auth.uid() themselves.
create table public.test_roles (user_id uuid, role text);
create table public.test_perms (user_id uuid, key text);
create table public.test_branch_access (user_id uuid, branch_id uuid);
create table public.test_tenant_access (user_id uuid, tenant_id uuid);

create function public.has_role(_user uuid, _role text) returns boolean
  language sql stable security definer set search_path=public as $$ select exists(select 1 from public.test_roles where user_id=_user and role=_role) $$;
create function public.has_role(_user uuid, _role public.app_role) returns boolean
  language sql stable security definer set search_path=public as
  $$ select exists(select 1 from public.test_roles where user_id=_user and role=_role::text) $$;
create function public.has_permission(_user uuid, _key text) returns boolean
  language sql stable security definer set search_path=public as $$ select exists(select 1 from public.test_perms where user_id=_user and key=_key) $$;
create function public.user_has_branch_access(_branch uuid) returns boolean
  language sql stable security definer set search_path=public as $$
    select _branch is null
      or public.has_role(auth.uid(),'admin')
      or exists(select 1 from public.test_branch_access where user_id=auth.uid() and branch_id=_branch)
  $$;
create function public.user_has_tenant_access(_tenant uuid) returns boolean
  language sql stable security definer set search_path=public as $$
    select _tenant is not null and (
      public.has_role(auth.uid(),'system_owner')
      or exists(select 1 from public.test_tenant_access where user_id=auth.uid() and tenant_id=_tenant))
  $$;

-- Production-shaped PERMISSIVE policies (measured on rqcmnfzfytyyicelvifk).
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
create policy conversations_select_scoped on public.conversations for select to authenticated
  using (public.has_role(auth.uid(),'system_owner')
         or (branch_id is not null and public.user_has_branch_access(branch_id))
         or (branch_id is null and public.user_has_tenant_access(tenant_id)));
create policy conversations_update_scoped on public.conversations for update to authenticated
  using (public.has_role(auth.uid(),'system_owner')
         or (branch_id is not null and public.user_has_branch_access(branch_id))
         or (branch_id is null and public.user_has_tenant_access(tenant_id)))
  with check (public.has_role(auth.uid(),'system_owner')
         or (branch_id is not null and public.user_has_branch_access(branch_id))
         or (branch_id is null and public.user_has_tenant_access(tenant_id)));
create policy messages_select_scoped on public.messages for select to authenticated
  using (public.has_role(auth.uid(),'system_owner')
         or exists(select 1 from public.conversations c where c.id=messages.conversation_id
                   and public.user_has_branch_access(c.branch_id)));
create policy messages_insert_staff_reply on public.messages for insert to authenticated
  with check (sender_type = 'staff'
    and exists(select 1 from public.conversations c where c.id=messages.conversation_id
               and public.user_has_branch_access(c.branch_id)));

grant usage on schema public, auth to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select, update on public.conversations to authenticated;
grant insert on public.audit_logs to authenticated;
grant execute on all functions in schema public, auth to authenticated;

insert into public.conversations (id, tenant_id, branch_id, status, external_contact_id)
values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 'human_active', '201000000001'),
       ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111',
        null, 'human_active', '201000000002');
insert into public.test_roles values
  ('aaaaaaaa-0000-0000-0000-000000000004','system_owner');
insert into public.test_perms values
  ('aaaaaaaa-0000-0000-0000-000000000001','communication.view'),
  ('aaaaaaaa-0000-0000-0000-000000000001','communication.respond'),
  ('aaaaaaaa-0000-0000-0000-000000000002','communication.view'),
  ('aaaaaaaa-0000-0000-0000-000000000002','communication.respond');
insert into public.test_branch_access values
  ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333'),
  ('aaaaaaaa-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222');
insert into public.test_tenant_access values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');
SQL

# ---------------------------------------------------------------- migration under test
if [ "$MODE" = "pre-fix" ]; then
  MIGRATION="$HERE/fixtures/conversation_inbox_rls.prefix.sql"
  [ -f "$MIGRATION" ] || die "pre-fix fixture missing at $MIGRATION"
  # Guard: the fixture must really be the permissive version. If it ever grows a
  # RESTRICTIVE policy it is no longer the pre-fix state and the proof is void.
  if grep -qiE "as restrictive" "$MIGRATION"; then
    die "pre-fix fixture already contains a RESTRICTIVE policy; it cannot demonstrate the old behaviour"
  fi
fi
psql -qX -d "$DB" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>"/tmp/b2_mig_err_$$" || {
  echo "FATAL: migration did not apply:"; cat "/tmp/b2_mig_err_$$"; exit 2; }

FAILS=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; FAILS=$((FAILS+1)); }

# Runs an INSERT as a given user under the authenticated role. Echoes rows written.
try_insert() { # uid conversation sender direction
  psql -qX -tA -d "$DB" -v ON_ERROR_STOP=1 2>"${B2_ERRF:-/dev/null}" <<SQL
select set_config('test.uid','$1',false);
set role authenticated;
insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, delivery_status)
values ('$TENANT','$2','$4','$3','probe','queued');
SQL
}
count_as() { # uid sql
  psql -qX -tA -d "$DB" -v ON_ERROR_STOP=1 2>"${B2_ERRF:-/dev/null}" <<SQL
select set_config('test.uid','$1',false);
set role authenticated;
$2
SQL
}

echo "mode=$MODE"

# --- the case that matters: forging the assistant's voice
if [ "$MODE" = "pre-fix" ]; then
  if try_insert "$STAFF1" "$CONV" ai outbound >/dev/null; then
    pass "PRE-FIX: staff CAN forge a sender_type=ai message (the defect is real)"
  else
    fail "PRE-FIX: the defect did not reproduce; this harness proves nothing"
  fi
  [ "$FAILS" = "0" ] && { echo "REPRODUCED the old behaviour."; exit 0; }
  echo "Harness invalid."; exit 1
fi

try_insert "$STAFF1" "$CONV" staff outbound >/dev/null && pass "staff with respond + branch may send an outbound staff reply" || fail "authorised staff reply was blocked"
if try_insert "$STAFF1" "$CONV" ai outbound >/dev/null; then fail "staff CAN still forge a sender_type=ai message"; else pass "staff CANNOT forge a sender_type=ai message"; fi
if try_insert "$STAFF1" "$CONV" patient inbound >/dev/null; then fail "staff CAN forge an inbound (patient) message"; else pass "staff CANNOT forge an inbound message"; fi
if try_insert "$STAFF2" "$CONV" staff outbound >/dev/null; then fail "a staff member of ANOTHER branch could reply"; else pass "another branch's staff cannot reply"; fi
if try_insert "$STAFF3" "$CONV" staff outbound >/dev/null; then fail "staff WITHOUT communication.respond could reply"; else pass "staff without the permission cannot reply"; fi
try_insert "$OWNER" "$CONV" staff outbound >/dev/null && pass "system_owner can reply" || fail "system_owner was blocked"

VIS1=$(count_as "$STAFF1" "select count(*) from public.conversations" | tail -1)
VIS2=$(count_as "$STAFF2" "select count(*) from public.conversations" | tail -1)
[ "$VIS1" = "2" ] && pass "branch-1 staff read both their branch and the branch-less conversation" || fail "branch-1 staff saw $VIS1 conversations (expected 2)"
[ "$VIS2" = "0" ] && pass "branch-2 staff cannot read branch-1 or the branch-less conversation" || fail "branch-2 staff saw $VIS2 conversations (expected 0)"

# NULL branch must be scoped by tenant, not by "null is fine".
NULL_VIS=$(count_as "$STAFF2" "select count(*) from public.conversations where branch_id is null" | tail -1)
[ "$NULL_VIS" = "0" ] && pass "a branch-less conversation is not visible without tenant access" || fail "branch-less conversations leaked to a user with no tenant access"

# A branch-less conversation must be insertable only with tenant access. This is
# the case the first revision missed: `user_has_branch_access(NULL)` is TRUE, so
# Production's permissive insert policy alone would let any responder in.
try_insert "$STAFF1" "$CONV_NULL" staff outbound >/dev/null && pass "a respondent with tenant access may reply on a branch-less conversation" || fail "a respondent with tenant access was blocked on a branch-less conversation"
if try_insert "$STAFF2" "$CONV_NULL" staff outbound >/dev/null; then fail "a respondent WITHOUT tenant access could write to a branch-less conversation"; else pass "a respondent without tenant access cannot write to a branch-less conversation"; fi

NULL_AFTER=$(psql -qX -tA -d "$DB" -c "select count(*) from public.messages where conversation_id='$CONV_NULL'" | tail -1)
[ "$NULL_AFTER" = "1" ] && pass "the refused branch-less write left no row behind" || fail "the refused branch-less write still wrote $NULL_AFTER row(s)"

if [ "$FAILS" = "0" ]; then echo "FIXED: all policy assertions hold."; rm -f "/tmp/b2_mig_err_$$"; exit 0; fi
echo "FAILED: $FAILS assertion(s)."
rm -f "/tmp/b2_mig_err_$$"
exit 1
