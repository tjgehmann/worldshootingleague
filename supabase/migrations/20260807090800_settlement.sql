-- Settlement: the state machine that turns submissions into a rated result.
--
--   submission #2 arrives
--        -> bout revealed
--        -> advance_match(): settle revealed bouts in index order, accumulate
--           match points, decide the match once a side reaches points_to_win
--        -> match settled, dispute window opens
--        -> finalize_match() after the window: Glicko-2 applied
--
-- Bouts are always settled in index order so a parallel best-of-five decides
-- the same way regardless of which upload landed first.

create or replace function public.settle_match(
  p_match_id   uuid,
  p_winner_id  uuid,
  p_decided_by public.decided_by
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dispute_hours integer;
begin
  select f.dispute_hours into v_dispute_hours
    from public.matches m
    join public.formats f on f.id = m.format_id
   where m.id = p_match_id;

  update public.matches
     set state             = 'settled',
         winner_id         = p_winner_id,
         decided_by        = p_decided_by,
         settled_at        = now(),
         dispute_closes_at = now() + make_interval(hours => v_dispute_hours)
   where id = p_match_id;
end;
$$;

-- Idempotent. Safe to call after any event that could change a match.
create or replace function public.advance_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match         public.matches%rowtype;
  v_format        public.formats%rowtype;
  v_bout          record;
  v_total_a       numeric;
  v_total_b       numeric;
  v_tens_a        integer;
  v_tens_b        integer;
  v_points_a      numeric := 0;
  v_points_b      numeric := 0;
  v_decider_index integer;
  v_had_forfeit   boolean := false;
  v_winner        uuid;
  v_agg_a         numeric;
  v_agg_b         numeric;
  v_next_index    integer;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.state not in ('scheduled', 'live') then
    return;
  end if;

  select * into v_format from public.formats where id = v_match.format_id;

  -- 1. Settle every bout whose results are on the table.
  for v_bout in
    select * from public.bouts
     where match_id = p_match_id and state = 'revealed'
     order by index
  loop
    select public.submission_effective_total(s), s.tens into v_total_a, v_tens_a
      from public.submissions s
     where s.bout_id = v_bout.id and s.shooter_id = v_match.shooter_a;

    select public.submission_effective_total(s), s.tens into v_total_b, v_tens_b
      from public.submissions s
     where s.bout_id = v_bout.id and s.shooter_id = v_match.shooter_b;

    update public.bouts
       set state      = 'settled',
           winner_id  = case
                          when v_total_a > v_total_b then v_match.shooter_a
                          when v_total_b > v_total_a then v_match.shooter_b
                          else null
                        end,
           is_tie     = (v_total_a = v_total_b),
           settled_at = now()
     where id = v_bout.id;

    update public.submissions set state = 'accepted' where bout_id = v_bout.id;
  end loop;

  -- 2. Accumulate match points in index order, stopping at the decider.
  for v_bout in
    select * from public.bouts
     where match_id = p_match_id and state in ('settled', 'forfeited')
     order by index
  loop
    v_had_forfeit := v_had_forfeit or v_bout.state = 'forfeited';

    if v_bout.is_tie then
      v_points_a := v_points_a + v_format.tie_points;
      v_points_b := v_points_b + v_format.tie_points;
    elsif v_bout.winner_id = v_match.shooter_a then
      v_points_a := v_points_a + v_format.win_points;
    elsif v_bout.winner_id = v_match.shooter_b then
      v_points_b := v_points_b + v_format.win_points;
    end if;

    if v_points_a >= v_format.points_to_win or v_points_b >= v_format.points_to_win then
      v_decider_index := v_bout.index;
      exit;
    end if;
  end loop;

  update public.matches
     set points_a = v_points_a,
         points_b = v_points_b,
         state    = case when state = 'scheduled' then 'live' else state end
   where id = p_match_id;

  -- 3a. Decided on points.
  if v_decider_index is not null then
    update public.bouts
       set state = 'void'
     where match_id = p_match_id
       and index > v_decider_index
       and state not in ('settled', 'forfeited');

    perform public.settle_match(
      p_match_id,
      case when v_points_a > v_points_b then v_match.shooter_a else v_match.shooter_b end,
      case when v_had_forfeit then 'forfeit' else 'score' end::public.decided_by
    );
    return;
  end if;

  -- 3b. Not decided, but nothing left to shoot.
  if exists (
    select 1 from public.bouts
     where match_id = p_match_id and state not in ('settled', 'forfeited', 'void')
  ) then
    return;
  end if;

  if v_points_a <> v_points_b then
    perform public.settle_match(
      p_match_id,
      case when v_points_a > v_points_b then v_match.shooter_a else v_match.shooter_b end,
      case when v_had_forfeit then 'forfeit' else 'score' end::public.decided_by
    );
    return;
  end if;

  -- 3c. Level on points: aggregate score, then count of tens, then shoot-off.
  select
    coalesce(sum(public.submission_effective_total(s)) filter (where s.shooter_id = v_match.shooter_a), 0),
    coalesce(sum(public.submission_effective_total(s)) filter (where s.shooter_id = v_match.shooter_b), 0),
    coalesce(sum(s.tens) filter (where s.shooter_id = v_match.shooter_a), 0),
    coalesce(sum(s.tens) filter (where s.shooter_id = v_match.shooter_b), 0)
    into v_agg_a, v_agg_b, v_tens_a, v_tens_b
    from public.submissions s
    join public.bouts b on b.id = s.bout_id
   where b.match_id = p_match_id and b.state = 'settled';

  if v_agg_a <> v_agg_b then
    v_winner := case when v_agg_a > v_agg_b then v_match.shooter_a else v_match.shooter_b end;
  elsif v_tens_a <> v_tens_b then
    v_winner := case when v_tens_a > v_tens_b then v_match.shooter_a else v_match.shooter_b end;
  end if;

  if v_winner is not null then
    perform public.settle_match(p_match_id, v_winner, 'tiebreak');
    return;
  end if;

  -- Dead level on everything: one extra bout, 48 hours.
  select max(index) + 1 into v_next_index from public.bouts where match_id = p_match_id;

  insert into public.bouts (match_id, index, state, opens_at, closes_at)
  values (p_match_id, v_next_index, 'open', now(), now() + interval '48 hours');

  update public.matches
     set closes_at = greatest(closes_at, now() + interval '48 hours')
   where id = p_match_id;
end;
$$;

-- Called by the reveal trigger in the submissions migration.
create or replace function public.settle_bout(p_bout_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match_id uuid;
begin
  select match_id into v_match_id from public.bouts where id = p_bout_id;
  perform public.advance_match(v_match_id);
end;
$$;

create trigger submissions_reveal
  after insert on public.submissions
  for each row execute function public.reveal_bout_when_complete();

-- Applies ratings once the dispute window has closed and no case is open.
create or replace function public.finalize_match(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match   public.matches%rowtype;
  v_rat_a   public.ratings%rowtype;
  v_rat_b   public.ratings%rowtype;
  v_score_a numeric;
  v_new_a   record;
  v_new_b   record;
begin
  select * into v_match from public.matches where id = p_match_id for update;

  if not found or v_match.state <> 'settled' then
    return false;
  end if;
  if v_match.dispute_closes_at is not null and now() < v_match.dispute_closes_at then
    return false;
  end if;
  if exists (
    select 1 from public.disputes
     where match_id = p_match_id and state in ('open', 'assigned')
  ) then
    return false;
  end if;

  v_rat_a := public.ensure_rating(v_match.shooter_a, v_match.discipline_id);
  v_rat_b := public.ensure_rating(v_match.shooter_b, v_match.discipline_id);

  v_score_a := case
                 when v_match.winner_id = v_match.shooter_a then 1
                 when v_match.winner_id = v_match.shooter_b then 0
                 else 0.5
               end;

  -- Both updates read the pre-match ratings, so order does not matter.
  select * into v_new_a from public.glicko2_update(
    v_rat_a.rating, v_rat_a.rd, v_rat_a.volatility,
    v_rat_b.rating, v_rat_b.rd, v_score_a
  );
  select * into v_new_b from public.glicko2_update(
    v_rat_b.rating, v_rat_b.rd, v_rat_b.volatility,
    v_rat_a.rating, v_rat_a.rd, 1 - v_score_a
  );

  insert into public.rating_events (
    match_id, shooter_id, opponent_id, discipline_id, score,
    rating_before, rd_before, volatility_before,
    rating_after, rd_after, volatility_after
  )
  values
    (p_match_id, v_match.shooter_a, v_match.shooter_b, v_match.discipline_id, v_score_a,
     v_rat_a.rating, v_rat_a.rd, v_rat_a.volatility,
     v_new_a.rating, v_new_a.rd, v_new_a.volatility),
    (p_match_id, v_match.shooter_b, v_match.shooter_a, v_match.discipline_id, 1 - v_score_a,
     v_rat_b.rating, v_rat_b.rd, v_rat_b.volatility,
     v_new_b.rating, v_new_b.rd, v_new_b.volatility)
  on conflict (match_id, shooter_id) do nothing;

  update public.ratings
     set rating = v_new_a.rating, rd = v_new_a.rd, volatility = v_new_a.volatility,
         matches_played = matches_played + 1,
         wins   = wins   + (v_score_a = 1)::int,
         losses = losses + (v_score_a = 0)::int,
         draws  = draws  + (v_score_a = 0.5)::int,
         last_played_at = now(), updated_at = now()
   where shooter_id = v_match.shooter_a and discipline_id = v_match.discipline_id;

  update public.ratings
     set rating = v_new_b.rating, rd = v_new_b.rd, volatility = v_new_b.volatility,
         matches_played = matches_played + 1,
         wins   = wins   + (v_score_a = 0)::int,
         losses = losses + (v_score_a = 1)::int,
         draws  = draws  + (v_score_a = 0.5)::int,
         last_played_at = now(), updated_at = now()
   where shooter_id = v_match.shooter_b and discipline_id = v_match.discipline_id;

  update public.matches
     set state = 'finalized', finalized_at = now()
   where id = p_match_id;

  return true;
end;
$$;

-- Deadline handling. A bout with one submission is a forfeit for the absentee;
-- a bout with none counts for nobody.
create or replace function public.expire_bouts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bout    record;
  v_present uuid;
  v_count   integer := 0;
begin
  for v_bout in
    select b.id, b.match_id
      from public.bouts b
     where b.state in ('open', 'awaiting_opponent')
       and b.closes_at < now()
     order by b.match_id, b.index
     for update of b skip locked
  loop
    -- A bout still in 'open'/'awaiting_opponent' holds at most one submission.
    select shooter_id into v_present
      from public.submissions where bout_id = v_bout.id limit 1;

    update public.bouts
       set state      = 'forfeited',
           winner_id  = v_present,
           is_tie     = false,
           settled_at = now()
     where id = v_bout.id;

    perform public.advance_match(v_bout.match_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Matches whose window ran out without a single shot from either side are
-- voided rather than rated.
create or replace function public.void_dead_matches()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with dead as (
    update public.matches m
       set state = 'void'
     where m.state in ('scheduled', 'live')
       and m.closes_at < now()
       and not exists (
         select 1 from public.submissions s
           join public.bouts b on b.id = s.bout_id
          where b.match_id = m.id
       )
    returning 1
  )
  select count(*) into v_count from dead;

  return v_count;
end;
$$;

-- Referee closes a case: the bout goes back through settlement with whatever
-- adjusted totals the referee recorded.
create or replace function public.resolve_dispute(p_dispute_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dispute public.disputes%rowtype;
begin
  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if not found or v_dispute.state not in ('open', 'assigned') then
    raise exception 'dispute % is not open', p_dispute_id;
  end if;

  update public.disputes
     set state = 'resolved', resolution_note = p_note, resolved_at = now()
   where id = p_dispute_id;

  update public.bouts
     set state = 'revealed', winner_id = null, is_tie = false, settled_at = null
   where id = v_dispute.bout_id;

  update public.matches
     set state = 'live', winner_id = null, decided_by = null,
         settled_at = null, dispute_closes_at = null
   where id = v_dispute.match_id;

  perform public.advance_match(v_dispute.match_id);
end;
$$;
