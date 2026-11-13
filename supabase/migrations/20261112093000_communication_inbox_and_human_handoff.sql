-- Communication inbox: make the AI -> human handoff reachable, and harden the
-- two tables that carry patient conversations -- without widening their access.
--
-- What is TRUE on `main` (measured, not assumed):
--
--   1. The AI receptionist already escalates. `ai-agent-respond` writes
--      `conversations.status = 'human_active'` plus `handoff_reason`/`handoff_at`
--      when the model calls `handoff_to_human`, and again when a turn fails
--      outright; `whatsapp-webhook` does the same on a failed turn. The AI then
--      refuses to speak (it bails unless status = 'ai_active'), so a handoff is
--      exclusive: the machine goes quiet and the patient waits for a person.
--   2. Nothing in the product can see that handoff. There is no route, page or
--      nav entry for messaging and no client read of `conversations`/`messages`
--      at all. A handed-off patient therefore waits forever.
--
-- The tables themselves were created OUTSIDE this repository (see `ai_messaging_
-- platform_phase1`, which has no migration file). Their RLS, policies and
-- triggers exist in Production but not in the migration history. This file is
-- written to be correct against Production as it actually is, and to be safe if
-- that surface is later reconstructed by T1:
--
--   * Every policy added here is `AS RESTRICTIVE`. Permissive policies are OR-ed
--     together, so a new `FOR INSERT` permissive policy would silently widen an
--     existing one. A RESTRICTIVE policy is AND-ed, so it can only ever NARROW.
--     This migration therefore cannot grant access that Production does not
--     already grant; the worst it can do is deny, and each denial is deliberate.
--   * `system_owner` is allowed explicitly, because `has_permission` short-
--     circuits only `admin`, not `system_owner`.
--   * A conversation with `branch_id IS NULL` (legacy rows) is scoped by
--     `tenant_id` via `user_has_tenant_access`, never by "NULL branch is fine".
--
-- Status: NOT APPLIED. Nothing here has run against Production
-- `rqcmnfzfytyyicelvifk`.

-- ---------------------------------------------------------------------------
-- 1. Permissions
-- ---------------------------------------------------------------------------
-- Reading a conversation is a patient-data act (a WhatsApp thread is a clinical
-- conversation), so it is its own permission rather than riding on
-- `patients.view`. Responding is separate from reading because a clinic may want
-- more staff able to triage than able to reply.
insert into public.authz_permissions
  (key, group_key, display_name, description, risk_level, default_scope)
values
  ('communication.view',    'communication', 'View patient conversations', 'Read WhatsApp/conversation threads and their messages', 'high', 'branch'),
  ('communication.respond', 'communication', 'Respond to patients',        'Take over a conversation from the AI and send replies', 'high', 'branch')
on conflict (key) do update
  set deprecated = false,
      display_name = excluded.display_name,
      description = excluded.description,
      group_key = excluded.group_key,
      risk_level = excluded.risk_level,
      default_scope = excluded.default_scope,
      updated_at = now();

-- Grant to the bundles that already deal with patients face to face. `admin` is
-- short-circuited inside `has_permission`; `staff` and `hr` deliberately get
-- nothing -- neither answers patients, and a thread is patient data.
insert into public.authz_bundle_permissions (bundle_key, permission_key)
values
  ('bundle.role.admin',        'communication.view'),
  ('bundle.role.admin',        'communication.respond'),
  ('bundle.role.manager',      'communication.view'),
  ('bundle.role.manager',      'communication.respond'),
  ('bundle.role.receptionist', 'communication.view'),
  ('bundle.role.receptionist', 'communication.respond'),
  ('bundle.role.doctor',       'communication.view'),
  ('bundle.role.doctor',       'communication.respond'),
  ('bundle.role.nurse',        'communication.view'),
  ('bundle.role.nurse',        'communication.respond')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Row level security: narrow, never widen
-- ---------------------------------------------------------------------------
-- Idempotent; on Production both tables already have it on. Kept so a rebuilt
-- database cannot end up with conversations readable by every authenticated
-- user just because the original DDL lived outside this repository.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- A conversation is visible when the caller may read conversations AND either
-- owns the branch it belongs to, or -- for a branch-less legacy row -- has
-- tenant access. `system_owner` is named explicitly so the platform console
-- keeps working. RESTRICTIVE: AND-ed with whatever Production already enforces.
drop policy if exists conversations_read_permission on public.conversations;
create policy conversations_read_permission
  on public.conversations as restrictive for select to authenticated
  using (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    or (
      public.has_permission(auth.uid(), 'communication.view')
      and (
        (conversations.branch_id is not null and public.user_has_branch_access(conversations.branch_id))
        or (conversations.branch_id is null and public.user_has_tenant_access(conversations.tenant_id))
      )
    )
  );

-- Taking over / handing back / closing are updates of `status`. Same scope, with
-- `communication.respond` rather than `.view`.
drop policy if exists conversations_update_permission on public.conversations;
create policy conversations_update_permission
  on public.conversations as restrictive for update to authenticated
  using (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    or (
      public.has_permission(auth.uid(), 'communication.respond')
      and (
        (conversations.branch_id is not null and public.user_has_branch_access(conversations.branch_id))
        or (conversations.branch_id is null and public.user_has_tenant_access(conversations.tenant_id))
      )
    )
  )
  with check (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    or (
      public.has_permission(auth.uid(), 'communication.respond')
      and (
        (conversations.branch_id is not null and public.user_has_branch_access(conversations.branch_id))
        or (conversations.branch_id is null and public.user_has_tenant_access(conversations.tenant_id))
      )
    )
  );

-- Messages are read through their conversation so scope is defined once.
drop policy if exists messages_read_permission on public.messages;
create policy messages_read_permission
  on public.messages as restrictive for select to authenticated
  using (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    or (
      public.has_permission(auth.uid(), 'communication.view')
      and exists (
        select 1 from public.conversations c
         where c.id = messages.conversation_id
           and (
             (c.branch_id is not null and public.user_has_branch_access(c.branch_id))
             or (c.branch_id is null and public.user_has_tenant_access(c.tenant_id))
           )
      )
    )
  );

-- A conversation is "reachable" for a write when the caller owns its branch, or
-- -- for a branch-less legacy row -- has tenant access. This exists as a
-- SECURITY DEFINER helper so a policy can use it without inheriting the read
-- policy's requirements (a responder need not also hold `communication.view`),
-- and so the NULL-branch case is answered by tenant scope rather than by
-- `user_has_branch_access`, which treats NULL as allowed.
create or replace function public.conversation_scope_allows(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'system_owner'::public.app_role)
      or exists (
    select 1 from public.conversations c
     where c.id = p_conversation_id
       and (
         (c.branch_id is not null and public.user_has_branch_access(c.branch_id))
         or (c.branch_id is null and public.user_has_tenant_access(c.tenant_id))
       )
  );
$$;

revoke all on function public.conversation_scope_allows(uuid) from public, anon;
grant execute on function public.conversation_scope_allows(uuid) to authenticated;

-- THE security fix (B2). A staff reply must be an OUTBOUND message the STAFF
-- wrote, in a conversation the caller can actually reach. Without this, a
-- permissive insert policy keyed on `direction` alone lets a browser insert
-- `sender_type = 'ai'` (forging the assistant) or `direction = 'inbound'`
-- (forging patient speech). RESTRICTIVE, so it AND-s with the existing
-- `messages_insert_staff_reply` and cannot widen it.
--
-- The scope is checked by `conversation_scope_allows`, NOT by the existing
-- permissive policy: that policy scopes through `user_has_branch_access`, which
-- answers TRUE for a NULL branch, so a branch-less conversation of another
-- tenant would otherwise be insertable by any responder who guessed its id.
-- The helper requires tenant access when the branch is NULL.
drop policy if exists messages_insert_staff_only on public.messages;
create policy messages_insert_staff_only
  on public.messages as restrictive for insert to authenticated
  with check (
    messages.direction = 'outbound'
    and messages.sender_type = 'staff'
    and public.conversation_scope_allows(messages.conversation_id)
    and (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      or public.has_permission(auth.uid(), 'communication.respond')
    )
  );

comment on policy messages_insert_staff_only on public.messages is
  'A browser may only append an outbound message attributed to staff. Blocks forging assistant (sender_type=ai) and patient (direction=inbound) messages. RESTRICTIVE so it narrows, never widens, the existing insert policy.';comment on policy conversations_read_permission on public.conversations is
  'Requires communication.view plus branch (or tenant, for legacy branch-less) access. system_owner is allowed explicitly. RESTRICTIVE: AND-ed with Production''s existing scoped policy.';

-- The ONE deliberate widening in this file, and it is required: Production's
-- existing `messages_insert_staff_reply` is PERMISSIVE and has no `system_owner`
-- arm, so the platform owner can read every thread (the select policy names
-- them) but cannot insert a reply -- the restrictive policy above only AND-s and
-- cannot add access. This adds exactly that missing arm, and nothing else: it is
-- limited to `system_owner`, and it still requires an outbound staff message, so
-- it cannot widen any other role and cannot forge AI or patient speech.
-- Verified by `supabase/tests/policies/conversation_inbox_rls.sh`.
drop policy if exists messages_insert_system_owner on public.messages;
create policy messages_insert_system_owner
  on public.messages for insert to authenticated
  with check (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    and messages.direction = 'outbound'
    and messages.sender_type = 'staff'
  );

comment on policy messages_insert_system_owner on public.messages is
  'Allows the platform owner (system_owner) to insert a staff reply, which Production''s permissive insert policy does not. Constrained to sender_type=staff and direction=outbound, so it implies no other widening.';

-- ---------------------------------------------------------------------------
-- 3. Audit trail for the human handoff (S6)
-- ---------------------------------------------------------------------------
-- Taking over, handing back and closing a patient conversation are patient-data
-- actions that today leave no trace. A SECURITY DEFINER RPC is used instead of a
-- client-side insert because `audit_logs` is append-only and its RLS is not a
-- place to grant broad client INSERT. The actor is always `auth.uid()` -- it is
-- never taken from a parameter, so the trail cannot be attributed to someone
-- else. The function checks the same permission the update requires.
create or replace function public.log_conversation_action(
  p_conversation_id uuid,
  p_action text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_conv record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_action not in ('take_over', 'hand_back', 'close') then
    raise exception 'Unknown conversation action: %', p_action using errcode = '22023';
  end if;

  select id, tenant_id, branch_id into v_conv
    from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  -- This must mirror `conversations_update_permission` exactly, or the trail can
  -- diverge from the action it describes: the update policy names
  -- `system_owner` and scopes through the same helper, so the audit RPC does too.
  -- A platform owner without direct branch membership is therefore not rejected
  -- for an action the policy allowed.
  if not (
    public.has_role(v_uid, 'system_owner'::public.app_role)
    or (
      public.has_permission(v_uid, 'communication.respond')
      and public.conversation_scope_allows(p_conversation_id)
    )
  ) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  insert into public.audit_logs (user_id, branch_id, action, entity_type, entity_id, metadata)
  values (
    v_uid,
    v_conv.branch_id,
    'conversation.' || p_action,
    'conversation',
    p_conversation_id,
    jsonb_build_object('action', p_action, 'note', left(coalesce(p_note, ''), 500))
  );
end;
$$;

revoke all on function public.log_conversation_action(uuid, text, text) from public, anon;
grant execute on function public.log_conversation_action(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Atomic send-claim (B4)
-- ---------------------------------------------------------------------------
-- Two staff believing they hold a thread, or one retrying a slow send, must not
-- put the same sentence on a patient's phone twice. The claim is a conditional
-- UPDATE on the message row that succeeds exactly once: it stamps a marker into
-- `raw_payload` only while `delivery_status = 'queued'` and no marker exists yet.
--
-- A marker is used rather than a new `delivery_status` value because the message
-- table lives outside this repository and its status CHECK may not accept one;
-- inventing `sending` could break the webhook's own status updates. Only the
-- service role (the edge function) may claim, and a claim is not a delivery: the
-- outcome is still written by `send-conversation-reply`.
create or replace function public.claim_conversation_reply(
  p_message_id uuid,
  p_stale_after_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- The claim is bounded in time on purpose. If the edge function dies after
  -- claiming but before recording an outcome, the row stays `queued` with a
  -- stale marker; without a staleness window it could never be retried. After
  -- `p_stale_after_seconds` a later attempt may claim it again.
  --
  -- This prevents *concurrent* double-sends inside the database. It does NOT
  -- give exactly-once delivery at the provider: a crash after the provider
  -- accepted the message but before `delivery_status='sent'` was written can
  -- still cause a resend on recovery. That limit is real and is not claimed away.
  update public.messages
     set raw_payload = coalesce(raw_payload, '{}'::jsonb)
                        || jsonb_build_object(
                             'send_claimed_at', now(),
                             'send_attempt', coalesce((raw_payload ->> 'send_attempt')::int, 0) + 1)
   where id = p_message_id
     and delivery_status = 'queued'
     and (
       raw_payload is null
       or raw_payload ->> 'send_claimed_at' is null
       or (raw_payload ->> 'send_claimed_at')::timestamptz < now() - make_interval(secs => greatest(p_stale_after_seconds, 1))
     )
  returning id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function public.claim_conversation_reply(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_conversation_reply(uuid, integer) to service_role;
