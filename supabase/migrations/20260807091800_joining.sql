-- Joining a season from inside the app.
--
-- Until now entrants were inserted into season_entries by hand, which is fine
-- for a demo and impossible for a beta: somebody would be running SQL every
-- time a shooter showed up.
--
-- Two things the insert policy could not express on its own:
--
--   * Joining while a season is already running. The policy allows
--     registration only, which is right for a table that has to stay
--     comparable — but a ladder that turns people away between rounds has no
--     answer for the shooter who hears about it in week three. Late entrants
--     are paired from the next round; the rounds they missed are simply rounds
--     they did not play.
--   * The seed rating. It is the rating at the moment of joining, and a client
--     that computed it could get it wrong or lie about it.

create or replace function public.join_season(p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season  public.seasons%rowtype;
  v_shooter uuid := auth.uid();
  v_count   integer;
  v_rating  numeric(6, 2);
begin
  if v_shooter is null then
    raise exception 'sign in to join a season' using errcode = 'insufficient_privilege';
  end if;

  select * into v_season from public.seasons where slug = p_slug for update;

  if not found then
    raise exception 'no season %', p_slug using errcode = 'no_data_found';
  end if;

  if v_season.state not in ('registration', 'running') then
    raise exception 'season % is not open to entries', p_slug using errcode = 'check_violation';
  end if;

  if now() < v_season.registration_opens_at then
    raise exception 'registration for % has not opened yet', p_slug using errcode = 'check_violation';
  end if;

  -- A club season is entered by the club, not by its members one at a time.
  if v_season.competition_type = 'team' then
    raise exception 'season % is a club competition; a club official enters the club', p_slug
      using errcode = 'check_violation';
  end if;

  if v_season.country_code is not null and not exists (
    select 1 from public.profiles
     where id = v_shooter and country_code = v_season.country_code
  ) then
    raise exception 'season % is open to shooters from % only', p_slug, v_season.country_code
      using errcode = 'check_violation';
  end if;

  select count(*) into v_count
    from public.season_entries
   where season_id = v_season.id and withdrawn_at is null;

  if v_season.max_entries is not null and v_count >= v_season.max_entries
     and not exists (
       select 1 from public.season_entries
        where season_id = v_season.id and shooter_id = v_shooter
     ) then
    raise exception 'season % is full', p_slug using errcode = 'check_violation';
  end if;

  select r.rating into v_rating
    from public.ratings r
   where r.shooter_id = v_shooter and r.discipline_id = v_season.discipline_id;

  insert into public.season_entries (season_id, shooter_id, seed_rating)
  values (v_season.id, v_shooter, v_rating)
  on conflict (season_id, shooter_id) do update
    set withdrawn_at = null,
        -- Rejoining after withdrawing reseeds; the old seed described a
        -- shooter who left.
        seed_rating  = coalesce(excluded.seed_rating, public.season_entries.seed_rating);

  return v_season.id;
end;
$$;

-- Leaving. The row stays so results already shot keep their context, and a
-- withdrawn entry is skipped by the pairing.
create or replace function public.leave_season(p_slug text)
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

  update public.season_entries e
     set withdrawn_at = now()
    from public.seasons s
   where s.id = e.season_id and s.slug = p_slug and e.shooter_id = v_shooter;
end;
$$;

revoke execute on function public.join_season(text) from public;
revoke execute on function public.leave_season(text) from public;
grant execute on function public.join_season(text) to authenticated;
grant execute on function public.leave_season(text) to authenticated;

-- Whether the signed-in shooter is in a season, for the button on the season
-- page. Reading season_entries directly would work; this keeps the client from
-- having to know that a withdrawn row still exists.
create or replace function public.my_season_entry(p_slug text)
returns table (joined boolean, joined_at timestamptz, entrants integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.season_entries e
        join public.seasons s on s.id = e.season_id
       where s.slug = p_slug and e.shooter_id = auth.uid() and e.withdrawn_at is null
    ),
    (select e.joined_at from public.season_entries e
       join public.seasons s on s.id = e.season_id
      where s.slug = p_slug and e.shooter_id = auth.uid()),
    (select count(*)::integer from public.season_entries e
       join public.seasons s on s.id = e.season_id
      where s.slug = p_slug and e.withdrawn_at is null);
$$;

grant execute on function public.my_season_entry(text) to anon, authenticated;
