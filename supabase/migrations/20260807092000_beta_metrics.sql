-- What the beta is supposed to answer.
--
-- A closed beta that produces no numbers has only produced opinions. These are
-- the six that decide whether the loop works, chosen because each one has a
-- decision attached to it:
--
--   reported_in_window   below ~80% the window is too short, or the reminder
--                        comes too late
--   walkover_rate        the same failure seen from the match's side
--   checked_by_opponent  the trust model rests on this; if nobody looks at the
--                        photo, peer confirmation is theatre
--   dispute_rate         a rate near zero can mean honesty or resignation —
--                        read it next to the line above
--   activation           signed up, entered a season, actually reported once
--   returning            came back in the second week
--
-- Admin only. They are counts rather than rows, but they still describe how a
-- named group of people behaved.

create or replace function public.beta_health(p_days integer default 30)
returns table (
  metric text,
  value  numeric,
  detail text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := now() - make_interval(days => p_days);
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  return query
  -- Series that were reported inside their window, against those that closed
  -- with somebody missing.
  with bouts_closed as (
    select b.id, b.closes_at,
           (select count(*) from public.submissions s where s.bout_id = b.id) as reports
      from public.bouts b
     where b.closes_at >= v_since
       and b.state in ('settled', 'forfeited', 'revealed', 'disputed')
  )
  select
    'reported_in_window',
    round(100.0 * count(*) filter (where reports = 2) / nullif(count(*), 0), 1),
    count(*) filter (where reports = 2) || ' of ' || count(*) || ' series had both reports'
  from bouts_closed;

  return query
  select
    'walkover_rate',
    round(100.0 * count(*) filter (where decided_by = 'walkover') / nullif(count(*), 0), 1),
    count(*) filter (where decided_by = 'walkover') || ' of ' || count(*) || ' matches were walkovers'
  from public.matches
  where settled_at >= v_since;

  -- Confirmations the shooter actually made, as opposed to the ones the
  -- deadline made for them.
  return query
  select
    'checked_by_opponent',
    round(100.0 * count(*) filter (where not is_auto) / nullif(count(*), 0), 1),
    count(*) filter (where not is_auto) || ' of ' || count(*) || ' results were looked at'
  from public.bout_confirmations
  where created_at >= v_since;

  return query
  select
    'dispute_rate',
    round(100.0 * (select count(*) from public.disputes where created_at >= v_since)
          / nullif((select count(*) from public.matches where settled_at >= v_since), 0), 2),
    (select count(*) from public.disputes where created_at >= v_since)
      || ' case(s) per 100 settled matches';

  -- The funnel that matters in week one: an account is not a shooter.
  return query
  with signed_up as (
    select id from public.profiles where created_at >= v_since and deleted_at is null
  ),
  entered as (
    select distinct e.shooter_id from public.season_entries e
     join signed_up p on p.id = e.shooter_id
  ),
  reported as (
    select distinct s.shooter_id from public.submissions s
     join signed_up p on p.id = s.shooter_id
  )
  select
    'activation',
    round(100.0 * (select count(*) from reported) / nullif((select count(*) from signed_up), 0), 1),
    (select count(*) from signed_up) || ' signed up, '
      || (select count(*) from entered) || ' entered a season, '
      || (select count(*) from reported) || ' reported at least once';

  -- Reported in two different weeks: the cheapest honest retention number for
  -- a format whose whole cycle is a week long.
  return query
  with weeks as (
    select shooter_id, count(distinct date_trunc('week', submitted_at)) as active_weeks
      from public.submissions
     where submitted_at >= v_since
     group by shooter_id
  )
  select
    'returning',
    round(100.0 * count(*) filter (where active_weeks > 1) / nullif(count(*), 0), 1),
    count(*) filter (where active_weeks > 1) || ' of ' || count(*)
      || ' shooters reported in more than one week'
  from weeks;
end;
$$;

revoke execute on function public.beta_health(integer) from public;
grant execute on function public.beta_health(integer) to authenticated;

/**
 * The operator's other daily question: what is stuck?
 *
 * Cases nobody has decided, matches whose window has passed but which have not
 * been swept, and reports queued on somebody's phone are invisible here — but
 * the first two are exactly what run_league_tick() is supposed to clear, so a
 * number that will not go down is a broken tick.
 */
create or replace function public.beta_backlog()
returns table (
  metric text,
  value  bigint,
  detail text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  return query
  select 'open_cases', count(*),
         coalesce(round(max(extract(epoch from (now() - created_at)) / 3600))::text, '0')
           || ' hrs is the oldest'
    from public.disputes where state in ('open', 'assigned');

  return query
  select 'overdue_bouts', count(*), 'past their window and not yet swept'
    from public.bouts
   where state in ('open', 'awaiting_opponent') and closes_at < now();

  return query
  select 'matches_awaiting_rating', count(*), 'settled, dispute window closed, not finalized'
    from public.matches
   where state = 'settled' and dispute_closes_at < now();

  return query
  select 'undelivered_notifications', count(*), 'queued but not sent'
    from public.notifications where sent_at is null and error is null;
end;
$$;

revoke execute on function public.beta_backlog() from public;
grant execute on function public.beta_backlog() to authenticated;
