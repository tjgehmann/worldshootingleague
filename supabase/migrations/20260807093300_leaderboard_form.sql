-- Recent form on the ladder.
--
-- The table already said what a shooter's rating is and how many matches it
-- took. It could not say the thing a ladder is actually asked — is this person
-- climbing? — because wins, losses and draws are counts with no order in them.
-- A shooter who won six then lost six reads identically to one who lost six
-- then won six, and only one of those is somebody you want to be drawn against.
--
-- rating_events already holds it: one row per rated match per shooter, with the
-- score, the rating either side of it and when it happened. Nothing new is
-- stored; the view just stops throwing the ordering away.
--
-- Five, because five marks is what fits beside a rating on a phone and five
-- matches is roughly a season's worth in a sport where somebody shoots eight.

create or replace view public.leaderboard
with (security_invoker = false) as
  select
    r.discipline_id,
    d.code as discipline,
    p.id   as shooter_id,
    p.handle,
    p.display_name,
    p.country_code,
    r.rating,
    r.rd,
    r.matches_played,
    r.wins,
    r.losses,
    r.draws,
    -- Provisional until the deviation drops; do not rank newcomers against
    -- established shooters on rating alone.
    (r.rd > 110) as is_provisional,
    rank() over (partition by r.discipline_id order by r.rating desc) as position,
    -- Oldest first, so the strip reads left to right as time. Fewer than five
    -- for a newcomer, and an empty array rather than null for somebody whose
    -- rated matches have all been deleted with their opponent's account.
    recent.form as recent_form
  from public.ratings r
  join public.profiles p on p.id = r.shooter_id
  join public.disciplines d on d.id = r.discipline_id
  left join lateral (
    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'score', e.score,
                 -- Whole points: a rating is shown rounded, so a delta that
                 -- disagreed with the difference between two displayed ratings
                 -- would look like an error.
                 'delta', round(e.rating_after - e.rating_before)
               )
               order by e.created_at
             ),
             '[]'::jsonb
           ) as form
    from (
      select ev.score, ev.rating_after, ev.rating_before, ev.created_at
      from public.rating_events ev
      where ev.shooter_id = r.shooter_id
        and ev.discipline_id = r.discipline_id
      order by ev.created_at desc
      limit 5
    ) e
  ) recent on true
  where r.matches_played > 0 and p.is_public;

-- The lateral runs once per ranked shooter, so the lookup wants to be an index
-- seek rather than a scan of every rated match ever played.
create index if not exists rating_events_form_idx
  on public.rating_events (shooter_id, discipline_id, created_at desc);

-- create or replace keeps existing grants, but say it plainly rather than rely
-- on it: this view is the public ladder.
grant select on public.leaderboard to anon, authenticated;
