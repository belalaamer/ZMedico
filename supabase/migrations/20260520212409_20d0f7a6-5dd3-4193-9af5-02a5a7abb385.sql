create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  module text not null,
  actions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, module)
);

alter table public.role_permissions enable row level security;

create policy "role_permissions readable by authenticated"
  on public.role_permissions for select
  to authenticated using (true);

create policy "role_permissions insert admin"
  on public.role_permissions for insert
  to authenticated with check (public.has_role(auth.uid(), 'admin'::app_role));

create policy "role_permissions update admin"
  on public.role_permissions for update
  to authenticated using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

create policy "role_permissions delete admin"
  on public.role_permissions for delete
  to authenticated using (public.has_role(auth.uid(), 'admin'::app_role));

create trigger trg_role_permissions_updated_at
  before update on public.role_permissions
  for each row execute function public.tg_set_updated_at();