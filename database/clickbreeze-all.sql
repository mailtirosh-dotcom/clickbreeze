-- ClickBreeze: complete database setup (admin sign-in, 2FA rules, data tables, security).
-- Safe to run more than once. Run in: SQL Editor -> New query -> paste all -> Run.
-- Before running, change YOUR_EMAIL_HERE in the last part to the email you created under Authentication -> Users.

-- ===== PART 1: admin access and authenticator (2FA) rule =====
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

-- ===== PART 2: data tables and security =====
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

-- ===== PART 3: customer and photographer apps =====

-- ClickBreeze customer and photographer apps: database functions and privacy rules.
-- Run AFTER setup.sql and schema.sql (clickbreeze-all.sql already includes this file). Safe to run again.
--
-- How the apps talk to the database: app users get NO direct table access. Every action is a function
-- below that checks who is calling. Phone numbers and exact venue positions are only returned after a
-- booking is confirmed, and only to the two people in that booking.

-- ---------- Extra columns and tables ----------
alter table public.providers add column if not exists user_id uuid unique references auth.users (id) on delete set null;
alter table public.providers add column if not exists lat double precision;
alter table public.providers add column if not exists lng double precision;
alter table public.providers add column if not exists radius_km integer not null default 25 check (radius_km between 1 and 500);

create table if not exists public.customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  phone text,
  town_id uuid references public.towns (id),
  created_at timestamptz not null default now()
);

create table if not exists public.blocks (
  customer_id uuid not null references auth.users (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, provider_id)
);

alter table public.requirements add column if not exists customer_id uuid references auth.users (id);
alter table public.requirements add column if not exists notes text;
alter table public.requirements add column if not exists area_name text;
alter table public.requirements add column if not exists venue_lat double precision;
alter table public.requirements add column if not exists venue_lng double precision;
alter table public.requirements add column if not exists approx_lat double precision;
alter table public.requirements add column if not exists approx_lng double precision;
create index if not exists requirements_customer_idx on public.requirements (customer_id);

alter table public.bookings add column if not exists customer_id uuid references auth.users (id);
alter table public.bookings add column if not exists provider_id uuid references public.providers (id);
create unique index if not exists bids_one_per_provider on public.bids (requirement_id, provider_id);

insert into public.settings (key, value) values
  ('token_amount', '300'), ('bid_window_hours', '24'), ('payment_mode', '"test"'), ('delivery_days', '7'), ('login_mode', '"open"')
  on conflict (key) do nothing;

do $$
declare t text;
begin
  foreach t in array array['customers', 'blocks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "admins read" on public.%I', t);
    execute format('create policy "admins read" on public.%I for select to authenticated using ((select private.admin_role()) is not null)', t);
  end loop;
end $$;

-- Towns and categories are not secret: signed-in app users may read them (they pick a town when posting).
drop policy if exists "app users read towns" on public.towns;
create policy "app users read towns" on public.towns for select to authenticated using (true);
drop policy if exists "app users read categories" on public.categories;
create policy "app users read categories" on public.categories for select to authenticated using (true);

-- ---------- Private helpers ----------
create or replace function private.phone_digits()
returns text language sql stable set search_path = '' as $$
  select right(regexp_replace(coalesce((select auth.jwt() ->> 'phone'), ''), '\D', '', 'g'), 10);
$$;

create or replace function private.me_provider()
returns public.providers language sql stable security definer set search_path = '' as $$
  select p.* from public.providers p where p.user_id = (select auth.uid()) limit 1;
$$;

-- A stable "near here" point, up to p_km away, so the real spot stays private.
create or replace function private.approx_point(p_lat double precision, p_lng double precision, p_seed text, p_km double precision default 2)
returns double precision[] language sql immutable set search_path = '' as $$
  with r as (
    select p_km * sqrt((('x' || substr(md5(p_seed), 1, 8))::bit(32)::bigint)::double precision / 4294967296.0) as d,
           2 * pi() * ((('x' || substr(md5(p_seed), 9, 8))::bit(32)::bigint)::double precision / 4294967296.0) as a
  )
  select array[p_lat + (d * cos(a)) / 111.0, p_lng + (d * sin(a)) / (111.0 * greatest(cos(radians(p_lat)), 0.2))] from r;
$$;

create or replace function private.km_between(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable set search_path = '' as $$
  select case when a_lat is null or a_lng is null or b_lat is null or b_lng is null then null else
    12742 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2) +
      cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))) end;
$$;

create or replace function private.setting_int(p_key text, p_default integer)
returns integer language sql stable set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.settings where key = p_key), p_default);
$$;

create or replace function private.expire_requirements()
returns void language sql security definer set search_path = '' as $$
  update public.requirements set status = 'expired'
  where status in ('open', 'widened') and closes_at is not null and closes_at < now();
$$;

-- Does this provider see this requirement? Reach, status, expiry and blocks.
create or replace function private.provider_can_see(p_req public.requirements, p_prov public.providers)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_prov.status = 'verified'
    and p_req.status in ('open', 'widened')
    and (p_req.closes_at is null or p_req.closes_at > now())
    and not exists (select 1 from public.blocks b where b.customer_id = p_req.customer_id and b.provider_id = p_prov.id)
    and (
      p_req.reach = 'state'
      or (p_req.reach = 'district' and (select t1.district from public.towns t1 where t1.id = p_req.town_id)
            = (select t2.district from public.towns t2 where t2.id = p_prov.town_id))
      or (p_req.reach = 'town' and p_req.town_id = p_prov.town_id)
    );
$$;

-- ---------- Shared ----------
create or replace function public.app_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'token_amount', private.setting_int('token_amount', 300),
    'bid_window_hours', private.setting_int('bid_window_hours', 24),
    'payment_mode', coalesce((select value #>> '{}' from public.settings where key = 'payment_mode'), 'test'),
    'login_mode', coalesce((select value #>> '{}' from public.settings where key = 'login_mode'), 'otp'),
    'approx_km', 2);
$$;

-- ---------- Customer ----------
create or replace function public.my_customer()
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) from public.customers c where c.user_id = (select auth.uid());
$$;

drop function if exists public.ensure_customer(text, uuid);
create or replace function public.ensure_customer(p_name text, p_phone text default null, p_town uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare digits text := nullif(private.phone_digits(), '');
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter your name'; end if;
  if digits is null then
    digits := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
    if digits !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a 10-digit mobile number'; end if;
  end if;
  insert into public.customers (user_id, name, phone, town_id)
  values ((select auth.uid()), trim(p_name), digits, p_town)
  on conflict (user_id) do update set name = excluded.name, phone = coalesce(excluded.phone, public.customers.phone),
    town_id = coalesce(excluded.town_id, public.customers.town_id);
  return public.my_customer();
end $$;

create or replace function public.post_requirement(
  p_event_type text, p_event_date date, p_town uuid, p_reach text, p_notes text,
  p_venue_lat double precision, p_venue_lng double precision, p_area text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.customers; ap double precision[]; rid uuid := gen_random_uuid();
begin
  select * into c from public.customers where user_id = (select auth.uid());
  if c.user_id is null then raise exception 'Add your name first'; end if;
  if p_reach not in ('town', 'district', 'state') then raise exception 'Choose town, district or state'; end if;
  if not exists (select 1 from public.towns where id = p_town) then raise exception 'Choose a town or village'; end if;
  if not exists (select 1 from public.categories where name = p_event_type and active) then raise exception 'Choose an event type'; end if;
  if p_event_date is null or p_event_date < current_date then raise exception 'Choose a date that is today or later'; end if;
  if (p_venue_lat is null) <> (p_venue_lng is null) then raise exception 'Venue position is incomplete'; end if;
  if (select count(*) from public.requirements where customer_id = c.user_id and status in ('open', 'widened')) >= 5 then
    raise exception 'You already have 5 open requirements. Cancel one first.';
  end if;
  if p_venue_lat is not null then ap := private.approx_point(p_venue_lat, p_venue_lng, rid::text, 2); end if;
  insert into public.requirements (id, customer_id, customer_name, event_type, event_date, town_id, reach, status, closes_at,
                                   notes, area_name, venue_lat, venue_lng, approx_lat, approx_lng)
  values (rid, c.user_id, c.name, p_event_type, p_event_date, p_town, p_reach, 'open',
          now() + make_interval(hours => private.setting_int('bid_window_hours', 24)),
          nullif(trim(coalesce(p_notes, '')), ''), nullif(trim(coalesce(p_area, '')), ''),
          p_venue_lat, p_venue_lng, ap[1], ap[2]);
  return rid;
end $$;

create or replace function public.my_requirements()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.expire_requirements();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'seq', r.seq, 'event_type', r.event_type, 'event_date', r.event_date, 'reach', r.reach, 'status', r.status,
      'closes_at', r.closes_at, 'town', t.name, 'district', t.district, 'area_name', r.area_name, 'notes', r.notes,
      'venue_lat', r.venue_lat, 'venue_lng', r.venue_lng,
      'bids_count', (select count(*) from public.bids b where b.requirement_id = r.id and b.status in ('active', 'won')
                       and not exists (select 1 from public.blocks k where k.customer_id = r.customer_id and k.provider_id = b.provider_id)),
      'lowest', (select min(b.amount) from public.bids b where b.requirement_id = r.id and b.status in ('active', 'won')
                       and not exists (select 1 from public.blocks k where k.customer_id = r.customer_id and k.provider_id = b.provider_id)),
      'booking_id', (select k.id from public.bookings k where k.requirement_id = r.id and k.status <> 'cancelled' limit 1))
      order by r.created_at desc)
    from public.requirements r left join public.towns t on t.id = r.town_id
    where r.customer_id = (select auth.uid())), '[]'::jsonb);
end $$;

create or replace function public.requirement_bids(p_req uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.requirements where id = p_req and customer_id = (select auth.uid())) then
    raise exception 'Requirement not found';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'bid_id', b.id, 'amount', b.amount, 'package', b.package, 'status', b.status, 'created_at', b.created_at,
      'provider_id', p.id, 'name', coalesce(p.studio_name, p.full_name), 'type', p.type,
      'experience_years', p.experience_years, 'categories', p.categories,
      'approx_lat', case when p.lat is null then null else (private.approx_point(p.lat, p.lng, p.id::text, 2))[1] end,
      'approx_lng', case when p.lat is null then null else (private.approx_point(p.lat, p.lng, p.id::text, 2))[2] end)
      order by b.amount, b.created_at)
    from public.bids b join public.providers p on p.id = b.provider_id
    where b.requirement_id = p_req and b.status in ('active', 'won')
      and not exists (select 1 from public.blocks k where k.customer_id = (select auth.uid()) and k.provider_id = p.id)), '[]'::jsonb);
end $$;

create or replace function public.confirm_bid(p_bid uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.bids; r public.requirements; bid uuid := gen_random_uuid(); tok integer; mode text;
begin
  select * into b from public.bids where id = p_bid for update;
  if b.id is null then raise exception 'Bid not found'; end if;
  select * into r from public.requirements where id = b.requirement_id for update;
  if r.customer_id is distinct from (select auth.uid()) then raise exception 'Bid not found'; end if;
  if r.status not in ('open', 'widened') or (r.closes_at is not null and r.closes_at < now()) then raise exception 'This requirement is no longer open'; end if;
  if b.status <> 'active' then raise exception 'This bid is no longer available'; end if;
  if exists (select 1 from public.blocks where customer_id = r.customer_id and provider_id = b.provider_id) then raise exception 'You blocked this photographer'; end if;
  tok := private.setting_int('token_amount', 300);
  select coalesce(value #>> '{}', 'test') into mode from public.settings where key = 'payment_mode';
  insert into public.bookings (id, requirement_id, bid_id, token_amount, token_paid_at, due_at, status, customer_id, provider_id)
  values (bid, r.id, b.id, tok, case when coalesce(mode, 'test') = 'test' then now() end,
          (r.event_date + make_interval(days => private.setting_int('delivery_days', 7)))::timestamptz, 'confirmed', r.customer_id, b.provider_id);
  update public.bids set status = 'won' where id = b.id;
  update public.bids set status = 'rejected' where requirement_id = r.id and id <> b.id and status = 'active';
  update public.requirements set status = 'confirmed' where id = r.id;
  return bid;
end $$;

create or replace function public.reject_bid(p_bid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.bids set status = 'rejected'
  where id = p_bid and status = 'active'
    and requirement_id in (select id from public.requirements where customer_id = (select auth.uid()) and status in ('open', 'widened'));
  if not found then raise exception 'Bid not found'; end if;
end $$;

create or replace function public.cancel_requirement(p_req uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.requirements set status = 'cancelled'
  where id = p_req and customer_id = (select auth.uid()) and status in ('open', 'widened');
  if not found then raise exception 'Only an open requirement can be cancelled'; end if;
end $$;

create or replace function public.block_provider(p_provider uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (select 1 from public.customers where user_id = (select auth.uid())) then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.providers where id = p_provider) then raise exception 'Photographer not found'; end if;
  insert into public.blocks (customer_id, provider_id) values ((select auth.uid()), p_provider) on conflict do nothing;
  update public.bids set status = 'rejected'
  where provider_id = p_provider and status = 'active'
    and requirement_id in (select id from public.requirements where customer_id = (select auth.uid()) and status in ('open', 'widened'));
end $$;

create or replace function public.unblock_provider(p_provider uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.blocks where customer_id = (select auth.uid()) and provider_id = p_provider;
$$;

create or replace function public.my_blocks()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('provider_id', p.id, 'name', coalesce(p.studio_name, p.full_name)) order by k.created_at desc), '[]'::jsonb)
  from public.blocks k join public.providers p on p.id = k.provider_id where k.customer_id = (select auth.uid());
$$;

-- Customer bookings: the photographer's phone is revealed here because the booking is confirmed.
create or replace function public.customer_bookings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', k.id, 'seq', k.seq, 'status', k.status, 'token_amount', k.token_amount, 'token_paid', k.token_paid_at is not null,
    'due_at', k.due_at, 'delivered_at', k.delivered_at, 'amount', b.amount, 'package', b.package,
    'event_type', r.event_type, 'event_date', r.event_date, 'town', t.name, 'district', t.district, 'area_name', r.area_name,
    'provider_name', coalesce(p.studio_name, p.full_name), 'provider_person', p.full_name, 'provider_mobile', p.mobile,
    'provider_lat', p.lat, 'provider_lng', p.lng, 'provider_address', p.address,
    'venue_lat', r.venue_lat, 'venue_lng', r.venue_lng) order by k.created_at desc), '[]'::jsonb)
  from public.bookings k
  join public.requirements r on r.id = k.requirement_id
  join public.bids b on b.id = k.bid_id
  join public.providers p on p.id = k.provider_id
  left join public.towns t on t.id = r.town_id
  where k.customer_id = (select auth.uid());
$$;

-- ---------- Both sides ----------
create or replace function public.raise_dispute(p_booking uuid, p_type text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k public.bookings; me public.providers; cname text; id uuid := gen_random_uuid(); who text;
begin
  select * into k from public.bookings where bookings.id = p_booking;
  me := private.me_provider();
  if k.id is null or not (k.customer_id = (select auth.uid()) or k.provider_id = me.id) then raise exception 'Booking not found'; end if;
  if length(trim(coalesce(p_type, ''))) < 3 then raise exception 'Choose what went wrong'; end if;
  select name into cname from public.customers where user_id = k.customer_id;
  who := case when k.customer_id = (select auth.uid()) then 'Customer' else 'Photographer' end;
  insert into public.disputes (id, type, booking_id, provider_id, customer_name, respond_by, status, token_amount, timeline)
  values (id, trim(p_type), k.id, k.provider_id, cname, now() + interval '48 hours', 'open', k.token_amount,
          jsonb_build_array(jsonb_build_object('at', now(), 'text', who || ' reported: ' || coalesce(nullif(trim(p_note), ''), trim(p_type)))));
  return id;
end $$;

-- ---------- Photographer ----------
create or replace function public.link_provider()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.providers; digits text := private.phone_digits();
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  select * into p from public.providers where user_id = (select auth.uid());
  if p.id is null then
    if digits = '' then raise exception 'Your sign-in has no phone number'; end if;
    select * into p from public.providers where right(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), 10) = digits
      order by (status = 'verified') desc limit 1;
    if p.id is null then raise exception 'No photographer account found for this mobile number. Ask ClickBreeze to enroll you.'; end if;
    if p.user_id is not null and p.user_id <> (select auth.uid()) then raise exception 'This account is already linked to another sign-in'; end if;
    update public.providers set user_id = (select auth.uid()) where id = p.id;
  end if;
  if p.status <> 'verified' then raise exception 'Your account is %. You can bid after ClickBreeze verifies you.', replace(p.status, '_', ' '); end if;
  return public.my_provider();
end $$;

-- TEMPORARY open mode: a photographer links to the enrolled mobile number without an SMS code.
-- Works only while settings.login_mode = "open". Anyone who knows an enrolled number could claim it,
-- so switch login_mode to "otp" (and set up SMS) before real use.
create or replace function public.link_provider_open(p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.providers; digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  if coalesce((select value #>> '{}' from public.settings where key = 'login_mode'), 'otp') <> 'open' then
    raise exception 'Open mode is switched off. Sign in with the SMS code.';
  end if;
  if digits !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a 10-digit mobile number'; end if;
  select * into p from public.providers where right(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), 10) = digits
    order by (status = 'verified') desc limit 1;
  if p.id is null then raise exception 'No photographer account found for this mobile number. Ask ClickBreeze to enroll you.'; end if;
  if p.status <> 'verified' then raise exception 'Your account is %. You can bid after ClickBreeze verifies you.', replace(p.status, '_', ' '); end if;
  update public.providers set user_id = (select auth.uid()) where id = p.id;
  return public.my_provider();
end $$;

create or replace function public.my_provider()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'name', coalesce(p.studio_name, p.full_name), 'person', p.full_name, 'type', p.type,
    'status', p.status, 'town', t.name, 'district', t.district, 'lat', p.lat, 'lng', p.lng, 'radius_km', p.radius_km, 'address', p.address)
  from public.providers p left join public.towns t on t.id = p.town_id where p.user_id = (select auth.uid());
$$;

create or replace function public.set_provider_location(p_lat double precision, p_lng double precision, p_radius integer, p_address text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_lat not between 8 and 13.6 or p_lng not between 76 and 80.5 then raise exception 'Place the pin inside Tamil Nadu'; end if;
  update public.providers set lat = p_lat, lng = p_lng, radius_km = greatest(1, least(coalesce(p_radius, 25), 500)),
    address = coalesce(nullif(trim(coalesce(p_address, '')), ''), address)
  where user_id = (select auth.uid()) and status = 'verified';
  if not found then raise exception 'Verified photographer account needed'; end if;
end $$;

create or replace function public.provider_feed()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.providers;
begin
  me := private.me_provider();
  if me.id is null or me.status <> 'verified' then raise exception 'Verified photographer account needed'; end if;
  perform private.expire_requirements();
  return coalesce((
    select jsonb_agg(x order by (x ->> 'closes_at'))
    from (
      select jsonb_build_object(
        'id', r.id, 'seq', r.seq, 'event_type', r.event_type, 'event_date', r.event_date, 'reach', r.reach,
        'town', t.name, 'district', t.district, 'area_name', r.area_name, 'closes_at', r.closes_at,
        'approx_lat', r.approx_lat, 'approx_lng', r.approx_lng,
        'distance_km', round(private.km_between(me.lat, me.lng, r.approx_lat, r.approx_lng)::numeric, 1),
        'bids_count', (select count(*) from public.bids b where b.requirement_id = r.id and b.status in ('active', 'won')),
        'lowest', (select min(b.amount) from public.bids b where b.requirement_id = r.id and b.status in ('active', 'won')),
        'my_bid', (select b.amount from public.bids b where b.requirement_id = r.id and b.provider_id = me.id and b.status = 'active')) as x
      from public.requirements r left join public.towns t on t.id = r.town_id
      where private.provider_can_see(r, me)
    ) s), '[]'::jsonb);
end $$;

create or replace function public.place_bid(p_req uuid, p_amount integer, p_package text)
returns void language plpgsql security definer set search_path = '' as $$
declare me public.providers; r public.requirements; old public.bids;
begin
  me := private.me_provider();
  if me.id is null or me.status <> 'verified' then raise exception 'Verified photographer account needed'; end if;
  if p_amount is null or p_amount < 100 or p_amount > 10000000 then raise exception 'Enter an amount of at least 100'; end if;
  select * into r from public.requirements where id = p_req for update;
  if r.id is null or not private.provider_can_see(r, me) then raise exception 'This requirement is not open for you'; end if;
  select * into old from public.bids where requirement_id = p_req and provider_id = me.id;
  if old.id is null then
    insert into public.bids (requirement_id, provider_id, amount, package, status) values (p_req, me.id, p_amount, nullif(trim(coalesce(p_package, '')), ''), 'active');
  elsif old.status = 'active' then
    if p_amount >= old.amount then raise exception 'You can only lower your bid. Your bid is %.', old.amount; end if;
    update public.bids set amount = p_amount, package = coalesce(nullif(trim(coalesce(p_package, '')), ''), package) where id = old.id;
  elsif old.status = 'withdrawn' then
    update public.bids set amount = p_amount, status = 'active', package = nullif(trim(coalesce(p_package, '')), '') where id = old.id;
  else
    raise exception 'Your bid on this requirement is closed';
  end if;
end $$;

create or replace function public.withdraw_bid(p_bid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.bids set status = 'withdrawn'
  where id = p_bid and status = 'active' and provider_id = (private.me_provider()).id;
  if not found then raise exception 'Bid not found'; end if;
end $$;

create or replace function public.my_bids()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.providers;
begin
  me := private.me_provider();
  if me.id is null then raise exception 'Verified photographer account needed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'bid_id', b.id, 'amount', b.amount, 'package', b.package, 'status', b.status, 'created_at', b.created_at,
      'req_status', r.status, 'event_type', r.event_type, 'event_date', r.event_date, 'town', t.name, 'area_name', r.area_name,
      'closes_at', r.closes_at,
      'lowest', (select min(x.amount) from public.bids x where x.requirement_id = r.id and x.status in ('active', 'won'))) order by b.created_at desc)
    from public.bids b join public.requirements r on r.id = b.requirement_id left join public.towns t on t.id = r.town_id
    where b.provider_id = me.id), '[]'::jsonb);
end $$;

-- Photographer bookings: the customer's phone and the exact venue are revealed here because the booking is confirmed.
create or replace function public.provider_bookings()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.providers;
begin
  me := private.me_provider();
  if me.id is null then raise exception 'Verified photographer account needed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', k.id, 'seq', k.seq, 'status', k.status, 'token_amount', k.token_amount, 'due_at', k.due_at, 'delivered_at', k.delivered_at,
      'amount', b.amount, 'package', b.package, 'event_type', r.event_type, 'event_date', r.event_date,
      'town', t.name, 'district', t.district, 'area_name', r.area_name, 'notes', r.notes,
      'customer_name', c.name, 'customer_phone', c.phone, 'venue_lat', r.venue_lat, 'venue_lng', r.venue_lng) order by r.event_date)
    from public.bookings k
    join public.requirements r on r.id = k.requirement_id
    join public.bids b on b.id = k.bid_id
    join public.customers c on c.user_id = k.customer_id
    left join public.towns t on t.id = r.town_id
    where k.provider_id = me.id), '[]'::jsonb);
end $$;

create or replace function public.mark_delivered(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.bookings set delivered_at = now(), status = 'delivered'
  where id = p_booking and provider_id = (private.me_provider()).id and status = 'confirmed';
  if not found then raise exception 'Booking not found'; end if;
end $$;

-- ---------- Permissions: only signed-in users may call these ----------
do $$
declare f text;
begin
  foreach f in array array[
    'app_config()', 'my_customer()', 'ensure_customer(text,text,uuid)',
    'post_requirement(text,date,uuid,text,text,double precision,double precision,text)', 'my_requirements()',
    'requirement_bids(uuid)', 'confirm_bid(uuid)', 'reject_bid(uuid)', 'cancel_requirement(uuid)', 'block_provider(uuid)',
    'unblock_provider(uuid)', 'my_blocks()', 'customer_bookings()', 'raise_dispute(uuid,text,text)',
    'link_provider()', 'link_provider_open(text)', 'my_provider()', 'set_provider_location(double precision,double precision,integer,text)',
    'provider_feed()', 'place_bid(uuid,integer,text)', 'withdraw_bid(uuid)', 'my_bids()', 'provider_bookings()', 'mark_delivered(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ===== PART 4: first super admin =====
-- Run AFTER setup.sql and AFTER you created your user in
-- Authentication -> Users -> Add user (tick "Auto Confirm User").
-- Replace the email below with the email you used, then Run.

insert into public.admin_users (user_id, email, full_name, role)
select id, email, 'Owner', 'super_admin'
from auth.users
where email = 'YOUR_EMAIL_HERE'
on conflict (user_id) do nothing;

-- Check: this should return one row with role super_admin.
select email, role from public.admin_users;
