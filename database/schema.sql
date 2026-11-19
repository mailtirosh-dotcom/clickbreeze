-- ClickBreeze data tables. Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- Run setup.sql first (it creates admin_users and private.is_super_admin).

-- Which role the signed-in admin has. Returns null unless the authenticator step (aal2) is passed.
create or replace function private.admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role from public.admin_users a
  where a.user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;
revoke all on function private.admin_role() from public, anon;
grant execute on function private.admin_role() to authenticated;

-- ---------- Tables ----------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.settings (key, value) values ('verified_needed', '3'), ('refund_limit', '500')
  on conflict (key) do nothing;

create table if not exists public.categories (
  name text primary key,
  active boolean not null default true
);
insert into public.categories (name) values ('Wedding'), ('Birthday'), ('Product'), ('Portrait'), ('Event'), ('Video / drone')
  on conflict (name) do nothing;

create table if not exists public.towns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ta text,
  district text not null,
  state text not null default 'Tamil Nadu',
  override text check (override in ('open', 'closed')),
  created_at timestamptz not null default now(),
  unique (state, district, name)
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'individual' check (type in ('individual', 'studio')),
  full_name text not null,
  studio_name text,
  mobile text,
  email text,
  experience_years integer check (experience_years >= 0),
  town_id uuid references public.towns (id),
  pin text,
  address text,
  categories text[] not null default '{}',
  packages jsonb not null default '[]',
  id_proof_type text,
  gstin text,
  status text not null default 'pending'
    check (status in ('draft', 'pending', 'changes_requested', 'verified', 'rejected', 'suspended')),
  admin_notes text,
  checklist jsonb not null default '[]',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index if not exists providers_town_idx on public.providers (town_id);
create index if not exists providers_mobile_idx on public.providers (mobile);

create table if not exists public.requirements (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  customer_name text,
  event_type text not null,
  event_date date,
  town_id uuid references public.towns (id),
  reach text not null default 'town' check (reach in ('town', 'district', 'state')),
  status text not null default 'open'
    check (status in ('open', 'widened', 'confirmed', 'expired', 'cancelled')),
  closes_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists requirements_town_idx on public.requirements (town_id);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.requirements (id) on delete cascade,
  provider_id uuid not null references public.providers (id),
  amount integer not null check (amount > 0),
  package text,
  status text not null default 'active' check (status in ('active', 'rejected', 'withdrawn', 'removed', 'won')),
  created_at timestamptz not null default now()
);
create index if not exists bids_requirement_idx on public.bids (requirement_id);
create index if not exists bids_provider_idx on public.bids (provider_id);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  requirement_id uuid not null references public.requirements (id),
  bid_id uuid references public.bids (id),
  token_amount integer,
  token_paid_at timestamptz,
  due_at timestamptz,
  delivered_at timestamptz,
  status text not null default 'confirmed' check (status in ('confirmed', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists bookings_requirement_idx on public.bookings (requirement_id);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  type text not null,
  booking_id uuid references public.bookings (id),
  provider_id uuid references public.providers (id),
  customer_name text,
  opened_at timestamptz not null default now(),
  respond_by timestamptz,
  status text not null default 'open' check (status in ('open', 'waiting_provider', 'under_review', 'closed')),
  assigned_to uuid references public.admin_users (user_id) on delete set null,
  token_amount integer,
  outcome text,
  refund_amount integer,
  resolution_note text,
  resolved_at timestamptz,
  timeline jsonb not null default '[]'
);
create index if not exists disputes_provider_idx on public.disputes (provider_id);

create table if not exists public.safety_flags (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null default 'provider' check (subject_kind in ('provider', 'customer', 'number')),
  subject_name text not null,
  provider_id uuid references public.providers (id),
  flag_type text not null,
  evidence text,
  severity text not null default 'medium' check (severity in ('high', 'medium', 'low')),
  status text not null default 'open' check (status in ('open', 'dismissed', 'action_taken')),
  decision text,
  notes text,
  decided_by uuid default null,
  created_at timestamptz not null default now()
);
create index if not exists safety_provider_idx on public.safety_flags (provider_id);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id uuid not null,
  admin_name text,
  action text not null,
  record text
);

-- ---------- Security ----------
-- Every table: no anonymous access, and only signed-in admins who passed the authenticator can read.
do $$
declare t text;
begin
  foreach t in array array['settings','categories','towns','providers','requirements','bids','bookings','disputes','safety_flags','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "admins read" on public.%I', t);
    execute format('create policy "admins read" on public.%I for select to authenticated using ((select private.admin_role()) is not null)', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all sequences in schema public from anon;

-- Settings, categories, towns: super admin only.
do $$
declare t text;
begin
  foreach t in array array['settings','categories','towns'] loop
    execute format('drop policy if exists "super admin adds" on public.%I', t);
    execute format('create policy "super admin adds" on public.%I for insert to authenticated with check ((select private.admin_role()) = ''super_admin'')', t);
    execute format('drop policy if exists "super admin changes" on public.%I', t);
    execute format('create policy "super admin changes" on public.%I for update to authenticated using ((select private.admin_role()) = ''super_admin'') with check ((select private.admin_role()) = ''super_admin'')', t);
    execute format('drop policy if exists "super admin removes" on public.%I', t);
    execute format('create policy "super admin removes" on public.%I for delete to authenticated using ((select private.admin_role()) = ''super_admin'')', t);
  end loop;
end $$;

-- Providers: verifiers and super admins enroll and review. Only a super admin deletes.
drop policy if exists "verifiers add providers" on public.providers;
create policy "verifiers add providers" on public.providers
  for insert to authenticated with check ((select private.admin_role()) in ('super_admin', 'verifier'));
drop policy if exists "verifiers change providers" on public.providers;
create policy "verifiers change providers" on public.providers
  for update to authenticated
  using ((select private.admin_role()) in ('super_admin', 'verifier'))
  with check ((select private.admin_role()) in ('super_admin', 'verifier'));
drop policy if exists "super admin removes providers" on public.providers;
create policy "super admin removes providers" on public.providers
  for delete to authenticated using ((select private.admin_role()) = 'super_admin');

-- Requirements, bids, bookings, disputes, safety flags: support and super admins can act.
do $$
declare t text;
begin
  foreach t in array array['requirements','bids','bookings','disputes','safety_flags'] loop
    execute format('drop policy if exists "support changes" on public.%I', t);
    execute format('create policy "support changes" on public.%I for update to authenticated using ((select private.admin_role()) in (''super_admin'', ''support'')) with check ((select private.admin_role()) in (''super_admin'', ''support''))', t);
  end loop;
end $$;

-- Support and super admins can raise a safety flag (for example from a dispute).
drop policy if exists "support adds flags" on public.safety_flags;
create policy "support adds flags" on public.safety_flags
  for insert to authenticated with check ((select private.admin_role()) in ('super_admin', 'support'));

-- Audit log: any admin can add a line as themselves. Nobody can edit or delete lines.
drop policy if exists "admins write own audit lines" on public.audit_log;
create policy "admins write own audit lines" on public.audit_log
  for insert to authenticated
  with check (admin_id = (select auth.uid()) and (select private.admin_role()) is not null);
revoke update, delete on public.audit_log from authenticated;

-- Only a super admin may suspend or reinstate a provider.
create or replace function private.providers_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and ((new.status = 'suspended' and old.status is distinct from 'suspended')
          or (old.status = 'suspended' and new.status <> 'suspended'))
     and (select private.admin_role()) is distinct from 'super_admin' then
    raise exception 'Only a super admin can suspend or reinstate a provider';
  end if;
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    new.verified_at := now();
  end if;
  return new;
end $$;
drop trigger if exists providers_guard on public.providers;
create trigger providers_guard before insert or update on public.providers
  for each row execute function private.providers_guard();

-- Refunds above the limit in settings need a super admin.
create or replace function private.disputes_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare lim integer;
begin
  select (s.value #>> '{}')::integer into lim from public.settings s where s.key = 'refund_limit';
  if new.refund_amount is not null and new.refund_amount > coalesce(lim, 500)
     and (select private.admin_role()) is distinct from 'super_admin' then
    raise exception 'Refunds above the limit need a super admin';
  end if;
  return new;
end $$;
drop trigger if exists disputes_guard on public.disputes;
create trigger disputes_guard before update on public.disputes
  for each row execute function private.disputes_guard();

-- ---------- Team functions (they need to see the sign-in system, so they run with extra rights) ----------
create or replace function public.admin_team()
returns table (user_id uuid, email text, full_name text, role text, last_active timestamptz, authenticator boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, a.email, a.full_name, a.role, u.last_sign_in_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified')
  from public.admin_users a
  left join auth.users u on u.id = a.user_id
  where (select private.admin_role()) is not null
  order by a.created_at;
$$;

create or replace function public.add_admin(p_email text, p_role text, p_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare u uuid;
begin
  if not (select private.is_super_admin()) then raise exception 'Only a super admin can do this'; end if;
  if p_role not in ('super_admin', 'verifier', 'support') then raise exception 'Unknown role'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then
    raise exception 'No sign-in account for this email yet. Create it in Supabase under Authentication, Users first.';
  end if;
  insert into public.admin_users (user_id, email, full_name, role)
  values (u, lower(trim(p_email)), nullif(trim(coalesce(p_name, '')), ''), p_role)
  on conflict (user_id) do update
    set role = excluded.role, full_name = coalesce(excluded.full_name, public.admin_users.full_name);
end $$;

create or replace function public.reset_authenticator(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_super_admin()) then raise exception 'Only a super admin can do this'; end if;
  if p_user = (select auth.uid()) then raise exception 'Ask another super admin to reset your own authenticator'; end if;
  delete from auth.mfa_factors where user_id = p_user;
  delete from auth.sessions where user_id = p_user;
end $$;

revoke all on function public.admin_team() from public, anon;
revoke all on function public.add_admin(text, text, text) from public, anon;
revoke all on function public.reset_authenticator(uuid) from public, anon;
grant execute on function public.admin_team() to authenticated;
grant execute on function public.add_admin(text, text, text) to authenticated;
grant execute on function public.reset_authenticator(uuid) to authenticated;

-- ---------- Dashboard numbers in one call (runs as the admin, so the rules above still apply) ----------
create or replace function public.admin_dashboard(p_days integer default 7)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  needed integer;
  posted integer; with_bid integer; three integer; confirmed integer; delivered integer; ontime integer; cancelled integer;
  median_min double precision;
  gaps jsonb;
begin
  if (select private.admin_role()) is null then raise exception 'Not allowed'; end if;
  select (s.value #>> '{}')::integer into needed from public.settings s where s.key = 'verified_needed';
  needed := coalesce(needed, 3);

  select count(*) into posted from public.requirements where created_at >= since;
  select count(*) into with_bid from public.requirements r
    where r.created_at >= since and exists (select 1 from public.bids b where b.requirement_id = r.id);
  select count(*) into three from public.requirements r
    where r.created_at >= since and (select count(*) from public.bids b where b.requirement_id = r.id) >= 3;
  select count(*) into confirmed from public.bookings where created_at >= since;
  select count(*) into delivered from public.bookings where created_at >= since and delivered_at is not null;
  select count(*) into ontime from public.bookings
    where created_at >= since and delivered_at is not null and delivered_at <= coalesce(due_at, delivered_at);
  select count(*) into cancelled from public.requirements where created_at >= since and status = 'cancelled';

  select percentile_cont(0.5) within group (order by extract(epoch from (fb.t - r.created_at)) / 60)
    into median_min
  from public.requirements r
  join lateral (select min(b.created_at) as t from public.bids b where b.requirement_id = r.id) fb on fb.t is not null
  where r.created_at >= since;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.verified, x.name), '[]'::jsonb) into gaps from (
    select t.name, t.district, t.override,
      (select count(*) from public.providers p where p.town_id = t.id and p.status = 'verified') as verified,
      (select count(*) from public.requirements q where q.town_id = t.id and q.created_at >= since) as requirements
    from public.towns t
    order by 4, t.name
    limit 6
  ) x;

  return jsonb_build_object(
    'needed', needed,
    'open_requirements', (select count(*) from public.requirements where status in ('open', 'widened')),
    'confirmed_bookings', confirmed,
    'token_revenue', coalesce((select sum(token_amount) from public.bookings where token_paid_at >= since), 0),
    'verified_providers', (select count(*) from public.providers where status = 'verified'),
    'posted', posted, 'with_bid', with_bid, 'three_bids', three, 'delivered', delivered, 'ontime', ontime,
    'cancelled', cancelled, 'median_first_bid_min', median_min,
    'pending_providers', (select count(*) from public.providers where status = 'pending'),
    'overdue_disputes', (select count(*) from public.disputes where status <> 'closed' and respond_by < now()),
    'open_flags', (select count(*) from public.safety_flags where status = 'open'),
    'towns_below', (select count(*) from public.towns t where t.override is null
        and (select count(*) from public.providers p where p.town_id = t.id and p.status = 'verified') < needed),
    'no_bid_requirements', (select count(*) from public.requirements r where r.status in ('open', 'widened')
        and not exists (select 1 from public.bids b where b.requirement_id = r.id)),
    'gaps', gaps
  );
end $$;
revoke all on function public.admin_dashboard(integer) from public, anon;
grant execute on function public.admin_dashboard(integer) to authenticated;
