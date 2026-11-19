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
