-- The scheduler could not draw a club season.
--
-- open_due_rounds() called pair_round() for every round of every running
-- season, including team ones. On a team season season_entries is empty —
-- members do not enter one at a time — so it found no field, created nothing,
-- and set paired_at anyway. pair_team_round() then refused the round because it
-- was already marked paired.
--
-- The effect: a club competition was never drawn, and after the first tick it
-- could not be drawn by hand either. Nothing failed loudly. The round simply
-- sat there having been "opened", and every club waited for a fixture that was
-- never coming.
--
-- Whichever pairing runs has to be chosen by what the season is.

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

  update public.matches
     set state = 'live'
   where state = 'scheduled' and opens_at <= now();

  -- A club fixture opens with its boards, and the boards are ordinary matches,
  -- so the line above already covers them. The fixture row needs the same.
  update public.team_matches
     set state = 'live'
   where state = 'scheduled' and opens_at <= now();

  return v_count;
end;
$$;
