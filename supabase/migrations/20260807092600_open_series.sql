-- Shooting now, without waiting for Monday.
--
-- The ladder pairs first and asks you to go and shoot afterwards. That is the
-- right shape for a season and the wrong shape for the moment somebody installs
-- the app: they are standing at a range, they have already fired three series,
-- and the app tells them to come back next week. That is where an account is
-- lost.
--
-- So this turns the order around. You declare that you are about to shoot, you
-- shoot, you report — with no opponent anywhere in sight. Your series waits. As
-- soon as somebody at a similar rating has reported one too, the two are paired,
-- both numbers are revealed at once and the match settles. Neither of you ever
-- waited for the other, because both of you were going to the range anyway.
--
-- The blind reveal comes out of this stronger rather than weaker: you commit
-- your score before you know who you are up against, so there is no number to
-- aim at.
--
-- The thing this has to defend against is not cheating with the score — the
-- photo and the opponent's check already do that — it is picking which series
-- to submit. Shoot ten, report the best, and the ranking is worthless inside a
-- fortnight. Hence the declaration: the window opens when you say you are about
-- to shoot, and a series fired before that is refused. It costs one tap before
-- you step up to the firing point, and it is the entire reason the number next
-- to your name means anything.

create type public.open_series_state as enum (
  'open',       -- declared, being shot
  'reported',   -- result is in, waiting for somebody to compare with
  'matched',    -- paired; the match carries it from here
  'expired'     -- the report window passed, or nobody turned up
);

create table public.open_series (
  id            uuid primary key default gen_random_uuid(),
  shooter_id    uuid not null references public.profiles (id) on delete cascade,
  discipline_id uuid not null references public.disciplines (id),
  state         public.open_series_state not null default 'open',

  -- The window the series has to have been fired in. opens_at is the moment of
  -- declaration, which is what makes cherry-picking impossible.
  opens_at      timestamptz not null default now(),
  report_by     timestamptz not null,

  total         numeric(5, 1),
  inner_tens    integer check (inner_tens >= 0),
  photo_path    text,
  capture_method public.capture_method,
  shot_at       timestamptz,
  reported_at   timestamptz,

  /** Rating at declaration, so the matching does not have to join it later. */
  seed_rating   numeric(6, 2),

  match_id      uuid references public.matches (id) on delete set null,
  matched_at    timestamptz,
  created_at    timestamptz not null default now(),

  constraint open_series_reported_complete
    check ((state <> 'reported' and state <> 'matched')
        or (total is not null and photo_path is not null and shot_at is not null))
);

create index open_series_waiting_idx
  on public.open_series (discipline_id, seed_rating)
  where state = 'reported';

create index open_series_shooter_idx on public.open_series (shooter_id, created_at desc);

-- One at a time. Two open declarations would be two windows to pick from, which
-- is the thing the window exists to prevent.
create unique index open_series_one_live_per_shooter
  on public.open_series (shooter_id)
  where state in ('open', 'reported');

alter table public.open_series enable row level security;

grant select on public.open_series to authenticated;

create policy read_own_open_series on public.open_series
  for select to authenticated
  using (shooter_id = auth.uid() or public.is_referee());

-- Written only by the functions below. A shooter cannot set their own window.

-- ------------------------------------------------------------- declaring ----

/** How long there is to report after declaring. Long enough to shoot a series
    and read the display, short enough that it cannot become a second attempt. */
create or replace function public.open_series_report_minutes()
returns integer language sql immutable as $$ select 45 $$;

/** A ceiling on enthusiasm, not a limit anybody will meet by shooting. */
create or replace function public.open_series_daily_limit()
returns integer language sql immutable as $$ select 10 $$;

create or replace function public.declare_open_series(p_discipline_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shooter uuid := auth.uid();
  v_id      uuid;
  v_today   integer;
begin
  if v_shooter is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.disciplines where id = p_discipline_id and is_active
  ) then
    raise exception 'unknown discipline' using errcode = 'no_data_found';
  end if;

  -- Anything still lying around from an earlier visit is done with.
  update public.open_series
     set state = 'expired'
   where shooter_id = v_shooter
     and state = 'open'
     and report_by < now();

  select count(*) into v_today
    from public.open_series
   where shooter_id = v_shooter and created_at > now() - interval '24 hours';

  if v_today >= public.open_series_daily_limit() then
    raise exception 'that is % series in a day; come back tomorrow',
      public.open_series_daily_limit()
      using errcode = 'check_violation';
  end if;

  insert into public.open_series (shooter_id, discipline_id, report_by, seed_rating)
  values (
    v_shooter,
    p_discipline_id,
    now() + make_interval(mins => public.open_series_report_minutes()),
    (select rating from public.ratings
      where shooter_id = v_shooter and discipline_id = p_discipline_id)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------- reporting ----

/**
 * The number checks that do not depend on a bout, so the shooter finds out at
 * the range rather than after being paired. validate_submission() runs them
 * again when the real submission is written; this is the early copy, not the
 * authority.
 */
create or replace function public.check_series_numbers(
  p_discipline_id uuid,
  p_total         numeric,
  p_inner_tens    integer
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_discipline public.disciplines%rowtype;
begin
  select * into v_discipline from public.disciplines where id = p_discipline_id;

  if v_discipline.requires_inner_tens and p_inner_tens is null then
    raise exception 'discipline % is scored in whole rings and needs the inner ten count',
      v_discipline.code using errcode = 'not_null_violation';
  end if;

  if p_inner_tens is not null then
    if p_inner_tens > v_discipline.shot_count then
      raise exception 'inner tens (%) cannot exceed the % shots of discipline %',
        p_inner_tens, v_discipline.shot_count, v_discipline.code
        using errcode = 'check_violation';
    end if;

    if p_total < p_inner_tens * 10.0 then
      raise exception '% inner ten(s) cannot add up to a total of only %',
        p_inner_tens, p_total using errcode = 'check_violation';
    end if;
  end if;

  if p_total < 0 or p_total > v_discipline.shot_count * v_discipline.max_shot_value then
    raise exception 'total % outside 0..% for discipline %',
      p_total, v_discipline.shot_count * v_discipline.max_shot_value, v_discipline.code
      using errcode = 'check_violation';
  end if;

  if v_discipline.scoring_mode = 'integer' and p_total <> trunc(p_total) then
    raise exception 'discipline % scores whole rings, got total %',
      v_discipline.code, p_total using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.report_open_series(
  p_id             uuid,
  p_total          numeric,
  p_inner_tens     integer default null,
  p_photo_path     text default null,
  p_shot_at        timestamptz default null,
  p_capture_method public.capture_method default 'in_app_camera'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_series public.open_series%rowtype;
  v_shot   timestamptz := coalesce(p_shot_at, now());
begin
  select * into v_series from public.open_series where id = p_id for update;

  if not found or v_series.shooter_id <> auth.uid() then
    raise exception 'that is not your series' using errcode = 'insufficient_privilege';
  end if;

  if v_series.state <> 'open' then
    raise exception 'this series has already been reported' using errcode = 'check_violation';
  end if;

  if now() > v_series.report_by then
    update public.open_series set state = 'expired' where id = p_id;
    raise exception 'the reporting window for this series has closed'
      using errcode = 'check_violation';
  end if;

  if p_photo_path is null then
    raise exception 'a photograph of the display is what makes this checkable'
      using errcode = 'not_null_violation';
  end if;

  perform public.check_series_numbers(v_series.discipline_id, p_total, p_inner_tens);

  -- The series has to have been fired since it was declared. This is the whole
  -- defence against reporting the best of ten.
  if v_shot < v_series.opens_at - interval '1 minute' or v_shot > now() + interval '1 hour' then
    raise exception 'this series was not shot inside the window you opened'
      using errcode = 'check_violation';
  end if;

  update public.open_series
     set state = 'reported',
         total = p_total,
         inner_tens = p_inner_tens,
         photo_path = p_photo_path,
         capture_method = p_capture_method,
         shot_at = v_shot,
         reported_at = now()
   where id = p_id;

  -- Somebody may already be waiting, so try straight away rather than making
  -- the shooter wait for the next tick.
  perform public.match_open_series();

  return p_id;
end;
$$;

create or replace function public.withdraw_open_series(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.open_series
     set state = 'expired'
   where id = p_id and shooter_id = auth.uid() and state in ('open', 'reported');
end;
$$;

-- -------------------------------------------------------------- matching ----

/** How long a reported series waits for somebody before it is let go. */
create or replace function public.open_series_patience()
returns interval language sql immutable as $$ select interval '72 hours' $$;

/** Two shooters who have just met do not meet again straight away. */
create or replace function public.met_recently(p_a uuid, p_b uuid, p_within interval)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.matches m
     where m.created_at > now() - p_within
       and ((m.shooter_a = p_a and m.shooter_b = p_b)
         or (m.shooter_a = p_b and m.shooter_b = p_a))
  );
$$;

/**
 * Pairs everything that is waiting, closest rating first.
 *
 * Same idea as pair_round(): sort by rating and take neighbours, which is the
 * cheapest way to keep a match worth shooting. A series is paired against one
 * that is already lying there — deliberately, because the alternative is
 * telling the second shooter to wait, which is the thing this exists to stop.
 * Neither can see the other's number: both were written down before the two
 * were introduced.
 */
create or replace function public.match_open_series()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      record;
  v_field    record;
  v_taken    uuid[] := array[]::uuid[];
  v_format   uuid;
  v_match    uuid;
  v_bout     uuid;
  v_partner  public.open_series%rowtype;
  v_created  integer := 0;
begin
  -- A free series is one series of ten shots, which is exactly single_10.
  select id into v_format from public.formats where code = 'single_10';
  if v_format is null then
    return 0;
  end if;

  -- Let go of anything nobody turned up for, and of declarations that were
  -- never reported.
  update public.open_series
     set state = 'expired'
   where (state = 'open' and report_by < now())
      or (state = 'reported' and reported_at < now() - public.open_series_patience());

  for v_field in
    select distinct discipline_id from public.open_series where state = 'reported'
  loop
    for v_row in
      select * from public.open_series
       where state = 'reported'
         and discipline_id = v_field.discipline_id
       order by coalesce(seed_rating, 1500) desc, reported_at
    loop
      continue when v_row.id = any (v_taken);

      -- The nearest rating that is not this shooter and not somebody they have
      -- just played.
      select * into v_partner
        from public.open_series o
       where o.state = 'reported'
         and o.discipline_id = v_field.discipline_id
         and o.id <> v_row.id
         and o.id <> all (v_taken)
         and o.shooter_id <> v_row.shooter_id
         and not public.met_recently(o.shooter_id, v_row.shooter_id, interval '14 days')
       order by abs(coalesce(o.seed_rating, 1500) - coalesce(v_row.seed_rating, 1500)),
                o.reported_at
       limit 1;

      continue when not found;

      insert into public.matches (
        discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at
      )
      values (
        v_field.discipline_id, v_format,
        v_row.shooter_id, v_partner.shooter_id,
        'live',
        least(v_row.opens_at, v_partner.opens_at),
        now()
      )
      returning id into v_match;

      -- create_bouts_for_match() has already made the single bout; its window
      -- has to cover both series, which were shot before the match existed.
      update public.bouts
         set opens_at = least(v_row.opens_at, v_partner.opens_at),
             closes_at = now()
       where match_id = v_match
      returning id into v_bout;

      -- Both at once. The reveal trigger fires on the second and settles the
      -- match inside this statement.
      insert into public.submissions
        (bout_id, shooter_id, total, inner_tens, photo_path, capture_method, shot_at, source)
      values
        (v_bout, v_row.shooter_id, v_row.total, v_row.inner_tens,
         v_row.photo_path, coalesce(v_row.capture_method, 'in_app_camera'), v_row.shot_at, 'manual'),
        (v_bout, v_partner.shooter_id, v_partner.total, v_partner.inner_tens,
         v_partner.photo_path, coalesce(v_partner.capture_method, 'in_app_camera'),
         v_partner.shot_at, 'manual');

      update public.open_series
         set state = 'matched', match_id = v_match, matched_at = now()
       where id in (v_row.id, v_partner.id);

      v_taken := v_taken || v_row.id || v_partner.id;
      v_created := v_created + 1;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke execute on function public.declare_open_series(uuid) from public;
revoke execute on function public.report_open_series(uuid, numeric, integer, text, timestamptz, public.capture_method) from public;
revoke execute on function public.withdraw_open_series(uuid) from public;
revoke execute on function public.match_open_series() from public;

grant execute on function public.declare_open_series(uuid) to authenticated;
grant execute on function public.report_open_series(uuid, numeric, integer, text, timestamptz, public.capture_method) to authenticated;
grant execute on function public.withdraw_open_series(uuid) to authenticated;

-- The tick sweeps up anything that was reported while nobody else was around.
-- Everything the earlier versions did stays: this is the notifications-era tick
-- with one more line, not a replacement for it.
create or replace function public.run_league_tick()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rounds     integer;
  v_expired    integer;
  v_voided     integer;
  v_confirmed  integer;
  v_reminders  integer;
  v_open       integer;
  v_finalized  integer := 0;
  v_match      record;
begin
  v_rounds    := public.open_due_rounds();
  v_open      := public.match_open_series();
  v_expired   := public.expire_bouts();
  v_voided    := public.void_dead_matches();
  v_confirmed := public.expire_confirmations();
  v_reminders := public.enqueue_deadline_reminders();

  for v_match in
    select id from public.matches
     where state = 'settled'
       and dispute_closes_at is not null
       and dispute_closes_at <= now()
     limit 500
  loop
    if public.finalize_match(v_match.id) then
      v_finalized := v_finalized + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'rounds_paired',        v_rounds,
    'open_series_matched',  v_open,
    'bouts_expired',        v_expired,
    'matches_voided',       v_voided,
    'confirmations_lapsed', v_confirmed,
    'reminders_queued',     v_reminders,
    'matches_finalized',    v_finalized,
    'at', now()
  );
end;
$$;
