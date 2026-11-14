-- Supabase platform base that a project has BEFORE any repository migration runs.
--
-- Discovered empirically: a bare Postgres cannot apply even the first repo
-- migration (`20260501172659`) because it references `auth.uid()` and the
-- `auth` schema, and later ones insert into `storage.buckets`. None of this is
-- in `supabase/migrations`; on Supabase it is provisioned by the platform.
--
-- This file is the T1 declaration of that contract. It is NOT a migration and is
-- never applied to Production. `clean-build.sh` loads it first so the repository
-- migrations can be replayed on a scratch database.
--
-- Every object here exists on Supabase by default. If a future migration needs
-- something not listed, the clean build will fail and the prerequisite must be
-- added here deliberately.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin nologin superuser; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator nologin; end if;
end $$;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";
create extension if not exists btree_gist;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists realtime;
create schema if not exists vault;
create schema if not exists extensions;
create schema if not exists supabase_functions;
create schema if not exists net;
create schema if not exists cron;
create schema if not exists graphql;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;

create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);

create table if not exists realtime.messages (id uuid primary key default gen_random_uuid(), topic text, extension text, payload jsonb, event text, private boolean default false, inserted_at timestamptz default now());

create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text, secret text, created_at timestamptz default now());
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;

create table if not exists cron.job (jobid bigint primary key generated always as identity, schedule text, command text, nodename text, database text, username text, active boolean default true);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ select 1::bigint $$;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb) returns bigint language sql as $$ select 1::bigint $$;
