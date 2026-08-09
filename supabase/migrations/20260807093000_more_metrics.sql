-- What else is worth counting.
--
-- The rule for adding a metric here is the same as before: a number nobody
-- would act on is a number nobody should collect. Each of these has a decision
-- attached, written next to it.
--
-- Four are new because a whole mode of play arrived with no measurement at all,
-- and three because the beta will fail in ways the first six cannot see.

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

  -- ------------------------------------------------------- the season loop --

  return query
  with bouts_closed as (
    select b.id,
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

  -- ------------------------------------------------------- shooting now -----

  -- Below about 70% the pool is too thin for the mode to feel like anything,
  -- and the answer is more shooters in fewer disciplines rather than more code.
  --
  -- Only series that were eligible to be compared: one reported after its own
  -- window closed is kept as practice and never offered to the matcher, so
  -- counting it here would read as a thin pool when nothing was on offer.
  return query
  select
    'series_compared',
    round(100.0 * count(*) filter (where state = 'matched') / nullif(count(*), 0), 1),
    count(*) filter (where state = 'matched') || ' of ' || count(*)
      || ' reported series found an opponent'
  from public.open_series
  where reported_at >= v_since
    and reported_at <= report_by;

  -- Minutes, not days: this is the number that decides whether the mode feels
  -- immediate. If the median is hours, say so in the app rather than implying
  -- otherwise.
  return query
  select
    'series_wait_minutes',
    round(percentile_cont(0.5) within group (
      order by extract(epoch from (matched_at - reported_at)) / 60
    )::numeric, 1),
    count(*) || ' compared series, median wait'
  from public.open_series
  where state = 'matched' and matched_at >= v_since;

  -- Anything that had to be reported twice is a window too short or an upload
  -- that failed; anything declared and abandoned is a shooter who changed their
  -- mind at the firing point, which is fine.
  return query
  select
    'series_declared_not_reported',
    round(100.0 * count(*) filter (where state = 'expired' and total is null)
          / nullif(count(*), 0), 1),
    count(*) filter (where state = 'expired' and total is null) || ' of ' || count(*)
      || ' declarations never became a report'
  from public.open_series
  where created_at >= v_since;

  -- The activation number for the new front door: how long from signing up to
  -- shooting something that counts. If it is days, the first-run screen is not
  -- doing its job.
  return query
  with first_series as (
    select p.id,
           min(o.reported_at) - p.created_at as gap
      from public.profiles p
      join public.open_series o on o.shooter_id = p.id and o.total is not null
     where p.created_at >= v_since
     group by p.id, p.created_at
  )
  select
    'hours_to_first_series',
    round(percentile_cont(0.5) within group (
      order by extract(epoch from gap) / 3600
    )::numeric, 1),
    count(*) || ' new shooters reported one, median hours after signing up'
  from first_series;

  -- ------------------------------------------------------------- the rest ---

  -- Where a case ends says what kind of problem the league has. Mostly
  -- 'corrected' means people are mistyping and the report screen needs work;
  -- mostly 'unchanged' means disputes are being used as a complaint box; any
  -- 'forfeited' at all means somebody could not be trusted, and that is a
  -- person problem rather than a product one.
  return query
  select
    'disputes_' || coalesce(outcome::text, 'open'),
    count(*)::numeric,
    count(*) || ' case(s)'
  from public.disputes
  where created_at >= v_since
  group by outcome;

  -- A shooter nothing can reach cannot be brought back. Below 90% the loop is
  -- leaking for a reason that has nothing to do with shooting.
  return query
  select
    'reachable',
    round(100.0 * count(*) filter (
      where p.notify_email or exists (
        select 1 from public.device_tokens d
         where d.shooter_id = p.id and d.disabled_at is null
      )
    ) / nullif(count(*), 0), 1),
    count(*) || ' active shooters, share reachable by email or push'
  from public.profiles p
  where p.deleted_at is null
    and exists (select 1 from public.submissions s where s.shooter_id = p.id);

  -- If reports cluster in the last hours of a week-long window, the window is
  -- not generous — it is the only thing making people move, and the reminder is
  -- arriving too late to help.
  return query
  with used as (
    select extract(epoch from (s.submitted_at - b.opens_at))
           / nullif(extract(epoch from (b.closes_at - b.opens_at)), 0) as share
      from public.submissions s
      join public.bouts b on b.id = s.bout_id
     where s.submitted_at >= v_since
       and b.closes_at > b.opens_at
  )
  select
    'window_used',
    round(100.0 * percentile_cont(0.5) within group (order by share)::numeric, 1),
    count(*) || ' reports, median share of the window used before reporting'
  from used;

  -- ------------------------------------------------------------ retention ---

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
    union
    select distinct o.shooter_id from public.open_series o
     join signed_up p on p.id = o.shooter_id
     where o.total is not null
  )
  select
    'activation',
    round(100.0 * (select count(*) from reported) / nullif((select count(*) from signed_up), 0), 1),
    (select count(*) from signed_up) || ' signed up, '
      || (select count(*) from entered) || ' entered a season, '
      || (select count(*) from reported) || ' shot something that counted';

  return query
  with weeks as (
    select shooter_id, date_trunc('week', at) as week from (
      select s.shooter_id, s.submitted_at as at
        from public.submissions s where s.submitted_at >= v_since
      union all
      select o.shooter_id, o.reported_at
        from public.open_series o
       where o.reported_at >= v_since and o.total is not null
    ) activity
    group by shooter_id, date_trunc('week', at)
  ),
  per_shooter as (
    select shooter_id, count(*) as active_weeks from weeks group by shooter_id
  )
  select
    'returning',
    round(100.0 * count(*) filter (where active_weeks > 1) / nullif(count(*), 0), 1),
    count(*) filter (where active_weeks > 1) || ' of ' || count(*)
      || ' shooters reported in more than one week'
  from per_shooter;
end;
$$;

-- The backlog gains the one queue that can now hold somebody up.
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
  select 'undelivered_notifications', count(*), 'neither pushed nor emailed'
    from public.notifications
   where sent_at is null and emailed_at is null and error is null;

  -- Not a fault on its own — somebody has to be first — but a number that only
  -- grows means the pool is too thin for the disciplines on offer.
  return query
  select 'series_waiting', count(*),
         coalesce(round(max(extract(epoch from (now() - reported_at)) / 3600))::text, '0')
           || ' hrs is the longest wait'
    from public.open_series where state = 'reported';
end;
$$;
