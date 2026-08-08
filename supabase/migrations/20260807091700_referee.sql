-- The referee console.
--
-- Until now a dispute could be raised and nothing could happen to it: the case
-- blocked finalize_match() forever and the match sat in awaiting_review. This
-- migration gives a case an ending.
--
-- Four endings, and they are deliberately the only four:
--
--   unchanged  the report stands; the complaint was wrong
--   corrected  the photo shows a different number; the score is adjusted
--   forfeited  one side loses the series (a fabricated report, a missing photo)
--   voided     the series did not happen and counts for nobody
--
-- Everything else a referee might want to do — void a whole match, roll back a
-- rating, suspend an account — is a sanction rather than a decision on one
-- series, and belongs to a moderation system that does not exist yet.
--
-- A decision never edits history. The reported total stays on the row and the
-- correction sits beside it in adjusted_*, so what the shooter typed and what
-- the referee saw are both readable afterwards.

create type public.dispute_outcome as enum (
  'unchanged',
  'corrected',
  'forfeited',
  'voided'
);

alter table public.disputes
  add column outcome public.dispute_outcome,
  add constraint disputes_outcome_only_when_resolved
    check (outcome is null or state = 'resolved');

-- The inner ten count needs the same correctable twin the total already has:
-- a tied full-ring match is decided on inner tens, so that number can be the
-- whole subject of a case.
alter table public.submissions
  add column adjusted_inner_tens integer check (adjusted_inner_tens >= 0);

create or replace function public.submission_effective_inner_tens(public.submissions)
returns integer
language sql
immutable
as $$
  select coalesce($1.adjusted_inner_tens, $1.inner_tens);
$$;

-- ----------------------------------------------------------------- queue ----

-- What a referee works from. security_invoker, so the disputes policy decides
-- who sees rows: participants see their own case, referees see all of them.
create view public.dispute_queue
with (security_invoker = true) as
  select
    d.id            as dispute_id,
    d.state,
    d.reason,
    d.created_at,
    d.referee_id,
    d.assigned_at,
    d.outcome,
    d.resolution_note,
    d.resolved_at,
    b.id            as bout_id,
    b.index         as bout_index,
    b.state         as bout_state,
    m.id            as match_id,
    m.state         as match_state,
    m.shooter_a,
    m.shooter_b,
    pa.display_name as shooter_a_name,
    pb.display_name as shooter_b_name,
    d.raised_by,
    pr.display_name as raised_by_name,
    dis.code        as discipline_code,
    dis.name        as discipline_name,
    dis.scoring_mode,
    dis.requires_inner_tens,
    -- How long the case has been waiting, in hours. The queue is worked oldest
    -- first, and a case ageing past a day is the thing to escalate.
    extract(epoch from (now() - d.created_at)) / 3600 as waiting_hours
  from public.disputes d
  join public.bouts b       on b.id = d.bout_id
  join public.matches m     on m.id = d.match_id
  join public.disciplines dis on dis.id = m.discipline_id
  join public.profiles pa   on pa.id = m.shooter_a
  join public.profiles pb   on pb.id = m.shooter_b
  join public.profiles pr   on pr.id = d.raised_by;

grant select on public.dispute_queue to authenticated;

-- ----------------------------------------------------------------- claim ----

-- Taking a case. Claiming is not required to decide one, but it is what keeps
-- two referees from working the same case at the same time.
create or replace function public.claim_dispute(p_dispute_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dispute public.disputes%rowtype;
begin
  if not public.is_referee() then
    raise exception 'only a referee can take a case' using errcode = 'insufficient_privilege';
  end if;

  select * into v_dispute from public.disputes where id = p_dispute_id for update;

  if not found then
    raise exception 'unknown dispute %', p_dispute_id;
  end if;

  if v_dispute.state not in ('open', 'assigned') then
    raise exception 'dispute % is already closed', p_dispute_id using errcode = 'check_violation';
  end if;

  if v_dispute.referee_id is not null and v_dispute.referee_id <> auth.uid() then
    raise exception 'dispute % is already with another referee', p_dispute_id
      using errcode = 'check_violation';
  end if;

  update public.disputes
     set state = 'assigned', referee_id = auth.uid(), assigned_at = now()
   where id = p_dispute_id;
end;
$$;

-- ---------------------------------------------------------------- decide ----

create or replace function public.decide_dispute(
  p_dispute_id    uuid,
  p_outcome       public.dispute_outcome,
  p_note          text,
  -- corrected: whose row, and what the photo actually shows
  p_submission_id uuid    default null,
  p_total         numeric default null,
  p_inner_tens    integer default null,
  -- forfeited: who keeps the series
  p_winner_id     uuid    default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dispute    public.disputes%rowtype;
  v_match      public.matches%rowtype;
  v_submission public.submissions%rowtype;
  v_shooter    uuid;
begin
  if not public.is_referee() then
    raise exception 'only a referee can decide a case' using errcode = 'insufficient_privilege';
  end if;

  if p_note is null or char_length(btrim(p_note)) < 10 then
    raise exception 'a decision needs a reason both shooters can read'
      using errcode = 'check_violation';
  end if;

  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if not found or v_dispute.state not in ('open', 'assigned') then
    raise exception 'dispute % is not open', p_dispute_id using errcode = 'check_violation';
  end if;

  select * into v_match from public.matches where id = v_dispute.match_id for update;

  -- ----------------------------------------------------------- the outcome
  if p_outcome = 'corrected' then
    if p_submission_id is null or p_total is null then
      raise exception 'a correction needs a submission and a total'
        using errcode = 'check_violation';
    end if;

    select * into v_submission from public.submissions
     where id = p_submission_id and bout_id = v_dispute.bout_id;

    if not found then
      raise exception 'submission % does not belong to this series', p_submission_id
        using errcode = 'check_violation';
    end if;

    update public.submissions
       set adjusted_total      = p_total,
           adjusted_inner_tens = p_inner_tens,
           adjusted_by         = auth.uid(),
           adjusted_reason     = p_note
     where id = p_submission_id;

    update public.bouts
       set state = 'revealed', winner_id = null, is_tie = false, settled_at = null
     where id = v_dispute.bout_id;

  elsif p_outcome = 'forfeited' then
    if p_winner_id is null or p_winner_id not in (v_match.shooter_a, v_match.shooter_b) then
      raise exception 'a forfeit needs one of the two shooters as the winner'
        using errcode = 'check_violation';
    end if;

    update public.bouts
       set state = 'forfeited', winner_id = p_winner_id, is_tie = false, settled_at = now()
     where id = v_dispute.bout_id;

  elsif p_outcome = 'voided' then
    -- Counts for nobody. advance_match() skips it and, if that leaves the match
    -- level with nothing to shoot, adds a decider.
    update public.bouts
       set state = 'void', winner_id = null, is_tie = false, settled_at = null
     where id = v_dispute.bout_id;

  else  -- 'unchanged'
    update public.bouts
       set state = 'revealed', winner_id = null, is_tie = false, settled_at = null
     where id = v_dispute.bout_id;
  end if;

  -- A forfeit says one of the two reports could not be trusted, so only that
  -- one is marked rejected. A void rejects both; the other endings accept both.
  update public.submissions
     set state = case
                   when p_outcome = 'voided' then 'rejected'
                   when p_outcome = 'forfeited' and shooter_id <> p_winner_id then 'rejected'
                   else 'accepted'
                 end::public.submission_state
   where bout_id = v_dispute.bout_id;

  -- ------------------------------------------------------------ the record
  update public.disputes
     set state           = 'resolved',
         outcome         = p_outcome,
         referee_id      = coalesce(referee_id, auth.uid()),
         assigned_at     = coalesce(assigned_at, now()),
         resolution_note = p_note,
         resolved_at     = now()
   where id = p_dispute_id;

  -- The match goes back to being undecided and is settled again from scratch,
  -- so a correction can change who won it.
  update public.matches
     set state             = 'live',
         winner_id         = null,
         decided_by        = null,
         settled_at        = null,
         dispute_closes_at = null
   where id = v_dispute.match_id;

  perform public.advance_match(v_dispute.match_id);

  -- ----------------------------------------------------------- both shooters
  foreach v_shooter in array array[v_match.shooter_a, v_match.shooter_b] loop
    perform public.enqueue_notification(
      v_shooter,
      'dispute_resolved',
      'A referee has decided',
      case p_outcome
        when 'unchanged' then 'The reported result stands.'
        when 'corrected' then 'A score was corrected. The match was settled again.'
        when 'forfeited' then 'The series was awarded to one side.'
        else 'The series was voided and counts for nobody.'
      end,
      jsonb_build_object('route', '/match/' || v_dispute.match_id),
      v_dispute.match_id,
      v_dispute.bout_id
    );
  end loop;
end;
$$;

-- Kept for the callers that only ever upheld a report.
create or replace function public.resolve_dispute(p_dispute_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.decide_dispute(p_dispute_id, 'unchanged', p_note);
end;
$$;

revoke execute on function public.decide_dispute(uuid, public.dispute_outcome, text, uuid, numeric, integer, uuid) from public;
revoke execute on function public.claim_dispute(uuid) from public;
grant execute on function public.decide_dispute(uuid, public.dispute_outcome, text, uuid, numeric, integer, uuid) to authenticated;
grant execute on function public.claim_dispute(uuid) to authenticated;

-- --------------------------------------------------------- the tiebreak ----

-- Same body as the settlement migration, with one change: the inner ten
-- tiebreak reads the corrected count where a referee set one. Repeated in full
-- because Postgres has no way to patch a function in place.
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
  v_inner_a       integer;
  v_inner_b       integer;
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
    select public.submission_effective_total(s) into v_total_a
      from public.submissions s
     where s.bout_id = v_bout.id and s.shooter_id = v_match.shooter_a;

    select public.submission_effective_total(s) into v_total_b
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

  -- 3c. Level on points: aggregate score, then inner tens (the ISSF tiebreak
  -- for full-ring scores), then a shoot-off. Disciplines scored in tenths carry
  -- no inner ten count, so for those the aggregate almost always decides.
  select
    coalesce(sum(public.submission_effective_total(s)) filter (where s.shooter_id = v_match.shooter_a), 0),
    coalesce(sum(public.submission_effective_total(s)) filter (where s.shooter_id = v_match.shooter_b), 0),
    coalesce(sum(public.submission_effective_inner_tens(s)) filter (where s.shooter_id = v_match.shooter_a), 0),
    coalesce(sum(public.submission_effective_inner_tens(s)) filter (where s.shooter_id = v_match.shooter_b), 0)
    into v_agg_a, v_agg_b, v_inner_a, v_inner_b
    from public.submissions s
    join public.bouts b on b.id = s.bout_id
   where b.match_id = p_match_id and b.state = 'settled';

  if v_agg_a <> v_agg_b then
    v_winner := case when v_agg_a > v_agg_b then v_match.shooter_a else v_match.shooter_b end;
  elsif v_inner_a <> v_inner_b then
    v_winner := case when v_inner_a > v_inner_b then v_match.shooter_a else v_match.shooter_b end;
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
