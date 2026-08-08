-- What has to exist before real people have accounts.
--
-- Three things, none of them features:
--
--   1. An age gate. A large share of ISSF shooters are juniors, and a junior's
--      account needs guardian consent, restraint on photographs and a public
--      profile that says less. None of that is built, so for now the honest
--      thing is to keep minors out rather than to handle them badly.
--   2. Recorded consent. Who accepted which version of the terms, and when.
--   3. A deletion path that does not need an operator with a database console.
--
-- The date of birth is not only for the gate: age categories are a real part of
-- this sport, and a junior class is one of the first things a season needs. It
-- is stored as a date rather than a checkbox for that reason.

alter table public.profiles
  add column date_of_birth      date,
  add column terms_accepted_at  timestamptz,
  add column terms_version      text,
  add column deleted_at         timestamptz;

comment on column public.profiles.deleted_at is
  'Set when the shooter asked to be deleted. The row survives because matches '
  'they shot are other people''s history too, but it carries no name after this.';

-- The version string is what makes consent re-askable: bump it in the client
-- and everyone accepts again.
create or replace function public.current_terms_version()
returns text
language sql
immutable
as $$
  select '2026-08-01';
$$;

/**
 * Old enough to hold an account on their own, on the day they sign up.
 */
create or replace function public.is_adult(p_dob date, p_on date default current_date)
returns boolean
language sql
immutable
as $$
  select p_dob is not null and p_dob <= (p_on - interval '18 years')::date;
$$;

-- Signup, with the two new fields. A signup without a usable date of birth is
-- refused outright: an account that exists but cannot be attributed to an adult
-- is worse than one that was never created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handle citext;
  v_dob    date;
begin
  v_handle := lower(coalesce(
    new.raw_user_meta_data ->> 'handle',
    'shooter_' || substr(replace(new.id::text, '-', ''), 1, 10)
  ));

  begin
    v_dob := (new.raw_user_meta_data ->> 'date_of_birth')::date;
  exception when others then
    v_dob := null;
  end;

  if not public.is_adult(v_dob) then
    raise exception 'this beta is open to shooters of 18 and over'
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (
    id, handle, display_name, country_code,
    date_of_birth, terms_accepted_at, terms_version
  )
  values (
    new.id,
    v_handle,
    coalesce(new.raw_user_meta_data ->> 'display_name', v_handle::text),
    upper(coalesce(new.raw_user_meta_data ->> 'country_code', 'DE')),
    v_dob,
    now(),
    public.current_terms_version()
  );

  return new;
end;
$$;

-- ------------------------------------------------------------- deletion ----

-- What a deletion still needs a human for: the auth row and the photographs in
-- storage. The queue is what the operator works from, and it exists so that
-- "delete my account" is something the shooter can do at 11pm on a Sunday
-- rather than something they have to ask for by email.
create table public.deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  shooter_id   uuid not null references public.profiles (id) on delete cascade,
  reason       text check (char_length(reason) <= 1000),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (shooter_id)
);

alter table public.deletion_requests enable row level security;
grant select on public.deletion_requests to authenticated;

create policy read_own_deletion_request on public.deletion_requests
  for select to authenticated
  using (shooter_id = auth.uid() or public.is_admin());

/**
 * Deleting an account, as far as it can go without erasing other people's
 * history.
 *
 * The name, the handle, the bio, the equipment and the date of birth go
 * immediately, which is the part that matters: what is left is a row that says
 * somebody shot 103.7 in a match, attributable to nobody. The results
 * themselves stay, because a match is two shooters' record and a season table
 * that silently loses rows is a false table.
 *
 * Push tokens are dropped in the same breath. The auth row and the target
 * photos are queued for an operator, because neither can be reached from here.
 */
create or replace function public.request_account_deletion(p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shooter uuid := auth.uid();
begin
  if v_shooter is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
     set display_name  = 'Former shooter',
         handle        = 'deleted_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
         bio           = null,
         equipment     = '{}'::jsonb,
         avatar_path   = null,
         date_of_birth = null,
         is_public     = false,
         notify_push   = false,
         deleted_at    = now()
   where id = v_shooter;

  delete from public.device_tokens where shooter_id = v_shooter;

  -- Out of every season that has not been shot yet, so the pairing does not
  -- draw somebody an opponent who is gone.
  update public.season_entries
     set withdrawn_at = coalesce(withdrawn_at, now())
   where shooter_id = v_shooter;

  insert into public.deletion_requests (shooter_id, reason)
  values (v_shooter, p_reason)
  on conflict (shooter_id) do update set reason = excluded.reason, requested_at = now();
end;
$$;

revoke execute on function public.request_account_deletion(text) from public;
grant execute on function public.request_account_deletion(text) to authenticated;

/**
 * Everything the account holds, in one object, for the export a data subject
 * may ask for. Kept as a function rather than a view because it is one row for
 * one person and should never be listable.
 */
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (
      select to_jsonb(p) - 'id' from public.profiles p where p.id = auth.uid()
    ),
    'clubs', (
      select coalesce(jsonb_agg(jsonb_build_object('club', c.name, 'role', cm.role)), '[]'::jsonb)
        from public.club_members cm join public.clubs c on c.id = cm.club_id
       where cm.shooter_id = auth.uid()
    ),
    'seasons', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'season', s.name, 'joined_at', e.joined_at, 'withdrawn_at', e.withdrawn_at)), '[]'::jsonb)
        from public.season_entries e join public.seasons s on s.id = e.season_id
       where e.shooter_id = auth.uid()
    ),
    'submissions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'total', sub.total, 'inner_tens', sub.inner_tens,
               'shot_at', sub.shot_at, 'submitted_at', sub.submitted_at,
               'photo', sub.photo_path)), '[]'::jsonb)
        from public.submissions sub where sub.shooter_id = auth.uid()
    ),
    'ratings', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'discipline', d.code, 'rating', r.rating, 'rd', r.rd,
               'matches_played', r.matches_played)), '[]'::jsonb)
        from public.ratings r join public.disciplines d on d.id = r.discipline_id
       where r.shooter_id = auth.uid()
    )
  );
$$;

revoke execute on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;

-- A deleted account keeps its results but stops appearing as a person. The
-- public views join profiles, so this is where the name they carry comes from.
create or replace function public.public_display_name(p_profile public.profiles)
returns text
language sql
immutable
as $$
  select case when p_profile.deleted_at is null then p_profile.display_name
              else 'Former shooter' end;
$$;
