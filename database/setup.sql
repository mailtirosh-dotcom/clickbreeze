-- ClickBreeze admin access. Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null check (role in ('super_admin', 'verifier', 'support')),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon;
grant select, insert, update, delete on public.admin_users to authenticated;

-- A super admin counts only if the session has passed the authenticator step (aal2).
create schema if not exists private;
create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid()) and role = 'super_admin'
  ) and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;
revoke all on function private.is_super_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_super_admin() to authenticated;

drop policy if exists "admins read own row" on public.admin_users;
create policy "admins read own row" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "super admins read all" on public.admin_users;
create policy "super admins read all" on public.admin_users
  for select to authenticated using ((select private.is_super_admin()));
drop policy if exists "super admins add" on public.admin_users;
create policy "super admins add" on public.admin_users
  for insert to authenticated with check ((select private.is_super_admin()));
drop policy if exists "super admins change" on public.admin_users;
create policy "super admins change" on public.admin_users
  for update to authenticated using ((select private.is_super_admin())) with check ((select private.is_super_admin()));
drop policy if exists "super admins remove" on public.admin_users;
create policy "super admins remove" on public.admin_users
  for delete to authenticated using ((select private.is_super_admin()));
