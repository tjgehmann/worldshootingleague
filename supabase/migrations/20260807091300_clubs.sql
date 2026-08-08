-- Clubs.
--
-- Shooting is already organised in clubs, which makes a club the unit that can
-- bring twenty people in at once instead of one at a time. That is the whole
-- point of this table: it is the answer to the cold start, not decoration on a
-- profile.
--
-- A shooter can belong to several clubs but shoots for one — primary_club_id
-- decides eligibility for a team match.

create type public.club_role as enum ('member', 'official', 'owner');

create table public.clubs (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  name         text not null check (char_length(name) between 2 and 80),
  short_name   text check (char_length(short_name) between 2 and 12),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  city         text,
  crest_path   text,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index clubs_country_idx on public.clubs (country_code);

create trigger clubs_set_updated_at
  before update on public.clubs
  for each row execute function public.set_updated_at();

create table public.club_members (
  club_id    uuid not null references public.clubs (id) on delete cascade,
  shooter_id uuid not null references public.profiles (id) on delete cascade,
  role       public.club_role not null default 'member',
  joined_at  timestamptz not null default now(),

  primary key (club_id, shooter_id)
);

create index club_members_shooter_idx on public.club_members (shooter_id);
-- Every club needs someone who can act for it.
create index club_members_officials_idx on public.club_members (club_id)
  where role in ('official', 'owner');

-- The club a shooter competes for. Free-text club names are gone; a team match
-- has to resolve to a real row.
alter table public.profiles drop column club;
alter table public.profiles add column primary_club_id uuid references public.clubs (id);

create index profiles_club_idx on public.profiles (primary_club_id);

-- Column grants were fixed in the RLS migration and have to follow the change.
revoke update on public.profiles from authenticated;
grant update (display_name, country_code, avatar_path, bio, equipment, is_public,
              handle, primary_club_id)
  on public.profiles to authenticated;

-- Joining by link: a club official shares a code, members redeem it. Cheaper
-- than an approval queue and good enough while clubs are small and local.
create table public.club_invites (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs (id) on delete cascade,
  code       text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  created_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  max_uses   integer check (max_uses > 0),
  uses       integer not null default 0,
  created_at timestamptz not null default now()
);

create index club_invites_club_idx on public.club_invites (club_id);

create or replace function public.is_club_official(p_club_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.club_members
     where club_id = p_club_id and shooter_id = p_uid and role in ('official', 'owner')
  );
$$;

-- Redeeming an invite is the only way a shooter joins a club from the app, so
-- the checks live server-side rather than in an RLS policy on club_members.
create or replace function public.redeem_club_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.club_invites%rowtype;
  v_uid    uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into v_invite from public.club_invites where code = upper(p_code) for update;

  if not found then
    raise exception 'unknown invite code' using errcode = 'no_data_found';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'invite expired' using errcode = 'check_violation';
  end if;
  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'invite already used up' using errcode = 'check_violation';
  end if;

  insert into public.club_members (club_id, shooter_id)
  values (v_invite.club_id, v_uid)
  on conflict (club_id, shooter_id) do nothing;

  update public.club_invites set uses = uses + 1 where id = v_invite.id;

  -- First club joined becomes the one they shoot for.
  update public.profiles
     set primary_club_id = coalesce(primary_club_id, v_invite.club_id)
   where id = v_uid;

  return v_invite.club_id;
end;
$$;

-- Creating a club makes the creator its owner; otherwise a club could exist
-- with nobody able to act for it.
create or replace function public.create_club(
  p_name text,
  p_slug text,
  p_country_code char(2),
  p_short_name text default null,
  p_city text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  insert into public.clubs (slug, name, short_name, country_code, city, created_by)
  values (lower(p_slug), p_name, p_short_name, upper(p_country_code), p_city, v_uid)
  returning id into v_id;

  insert into public.club_members (club_id, shooter_id, role)
  values (v_id, v_uid, 'owner');

  update public.profiles set primary_club_id = coalesce(primary_club_id, v_id) where id = v_uid;

  return v_id;
end;
$$;

-- ------------------------------------------------------------------- RLS ----

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_invites enable row level security;

grant select on public.clubs, public.club_members to anon, authenticated;
grant select on public.club_invites to authenticated;
grant insert on public.club_invites to authenticated;
grant update (role) on public.club_members to authenticated;
grant delete on public.club_members to authenticated;
grant update (name, short_name, city, crest_path) on public.clubs to authenticated;

create policy read_clubs on public.clubs for select using (true);
create policy read_club_members on public.club_members for select using (true);

create policy update_own_club on public.clubs
  for update to authenticated
  using (public.is_club_official(id)) with check (public.is_club_official(id));

-- Membership is created by redeem_club_invite() only; officials may change a
-- role or remove someone, and anyone may remove themselves.
create policy manage_membership on public.club_members
  for update to authenticated
  using (public.is_club_official(club_id)) with check (public.is_club_official(club_id));

create policy leave_or_remove_membership on public.club_members
  for delete to authenticated
  using (shooter_id = auth.uid() or public.is_club_official(club_id));

create policy read_own_club_invites on public.club_invites
  for select to authenticated
  using (public.is_club_official(club_id));

create policy create_club_invite on public.club_invites
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_club_official(club_id));
