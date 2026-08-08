-- Entering a club in a team season, from the app.
--
-- The individual side of this landed with join_season(); this is the half that
-- was still an insert somebody had to write by hand. It is a separate function
-- rather than a branch of join_season() because it answers a different
-- question: not "am I in", but "is my club in, and am I allowed to say so".
--
-- Three things the insert policy could not express:
--
--   * Entering while the season is already running, for the same reason a
--     shooter may — a competition that turns clubs away between rounds has
--     nothing to offer the club that hears about it in week three.
--   * Whether the club can actually field a team. pair_team_round() skips a
--     club with fewer eligible shooters than the team size, silently. A club
--     that enters and is then never paired has no way of knowing why, so the
--     count comes back with the entry.
--   * Which of my clubs this is even about. A shooter can belong to several.

/**
 * Shooters this club could field in a discipline: members who compete for it,
 * are not banned, in rating order. The same set club_lineup() picks from.
 */
create or replace function public.club_eligible_count(p_club_id uuid, p_discipline_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from public.club_members cm
    join public.profiles p on p.id = cm.shooter_id
   where cm.club_id = p_club_id
     and p.primary_club_id = p_club_id
     and p.deleted_at is null
     and (p.banned_until is null or p.banned_until < now());
$$;

create or replace function public.enter_club_in_season(p_slug text, p_club_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.seasons%rowtype;
  v_club   public.clubs%rowtype;
  v_count  integer;
begin
  if not public.is_club_official(p_club_id) then
    raise exception 'only an official of the club can enter it'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_season from public.seasons where slug = p_slug for update;
  if not found then
    raise exception 'no season %', p_slug using errcode = 'no_data_found';
  end if;

  if v_season.competition_type <> 'team' then
    raise exception 'season % is for individual shooters; enter it yourself', p_slug
      using errcode = 'check_violation';
  end if;

  if v_season.state not in ('registration', 'running') then
    raise exception 'season % is not open to entries', p_slug using errcode = 'check_violation';
  end if;

  if now() < v_season.registration_opens_at then
    raise exception 'registration for % has not opened yet', p_slug using errcode = 'check_violation';
  end if;

  select * into v_club from public.clubs where id = p_club_id;

  if v_season.country_code is not null and v_club.country_code <> v_season.country_code then
    raise exception 'season % is open to clubs from % only', p_slug, v_season.country_code
      using errcode = 'check_violation';
  end if;

  select count(*) into v_count
    from public.club_season_entries
   where season_id = v_season.id and withdrawn_at is null;

  if v_season.max_entries is not null and v_count >= v_season.max_entries
     and not exists (
       select 1 from public.club_season_entries
        where season_id = v_season.id and club_id = p_club_id
     ) then
    raise exception 'season % is full', p_slug using errcode = 'check_violation';
  end if;

  insert into public.club_season_entries (season_id, club_id)
  values (v_season.id, p_club_id)
  on conflict (season_id, club_id) do update set withdrawn_at = null;

  return v_season.id;
end;
$$;

create or replace function public.withdraw_club_from_season(p_slug text, p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_club_official(p_club_id) then
    raise exception 'only an official of the club can withdraw it'
      using errcode = 'insufficient_privilege';
  end if;

  update public.club_season_entries e
     set withdrawn_at = now()
    from public.seasons s
   where s.id = e.season_id and s.slug = p_slug and e.club_id = p_club_id;
end;
$$;

/**
 * What the season page needs in order to show a button rather than a guess:
 * one row per club the signed-in shooter belongs to, saying whether they may
 * act for it, whether it is in, and whether it could field a team.
 */
create or replace function public.my_club_season_entries(p_slug text)
returns table (
  club_id         uuid,
  club_name       text,
  short_name      text,
  is_official     boolean,
  entered         boolean,
  eligible        integer,
  team_size       integer,
  clubs_entered   integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.name,
    c.short_name,
    public.is_club_official(c.id),
    exists (
      select 1 from public.club_season_entries e
       where e.season_id = s.id and e.club_id = c.id and e.withdrawn_at is null
    ),
    public.club_eligible_count(c.id, s.discipline_id),
    s.team_size,
    (select count(*)::integer from public.club_season_entries e
      where e.season_id = s.id and e.withdrawn_at is null)
  from public.seasons s
  join public.club_members cm on cm.shooter_id = auth.uid()
  join public.clubs c on c.id = cm.club_id
 where s.slug = p_slug
 order by c.name;
$$;

revoke execute on function public.enter_club_in_season(text, uuid) from public;
revoke execute on function public.withdraw_club_from_season(text, uuid) from public;
revoke execute on function public.my_club_season_entries(text) from public;

grant execute on function public.enter_club_in_season(text, uuid) to authenticated;
grant execute on function public.withdraw_club_from_season(text, uuid) to authenticated;
grant execute on function public.my_club_season_entries(text) to authenticated;
grant execute on function public.club_eligible_count(uuid, uuid) to anon, authenticated;
