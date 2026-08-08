-- Club against club.
--
-- A team match is a container of ordinary individual matches, one per lineup
-- position. Nothing about the blind reveal, submissions or settlement changes:
-- board 2 is a normal match between two shooters, rated as one. Only the
-- aggregation on top is new.
--
-- That shape is deliberate. German league shooting already pairs position
-- against position, so it is the format the audience knows, and reusing the
-- individual machinery means there is exactly one code path to get right.

create type public.competition_type as enum ('individual', 'team');

alter table public.seasons
  add column competition_type public.competition_type not null default 'individual',
  add column team_size integer check (team_size between 2 and 8);

alter table public.seasons
  add constraint seasons_team_size_present
  check ((competition_type = 'team') = (team_size is not null));

-- Which clubs are in a team season. Individual seasons keep using
-- season_entries; the two do not mix.
create table public.club_season_entries (
  season_id    uuid not null references public.seasons (id) on delete cascade,
  club_id      uuid not null references public.clubs (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  withdrawn_at timestamptz,

  primary key (season_id, club_id)
);

create index club_season_entries_club_idx on public.club_season_entries (club_id);

create table public.team_matches (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.rounds (id) on delete cascade,
  season_id     uuid not null references public.seasons (id) on delete cascade,
  discipline_id uuid not null references public.disciplines (id),
  club_a        uuid not null references public.clubs (id),
  club_b        uuid not null references public.clubs (id),
  state         public.match_state not null default 'scheduled',
  opens_at      timestamptz not null,
  closes_at     timestamptz not null,

  -- Board points: one per board won, split on a drawn board.
  points_a      numeric(4, 1) not null default 0,
  points_b      numeric(4, 1) not null default 0,
  winner_club_id uuid references public.clubs (id),
  decided_by    public.decided_by,
  settled_at    timestamptz,
  finalized_at  timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint team_matches_distinct_clubs check (club_a <> club_b),
  constraint team_matches_winner_is_participant
    check (winner_club_id is null or winner_club_id in (club_a, club_b))
);

create index team_matches_round_idx on public.team_matches (round_id);
create index team_matches_club_a_idx on public.team_matches (club_a, state);
create index team_matches_club_b_idx on public.team_matches (club_b, state);

create unique index team_matches_unique_pairing_per_round
  on public.team_matches (round_id, least(club_a::text, club_b::text), greatest(club_a::text, club_b::text));

create trigger team_matches_set_updated_at
  before update on public.team_matches
  for each row execute function public.set_updated_at();

-- A board match points back at its team match. shooter_a always represents
-- club_a and shooter_b club_b, which is what lets the aggregation work without
-- a separate lineup table.
alter table public.matches
  add column team_match_id uuid references public.team_matches (id) on delete cascade,
  add column board integer check (board > 0);

alter table public.matches
  add constraint matches_board_with_team check ((team_match_id is null) = (board is null));

create index matches_team_idx on public.matches (team_match_id) where team_match_id is not null;
create unique index matches_unique_board on public.matches (team_match_id, board)
  where team_match_id is not null;

-- The N strongest members a club can field in a discipline. No manual lineup
-- yet: an official picking boards is a later refinement, and picking by rating
-- is both defensible and automatic.
create or replace function public.club_lineup(
  p_club_id      uuid,
  p_discipline_id uuid,
  p_size         integer
)
returns table (board integer, shooter_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select row_number() over (
           order by coalesce(r.rating, 1500) desc, p.handle
         )::integer,
         p.id
    from public.club_members cm
    join public.profiles p on p.id = cm.shooter_id
    left join public.ratings r
      on r.shooter_id = p.id and r.discipline_id = p_discipline_id
   where cm.club_id = p_club_id
     and p.primary_club_id = p_club_id
     and (p.banned_until is null or p.banned_until < now())
   order by coalesce(r.rating, 1500) desc, p.handle
   limit greatest(p_size, 1);
$$;

-- Swiss over clubs, same idea as pair_round: sort by strength, pair neighbours,
-- skip a pairing that already happened this season.
create or replace function public.pair_team_round(p_round_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round   public.rounds%rowtype;
  v_season  public.seasons%rowtype;
  v_field   uuid[];
  v_taken   boolean[];
  v_i       integer;
  v_j       integer;
  v_a       uuid;
  v_b       uuid;
  v_team_id uuid;
  v_lineup_a record;
  v_lineup_b record;
  v_created integer := 0;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if not found then
    raise exception 'unknown round %', p_round_id;
  end if;
  if v_round.paired_at is not null then
    return 0;
  end if;

  select * into v_season from public.seasons where id = v_round.season_id;
  if v_season.competition_type <> 'team' then
    raise exception 'season % is not a team competition', v_season.id;
  end if;

  -- Only clubs that can actually field a full lineup.
  select array_agg(c.club_id order by c.strength desc, c.club_id)
    into v_field
    from (
      select e.club_id,
             (select avg(coalesce(r.rating, 1500))
                from public.club_lineup(e.club_id, v_season.discipline_id, v_season.team_size) l
                left join public.ratings r
                  on r.shooter_id = l.shooter_id and r.discipline_id = v_season.discipline_id
             ) as strength
        from public.club_season_entries e
       where e.season_id = v_season.id
         and e.withdrawn_at is null
         and (select count(*)
                from public.club_lineup(e.club_id, v_season.discipline_id, v_season.team_size)
             ) >= v_season.team_size
    ) c;

  if v_field is null or array_length(v_field, 1) < 2 then
    update public.rounds set paired_at = now() where id = p_round_id;
    return 0;
  end if;

  v_taken := array_fill(false, array[array_length(v_field, 1)]);

  for v_i in 1 .. array_length(v_field, 1) loop
    continue when v_taken[v_i];
    v_a := v_field[v_i];
    v_b := null;

    for v_j in v_i + 1 .. array_length(v_field, 1) loop
      continue when v_taken[v_j];

      if not exists (
        select 1 from public.team_matches tm
         where tm.season_id = v_season.id
           and ((tm.club_a = v_a and tm.club_b = v_field[v_j])
             or (tm.club_a = v_field[v_j] and tm.club_b = v_a))
      ) then
        v_b := v_field[v_j];
        v_taken[v_j] := true;
        exit;
      end if;
    end loop;

    if v_b is null then
      continue;  -- bye this round
    end if;
    v_taken[v_i] := true;

    insert into public.team_matches (
      round_id, season_id, discipline_id, club_a, club_b, state, opens_at, closes_at
    )
    values (
      p_round_id, v_season.id, v_season.discipline_id, v_a, v_b,
      case when now() >= v_round.opens_at then 'live' else 'scheduled' end::public.match_state,
      v_round.opens_at, v_round.closes_at
    )
    returning id into v_team_id;

    -- Board n of club A meets board n of club B.
    for v_lineup_a in
      select * from public.club_lineup(v_a, v_season.discipline_id, v_season.team_size)
    loop
      select * into v_lineup_b
        from public.club_lineup(v_b, v_season.discipline_id, v_season.team_size)
       where board = v_lineup_a.board;

      insert into public.matches (
        round_id, season_id, discipline_id, format_id, shooter_a, shooter_b,
        state, opens_at, closes_at, team_match_id, board
      )
      values (
        p_round_id, v_season.id, v_season.discipline_id, v_season.format_id,
        v_lineup_a.shooter_id, v_lineup_b.shooter_id,
        case when now() >= v_round.opens_at then 'live' else 'scheduled' end::public.match_state,
        v_round.opens_at, v_round.closes_at, v_team_id, v_lineup_a.board
      );
    end loop;

    v_created := v_created + 1;
  end loop;

  update public.rounds set paired_at = now() where id = p_round_id;
  return v_created;
end;
$$;

-- Aggregates the boards. Idempotent, and safe to call after any board changes.
create or replace function public.advance_team_match(p_team_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team      public.team_matches%rowtype;
  v_board     record;
  v_points_a  numeric := 0;
  v_points_b  numeric := 0;
  v_open      integer;
  v_final     integer;
  v_total     integer;
  v_agg_a     numeric;
  v_agg_b     numeric;
  v_winner    uuid;
  v_how       public.decided_by;
begin
  select * into v_team from public.team_matches where id = p_team_match_id for update;
  if not found or v_team.state in ('finalized', 'void') then
    return;
  end if;

  select count(*) filter (where state not in ('settled', 'finalized', 'void')),
         count(*) filter (where state in ('finalized', 'void')),
         count(*)
    into v_open, v_final, v_total
    from public.matches where team_match_id = p_team_match_id;

  if v_total = 0 then
    return;
  end if;

  for v_board in
    select * from public.matches
     where team_match_id = p_team_match_id and state in ('settled', 'finalized')
     order by board
  loop
    if v_board.winner_id = v_board.shooter_a then
      v_points_a := v_points_a + 1;
    elsif v_board.winner_id = v_board.shooter_b then
      v_points_b := v_points_b + 1;
    else
      v_points_a := v_points_a + 0.5;
      v_points_b := v_points_b + 0.5;
    end if;
  end loop;

  update public.team_matches
     set points_a = v_points_a,
         points_b = v_points_b,
         state    = case when state = 'scheduled' then 'live' else state end
   where id = p_team_match_id;

  -- A team match is only decided once every board is in. Half a result is not
  -- a result, and boards can still be disputed individually.
  if v_open > 0 then
    return;
  end if;

  if v_points_a <> v_points_b then
    v_winner := case when v_points_a > v_points_b then v_team.club_a else v_team.club_b end;
    v_how := 'score';
  else
    -- Level on boards: total rings across the whole team.
    select
      coalesce(sum(public.submission_effective_total(s)) filter (where s.shooter_id = m.shooter_a), 0),
      coalesce(sum(public.submission_effective_total(s)) filter (where s.shooter_id = m.shooter_b), 0)
      into v_agg_a, v_agg_b
      from public.submissions s
      join public.bouts b on b.id = s.bout_id
      join public.matches m on m.id = b.match_id
     where m.team_match_id = p_team_match_id;

    if v_agg_a <> v_agg_b then
      v_winner := case when v_agg_a > v_agg_b then v_team.club_a else v_team.club_b end;
      v_how := 'tiebreak';
    end if;
  end if;

  update public.team_matches
     set state          = case when v_final = v_total then 'finalized' else 'settled' end::public.match_state,
         winner_club_id = v_winner,
         decided_by     = coalesce(v_how, 'score'),
         settled_at     = coalesce(settled_at, now()),
         finalized_at   = case when v_final = v_total then now() else null end
   where id = p_team_match_id;
end;
$$;

create or replace function public.propagate_board_result()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.team_match_id is not null and new.state is distinct from old.state then
    perform public.advance_team_match(new.team_match_id);
  end if;
  return new;
end;
$$;

create trigger matches_propagate_board
  after update of state on public.matches
  for each row execute function public.propagate_board_result();

-- open_due_rounds() has to know which kind of round it is pairing.
create or replace function public.open_due_rounds()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round record;
  v_count integer := 0;
begin
  for v_round in
    select r.id, s.competition_type
      from public.rounds r
      join public.seasons s on s.id = r.season_id
     where s.state = 'running'
       and r.paired_at is null
       and now() >= r.opens_at - interval '24 hours'
  loop
    if v_round.competition_type = 'team' then
      perform public.pair_team_round(v_round.id);
    else
      perform public.pair_round(v_round.id);
    end if;
    v_count := v_count + 1;
  end loop;

  update public.matches set state = 'live' where state = 'scheduled' and opens_at <= now();
  update public.team_matches set state = 'live' where state = 'scheduled' and opens_at <= now();

  return v_count;
end;
$$;

-- League table. Two points for a win, one for a draw — the convention the
-- clubs already keep their own tables in.
create view public.club_standings
with (security_invoker = false) as
  with played as (
    select tm.season_id, tm.club_a as club_id,
           tm.points_a as bp_for, tm.points_b as bp_against,
           case when tm.winner_club_id = tm.club_a then 'W'
                when tm.winner_club_id is null then 'D' else 'L' end as result
      from public.team_matches tm
     where tm.state in ('settled', 'finalized')
    union all
    select tm.season_id, tm.club_b,
           tm.points_b, tm.points_a,
           case when tm.winner_club_id = tm.club_b then 'W'
                when tm.winner_club_id is null then 'D' else 'L' end
      from public.team_matches tm
     where tm.state in ('settled', 'finalized')
  )
  select
    p.season_id,
    c.id   as club_id,
    c.name as club_name,
    c.short_name,
    c.country_code,
    count(*)                                    as matches_played,
    count(*) filter (where p.result = 'W')      as wins,
    count(*) filter (where p.result = 'D')      as draws,
    count(*) filter (where p.result = 'L')      as losses,
    sum(p.bp_for)                               as board_points_for,
    sum(p.bp_against)                           as board_points_against,
    2 * count(*) filter (where p.result = 'W')
      + count(*) filter (where p.result = 'D')  as table_points,
    rank() over (
      partition by p.season_id
      order by 2 * count(*) filter (where p.result = 'W')
                 + count(*) filter (where p.result = 'D') desc,
               sum(p.bp_for) - sum(p.bp_against) desc,
               sum(p.bp_for) desc
    ) as position
  from played p
  join public.clubs c on c.id = p.club_id
  group by p.season_id, c.id, c.name, c.short_name, c.country_code;

-- ------------------------------------------------------------------- RLS ----

alter table public.club_season_entries enable row level security;
alter table public.team_matches enable row level security;

grant select on public.club_season_entries, public.team_matches to anon, authenticated;
grant select on public.club_standings to anon, authenticated;
grant insert, update (withdrawn_at) on public.club_season_entries to authenticated;

create policy read_club_season_entries on public.club_season_entries for select using (true);
create policy read_team_matches on public.team_matches for select using (true);

-- Entering a season is an act of the club, so only its officials may do it.
create policy enter_team_season on public.club_season_entries
  for insert to authenticated
  with check (
    public.is_club_official(club_id)
    and exists (
      select 1 from public.seasons s
       where s.id = season_id
         and s.competition_type = 'team'
         and s.state = 'registration'
         and now() >= s.registration_opens_at
    )
  );

create policy withdraw_team_season on public.club_season_entries
  for update to authenticated
  using (public.is_club_official(club_id)) with check (public.is_club_official(club_id));
