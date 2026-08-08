-- Public surfaces.
--
-- Results that nobody can link to might as well not exist. Everything a
-- spectator sees is served from views that run with the owner's rights, so the
-- underlying tables stay closed: submissions are still readable only by the two
-- shooters and a referee, and photos never leave the private bucket.
--
-- The rule for every view here: settled matches only. A match in progress is
-- exactly what the blind reveal exists to protect, and making it public would
-- hand anyone a way around it.

-- Per-bout scores of a finished match, both sides side by side.
create view public.match_scorecard
with (security_invoker = false) as
  select
    m.id            as match_id,
    b.index         as bout,
    b.state         as bout_state,
    b.is_tie,
    b.winner_id,
    m.shooter_a,
    m.shooter_b,
    public.submission_effective_total(sa) as total_a,
    sa.inner_tens                          as inner_tens_a,
    public.submission_effective_total(sb) as total_b,
    sb.inner_tens                          as inner_tens_b
  from public.matches m
  join public.bouts b on b.match_id = m.id
  left join public.submissions sa
    on sa.bout_id = b.id and sa.shooter_id = m.shooter_a
  left join public.submissions sb
    on sb.bout_id = b.id and sb.shooter_id = m.shooter_b
  where m.state in ('settled', 'finalized')
    and b.state in ('settled', 'forfeited');

-- Seasons with enough context to render a page: who runs it, how far along it
-- is, and how many are in it.
create view public.season_summary
with (security_invoker = false) as
  select
    s.id,
    s.slug,
    s.name,
    s.state,
    s.competition_type,
    s.team_size,
    s.country_code,
    s.starts_at,
    s.ends_at,
    s.round_count,
    d.code as discipline_code,
    d.name as discipline_name,
    f.code as format_code,
    f.name as format_name,
    (select count(*) from public.season_entries e
      where e.season_id = s.id and e.withdrawn_at is null) as shooters_entered,
    (select count(*) from public.club_season_entries ce
      where ce.season_id = s.id and ce.withdrawn_at is null) as clubs_entered,
    (select count(*) from public.rounds r
      where r.season_id = s.id and r.paired_at is not null) as rounds_paired
  from public.seasons s
  join public.disciplines d on d.id = s.discipline_id
  join public.formats f on f.id = s.format_id
  where s.state <> 'draft';

-- The individual table of one season, as opposed to the global per-discipline
-- leaderboard. A season is what a shooter actually signed up to.
create view public.season_standings
with (security_invoker = false) as
  with results as (
    select m.season_id, m.shooter_a as shooter_id,
           case when m.winner_id = m.shooter_a then 1.0
                when m.winner_id is null then 0.5 else 0.0 end as score
      from public.matches m
     where m.season_id is not null and m.state in ('settled', 'finalized')
    union all
    select m.season_id, m.shooter_b,
           case when m.winner_id = m.shooter_b then 1.0
                when m.winner_id is null then 0.5 else 0.0 end
      from public.matches m
     where m.season_id is not null and m.state in ('settled', 'finalized')
  )
  select
    r.season_id,
    p.id     as shooter_id,
    p.handle,
    p.display_name,
    p.country_code,
    c.name   as club_name,
    count(*)                                  as matches_played,
    count(*) filter (where r.score = 1.0)     as wins,
    count(*) filter (where r.score = 0.5)     as draws,
    count(*) filter (where r.score = 0.0)     as losses,
    sum(r.score)                              as points,
    rank() over (partition by r.season_id order by sum(r.score) desc, count(*) ) as position
  from results r
  join public.profiles p on p.id = r.shooter_id
  left join public.clubs c on c.id = p.primary_club_id
  where p.is_public
  group by r.season_id, p.id, p.handle, p.display_name, p.country_code, c.name;

-- A club's public page: who shoots for it and how its fixtures went.
create view public.club_profile
with (security_invoker = false) as
  select
    c.id,
    c.slug,
    c.name,
    c.short_name,
    c.country_code,
    c.city,
    (select count(*) from public.profiles p where p.primary_club_id = c.id and p.is_public)
      as shooters,
    (select count(*) from public.team_matches tm
      where (tm.club_a = c.id or tm.club_b = c.id)
        and tm.state in ('settled', 'finalized')) as fixtures_played,
    (select count(*) from public.team_matches tm
      where tm.winner_club_id = c.id) as fixtures_won
  from public.clubs c;

grant select on
  public.match_scorecard, public.season_summary, public.season_standings, public.club_profile
  to anon, authenticated;

-- Spectators need the fixture list too; team_matches is already anon-readable,
-- but the rounds that order it were not granted before this point.
grant select on public.rounds to anon;
