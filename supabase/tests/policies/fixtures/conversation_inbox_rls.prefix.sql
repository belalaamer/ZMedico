-- Communication inbox: make the AI -> human handoff reachable, and close an
-- RLS hole on the two tables that carry patient conversations.
--
-- Two facts measured on `main` before this migration, not assumed:
--
--   1. The AI receptionist already escalates correctly. `ai-agent-respond`
--      (edge function) writes `conversations.status = 'human_active'`,
--      `handoff_reason` and `handoff_at` on `handoff_to_human`, and again when a
--      turn fails outright; `whatsapp-webhook` does the same on a failed turn.
--      The AI also refuses to speak while a human holds the conversation
--      (ai-agent-respond bails unless status = 'ai_active'), so the handoff is
--      *exclusive* -- the machine goes quiet and the patient waits for a person.
--   2. Nothing in the product can see that handoff. `grep 'from("conversations")'`
--      and `from("messages")` over `src/**` return no client reads at all, and
--      there is no route, page, or navigation entry for messaging. A patient
--      handed to a human therefore waits forever: the only actor who could
--      answer is never shown the conversation.
--
-- The same sweep found the reason a screen was never possible: `row level
-- security` is not enabled on `public.conversations` or `public.messages`
-- anywhere in the 436-migration history, so the restrictive
-- `zmedico_live_actor_boundary` policy added in 20261018142245 is inert on both
-- tables. With RLS off and no other policy, any authenticated user of any clinic
-- could read -- and write -- every other clinic's patient conversations.
--
-- This migration does three things and nothing else:
--   * adds the two permissions the inbox needs to the authz catalog and grants
--     them to the role bundles that already answer patients;
--   * turns RLS on for both tables and gives them tenant/branch-scoped policies
--     keyed on those permissions (the service role, which owns the webhooks and
--     the AI orchestrator, bypasses RLS by design and is unaffected);
--   * leaves the data, the AI behaviour and every existing policy untouched.
--
-- Status: NOT APPLIED. Analysed and written only; nothing here has run against
-- Production `rqcmnfzfytyyicelvifk`.

-- ---------------------------------------------------------------------------
-- 1. Permissions
-- ---------------------------------------------------------------------------
-- Reading a conversation is a patient-data act (a WhatsApp thread is a clinical
-- conversation), so it is its own permission rather than riding on
-- `patients.view`. Responding is separated from reading because a clinic may
-- want a queue that more staff can triage than can reply from.
insert into public.authz_permissions
  (key, group_key, display_name, description, risk_level, default_scope)
values
  ('communication.view',    'communication', 'View patient conversations', 'Read WhatsApp/conversation threads and their messages', 'high',   'branch'),
  ('communication.respond', 'communication', 'Respond to patients',        'Take over a conversation from the AI and send replies', 'high',   'branch')
on conflict (key) do update
  set deprecated = false,
      display_name = excluded.display_name,
      description = excluded.description,
      group_key = excluded.group_key,
      risk_level = excluded.risk_level,
      default_scope = excluded.default_scope,
      updated_at = now();

-- Grant to the bundles that already deal with patients face to face. The owner
-- role (`admin`) is short-circuited inside `has_permission` and needs no grant;
-- `bundle.role.staff` and `bundle.role.hr` deliberately get nothing: neither
-- answers patients, and a conversation thread is patient data.
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
-- 2. Row level security
-- ---------------------------------------------------------------------------
-- `enable row level security` is idempotent, so this is safe on a table that a
-- future migration might already have protected, and it is the change that turns
-- the inert boundary policy above back on.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- A conversation is visible to a staff member who may read conversations AND has
-- access to its branch. `branch_id` is nullable on legacy rows; `user_has_branch_access`
-- already answers true for a NULL branch, which keeps those rows reachable exactly
-- as the rest of the product treats branch-less legacy data.
drop policy if exists conversations_read on public.conversations;
create policy conversations_read
  on public.conversations for select to authenticated
  using (
    public.has_permission(auth.uid(), 'communication.view')
    and public.user_has_branch_access(conversations.branch_id)
  );

-- Taking over, handing back and closing are all updates of `status`. The check is
-- deliberately not narrowed further: the branch scope is the security boundary,
-- and which status transition is allowed is enforced by the screen so a future
-- transition value does not need a migration.
drop policy if exists conversations_update on public.conversations;
create policy conversations_update
  on public.conversations for update to authenticated
  using (
    public.has_permission(auth.uid(), 'communication.respond')
    and public.user_has_branch_access(conversations.branch_id)
  )
  with check (
    public.has_permission(auth.uid(), 'communication.respond')
    and public.user_has_branch_access(conversations.branch_id)
  );

-- Messages are read through their conversation so the scope is defined once.
drop policy if exists messages_read on public.messages;
create policy messages_read
  on public.messages for select to authenticated
  using (
    public.has_permission(auth.uid(), 'communication.view')
    and exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and public.user_has_branch_access(c.branch_id)
    )
  );

-- A staff reply is the only write a person performs here, and it must be an
-- outbound row: an inbound message is something the patient said, so letting a
-- browser insert `direction = 'inbound'` would let staff forge patient speech.
-- Inbound rows are written by `whatsapp-webhook` with the service role, which
-- bypasses RLS and is therefore unaffected by this policy.
drop policy if exists messages_append_outbound on public.messages;
create policy messages_append_outbound
  on public.messages for insert to authenticated
  with check (
    public.has_permission(auth.uid(), 'communication.respond')
    and messages.direction = 'outbound'
    and exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and public.user_has_branch_access(c.branch_id)
    )
  );

comment on policy conversations_read on public.conversations is
  'Staff inbox: a conversation is readable by whoever may read conversations and has access to its branch. Before this policy both conversations and messages had RLS disabled, so every authenticated user of every clinic could read them.';
comment on policy messages_append_outbound on public.messages is
  'Staff replies only: an authenticated client may append an outbound message; inbound rows stay service-role-only so a browser cannot forge patient speech.';
