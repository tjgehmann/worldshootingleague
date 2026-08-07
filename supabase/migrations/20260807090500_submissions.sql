-- Submissions: what a shooter reports for one bout.
--
-- Two numbers and a photo. The shooter reads the total and the number of tens
-- off the range display or the printout and types them in; the photo is the
-- evidence the opponent checks after the reveal. Ranges that can export their
-- data (SIUS CSV, later a manufacturer API) may additionally supply the
-- individual shots, in which case the two paths cross-check each other.
--
-- Three properties carry the trust model:
--   1. A submission is immutable. There is no update path for shooters (see
--      the RLS migration); a wrong entry is corrected by a referee via
--      adjusted_total, which leaves the original visible.
--   2. Nobody sees the opponent's row until both rows exist. That is enforced
--      by RLS against bouts.state, not by the client.
--   3. The photo is mandatory. Without it there is nothing for the opponent to
--      verify, and verification is what replaces automated scoring here.

create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  bout_id         uuid not null references public.bouts (id) on delete cascade,
  shooter_id      uuid not null references public.profiles (id),

  -- Reported by the shooter. Authoritative unless a referee adjusts it.
  total           numeric(5, 1) not null,
  -- Shots scoring 10 or better. Keeps the ISSF-style tiebreak working without
  -- asking for the full series, and gives the total a second value to be
  -- consistent with.
  tens            integer not null check (tens >= 0),

  -- Optional, from a file export or a shooter who wants the detail. When
  -- present it must agree with total and tens.
  shots           numeric(3, 1)[],

  -- Referee correction. Effective score is coalesce(adjusted_total, total).
  adjusted_total  numeric(5, 1),
  adjusted_by     uuid references public.profiles (id),
  adjusted_reason text,

  photo_path      text not null,
  capture_method  public.capture_method not null default 'in_app_camera',
  source          public.submission_source not null default 'manual',
  -- Raw payload for file_export / device_api submissions, kept verbatim so a
  -- referee can see what the range actually produced.
  source_payload  jsonb,

  -- When the series was actually fired, read off the printout or the display.
  -- Must fall inside the bout window; this is the cheapest replay check.
  shot_at         timestamptz not null,
  submitted_at    timestamptz not null default now(),
  state           public.submission_state not null default 'submitted',

  unique (bout_id, shooter_id),
  constraint submissions_adjustment_complete
    check ((adjusted_total is null) = (adjusted_by is null))
);

create index submissions_shooter_idx on public.submissions (shooter_id);
create index submissions_bout_idx on public.submissions (bout_id);

create or replace function public.submission_effective_total(public.submissions)
returns numeric
language sql
immutable
as $$
  select coalesce($1.adjusted_total, $1.total);
$$;

-- Validates a submission against the bout and the discipline it belongs to.
--
-- With shots supplied, the array is authoritative and total/tens must match it
-- exactly — that is the checksum a file export gets for free. Without shots,
-- total and tens must at least be arithmetically compatible with each other:
-- t shots of 10 or better and the rest below 10 bound the achievable total from
-- both sides. It will not catch a deliberate lie, but it catches a slipped
-- digit, which is the realistic failure mode.
create or replace function public.validate_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bout       public.bouts%rowtype;
  v_match      public.matches%rowtype;
  v_discipline public.disciplines%rowtype;
  v_shot       numeric;
  v_sum        numeric;
  v_tens       integer;
  v_sub_ten    numeric;   -- highest value strictly below 10 in this discipline
  v_min_total  numeric;
  v_max_total  numeric;
begin
  select * into v_bout from public.bouts where id = new.bout_id for update;
  if not found then
    raise exception 'unknown bout %', new.bout_id using errcode = 'foreign_key_violation';
  end if;

  select * into v_match from public.matches where id = v_bout.match_id;
  select * into v_discipline from public.disciplines where id = v_match.discipline_id;

  if new.shooter_id not in (v_match.shooter_a, v_match.shooter_b) then
    raise exception 'shooter % is not a participant of match %', new.shooter_id, v_match.id
      using errcode = 'check_violation';
  end if;

  if v_bout.state not in ('open', 'awaiting_opponent') then
    raise exception 'bout % does not accept submissions (state=%)', v_bout.id, v_bout.state
      using errcode = 'check_violation';
  end if;

  if now() > v_bout.closes_at then
    raise exception 'bout % closed at %', v_bout.id, v_bout.closes_at
      using errcode = 'check_violation';
  end if;

  -- ------------------------------------------------------------ the numbers
  if new.tens > v_discipline.shot_count then
    raise exception 'tens (%) cannot exceed the % shots of discipline %',
      new.tens, v_discipline.shot_count, v_discipline.code
      using errcode = 'check_violation';
  end if;

  if new.total < 0 or new.total > v_discipline.shot_count * v_discipline.max_shot_value then
    raise exception 'total % outside 0..% for discipline %',
      new.total, v_discipline.shot_count * v_discipline.max_shot_value, v_discipline.code
      using errcode = 'check_violation';
  end if;

  if v_discipline.scoring_mode = 'integer' and new.total <> trunc(new.total) then
    raise exception 'discipline % scores whole rings, got total %', v_discipline.code, new.total
      using errcode = 'check_violation';
  end if;

  v_sub_ten := case when v_discipline.scoring_mode = 'integer' then 9.0 else 9.9 end;
  v_min_total := new.tens * 10.0;
  v_max_total := new.tens * v_discipline.max_shot_value
                 + (v_discipline.shot_count - new.tens) * v_sub_ten;

  if new.total < v_min_total or new.total > v_max_total then
    raise exception
      'total % is not reachable with % ten(s) in discipline % (expected % .. %)',
      new.total, new.tens, v_discipline.code, v_min_total, v_max_total
      using errcode = 'check_violation';
  end if;

  -- ---------------------------------------------- optional individual shots
  if new.shots is not null then
    if array_length(new.shots, 1) is distinct from v_discipline.shot_count then
      raise exception 'discipline % expects % shots, got %',
        v_discipline.code, v_discipline.shot_count, coalesce(array_length(new.shots, 1), 0)
        using errcode = 'check_violation';
    end if;

    foreach v_shot in array new.shots loop
      if v_shot < 0 or v_shot > v_discipline.max_shot_value then
        raise exception 'shot value % outside 0..% for discipline %',
          v_shot, v_discipline.max_shot_value, v_discipline.code
          using errcode = 'check_violation';
      end if;
      if v_discipline.scoring_mode = 'integer' and v_shot <> trunc(v_shot) then
        raise exception 'discipline % scores whole rings, got %', v_discipline.code, v_shot
          using errcode = 'check_violation';
      end if;
    end loop;

    select sum(s), count(*) filter (where s >= 10.0)
      into v_sum, v_tens
      from unnest(new.shots) as s;

    if v_sum <> new.total then
      raise exception 'shots add up to % but total says %', v_sum, new.total
        using errcode = 'check_violation';
    end if;
    if v_tens <> new.tens then
      raise exception 'shots contain % ten(s) but tens says %', v_tens, new.tens
        using errcode = 'check_violation';
    end if;
  end if;

  -- The series must have been fired inside the bout window. One hour of slack
  -- absorbs clock drift on range printers.
  if new.shot_at < v_bout.opens_at - interval '1 hour' or new.shot_at > now() + interval '1 hour' then
    raise exception 'shot_at % is outside the bout window (% .. now)', new.shot_at, v_bout.opens_at
      using errcode = 'check_violation';
  end if;

  new.state := 'submitted';
  new.submitted_at := now();
  new.adjusted_total := null;
  new.adjusted_by := null;

  return new;
end;
$$;

create trigger submissions_validate
  before insert on public.submissions
  for each row execute function public.validate_submission();

-- Blind reveal. The second submission flips the bout to 'revealed', which is
-- the condition the RLS select policy checks. Until then neither shooter can
-- read the other's row, and neither knows what they have to beat.
create or replace function public.reveal_bout_when_complete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count         integer;
  v_confirm_hours integer;
begin
  select count(*) into v_count from public.submissions where bout_id = new.bout_id;

  if v_count = 1 then
    update public.bouts set state = 'awaiting_opponent' where id = new.bout_id;
  elsif v_count >= 2 then
    select f.confirm_hours into v_confirm_hours
      from public.bouts b
      join public.matches m on m.id = b.match_id
      join public.formats f on f.id = m.format_id
     where b.id = new.bout_id;

    update public.bouts
       set state = 'revealed',
           revealed_at = now(),
           confirm_closes_at = now() + make_interval(hours => v_confirm_hours)
     where id = new.bout_id;

    update public.submissions set state = 'revealed' where bout_id = new.bout_id;

    perform public.settle_bout(new.bout_id);
  end if;

  return new;
end;
$$;

-- Trigger is attached in the settlement migration, once settle_bout exists.

-- Peer verification. With no automated scoring in the loop, this is the check:
-- each shooter looks at the opponent's photo and says whether the reported
-- numbers match it. Accepting is the normal path; disputing opens a referee
-- case. Letting the window lapse auto-accepts but counts against the shooter.
create table public.bout_confirmations (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.submissions (id) on delete cascade,
  confirmed_by   uuid not null references public.profiles (id),
  accepted       boolean not null,
  is_auto        boolean not null default false,
  note           text,
  created_at     timestamptz not null default now(),

  unique (submission_id, confirmed_by)
);

create index bout_confirmations_submission_idx on public.bout_confirmations (submission_id);
