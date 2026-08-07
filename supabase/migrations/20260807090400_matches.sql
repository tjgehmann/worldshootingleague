-- Matches and bouts.
--
-- A match is a pairing between two shooters. A bout is one series of shots
-- (10 for the short formats) inside that match. single_10 has one bout,
-- best_of_five has five.

create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  -- Ladder matches carry round_id + season_id. Free-form challenges carry
  -- neither and are rated but do not count towards a season table.
  round_id        uuid references public.rounds (id) on delete cascade,
  season_id       uuid references public.seasons (id) on delete cascade,
  discipline_id   uuid not null references public.disciplines (id),
  format_id       uuid not null references public.formats (id),
  shooter_a       uuid not null references public.profiles (id),
  shooter_b       uuid not null references public.profiles (id),
  state           public.match_state not null default 'scheduled',
  opens_at        timestamptz not null,
  closes_at       timestamptz not null,

  points_a        numeric(3, 1) not null default 0,
  points_b        numeric(3, 1) not null default 0,
  winner_id       uuid references public.profiles (id),
  decided_by      public.decided_by,
  settled_at      timestamptz,
  -- Ratings are applied here, not at settled_at. See 20260807090800.
  dispute_closes_at timestamptz,
  finalized_at    timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint matches_distinct_shooters check (shooter_a <> shooter_b),
  constraint matches_window check (opens_at < closes_at),
  constraint matches_round_implies_season
    check ((round_id is null) = (season_id is null)),
  constraint matches_winner_is_participant
    check (winner_id is null or winner_id in (shooter_a, shooter_b))
);

create index matches_shooter_a_idx on public.matches (shooter_a, state);
create index matches_shooter_b_idx on public.matches (shooter_b, state);
create index matches_round_idx on public.matches (round_id);
create index matches_season_idx on public.matches (season_id) where season_id is not null;
-- Drives the cron job that closes dispute windows.
create index matches_pending_finalize_idx on public.matches (dispute_closes_at)
  where state = 'settled';

-- One pairing per round. Stored as a normalised pair so (a,b) and (b,a) collide.
create unique index matches_unique_pairing_per_round
  on public.matches (round_id, least(shooter_a::text, shooter_b::text), greatest(shooter_a::text, shooter_b::text))
  where round_id is not null;

create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

create table public.bouts (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches (id) on delete cascade,
  index         integer not null check (index > 0),
  state         public.bout_state not null default 'pending',
  opens_at      timestamptz not null,
  closes_at     timestamptz not null,
  revealed_at   timestamptz,
  -- null winner on a settled bout means the bout was tied.
  winner_id     uuid references public.profiles (id),
  is_tie        boolean not null default false,
  settled_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (match_id, index),
  constraint bouts_window check (opens_at < closes_at),
  constraint bouts_tie_has_no_winner check (not (is_tie and winner_id is not null))
);

create index bouts_match_idx on public.bouts (match_id, index);
-- Drives the cron job that forfeits expired bouts.
create index bouts_expiring_idx on public.bouts (closes_at)
  where state in ('open', 'awaiting_opponent');

create trigger bouts_set_updated_at
  before update on public.bouts
  for each row execute function public.set_updated_at();

-- Creates the bouts for a match according to its format. With 'parallel'
-- progression every bout opens with the match; with 'sequential' only the
-- first one opens and the reveal trigger opens the next.
create or replace function public.create_bouts_for_match()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_format public.formats%rowtype;
  i integer;
begin
  select * into v_format from public.formats where id = new.format_id;

  for i in 1 .. v_format.bout_count loop
    insert into public.bouts (match_id, index, state, opens_at, closes_at)
    values (
      new.id,
      i,
      case
        when new.state <> 'live' then 'pending'
        when v_format.progression = 'parallel' or i = 1 then 'open'
        else 'pending'
      end::public.bout_state,
      new.opens_at,
      new.closes_at
    );
  end loop;

  return new;
end;
$$;

create trigger matches_create_bouts
  after insert on public.matches
  for each row execute function public.create_bouts_for_match();

-- Opening a match opens its bouts (respecting progression).
create or replace function public.propagate_match_open()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_progression public.bout_progression;
begin
  if new.state = 'live' and old.state = 'scheduled' then
    select progression into v_progression from public.formats where id = new.format_id;

    update public.bouts
       set state = 'open'
     where match_id = new.id
       and state = 'pending'
       and (v_progression = 'parallel' or index = 1);
  end if;

  return new;
end;
$$;

create trigger matches_propagate_open
  after update of state on public.matches
  for each row execute function public.propagate_match_open();
