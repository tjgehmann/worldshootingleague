-- Submissions: the shot values a shooter uploads for one bout.
--
-- Two properties carry the whole trust model:
--   1. A submission is immutable. There is no update path for shooters (see
--      the RLS migration); a wrong entry is corrected by a referee via
--      adjusted_total, which leaves the original visible.
--   2. Nobody sees the opponent's row until both rows exist. That is enforced
--      by RLS against bouts.state, not by the client.

create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  bout_id         uuid not null references public.bouts (id) on delete cascade,
  shooter_id      uuid not null references public.profiles (id),

  shots           numeric(3, 1)[] not null,
  -- Derived in the validation trigger, never trusted from the client.
  total           numeric(5, 1) not null default 0,
  tens            integer not null default 0,

  -- Referee correction. Effective score is coalesce(adjusted_total, total).
  adjusted_total  numeric(5, 1),
  adjusted_by     uuid references public.profiles (id),
  adjusted_reason text,

  photo_path      text,
  source          public.submission_source not null default 'photo_ocr',
  ocr_confidence  numeric(4, 3) check (ocr_confidence between 0 and 1),
  ocr_payload     jsonb,

  -- When the series was actually fired, read off the printout or EXIF.
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

-- Validates a submission against the bout it belongs to and computes the
-- derived score columns. Everything a client sends other than shots, photo
-- and shot_at is overwritten here.
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

  -- The series must have been fired inside the bout window. One hour of slack
  -- absorbs clock drift on range printers.
  if new.shot_at < v_bout.opens_at - interval '1 hour' or new.shot_at > now() + interval '1 hour' then
    raise exception 'shot_at % is outside the bout window (% .. now)', new.shot_at, v_bout.opens_at
      using errcode = 'check_violation';
  end if;

  new.total := (select sum(s) from unnest(new.shots) as s);
  new.tens  := (select count(*) from unnest(new.shots) as s where s >= 10.0);
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
-- read the other's row.
create or replace function public.reveal_bout_when_complete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.submissions where bout_id = new.bout_id;

  if v_count = 1 then
    update public.bouts set state = 'awaiting_opponent' where id = new.bout_id;
  elsif v_count >= 2 then
    update public.bouts
       set state = 'revealed', revealed_at = now()
     where id = new.bout_id;

    update public.submissions set state = 'revealed' where bout_id = new.bout_id;

    perform public.settle_bout(new.bout_id);
  end if;

  return new;
end;
$$;

-- Trigger is attached in the settlement migration, once settle_bout exists.

-- Peer confirmation of the opponent's printout after reveal. Accepting is the
-- default path; disputing opens a referee case.
create table public.bout_confirmations (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.submissions (id) on delete cascade,
  confirmed_by   uuid not null references public.profiles (id),
  accepted       boolean not null,
  note           text,
  created_at     timestamptz not null default now(),

  unique (submission_id, confirmed_by)
);
