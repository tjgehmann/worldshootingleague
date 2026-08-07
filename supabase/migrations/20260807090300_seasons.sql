-- Seasons, entries and rounds.
--
-- The ladder is the primary product: a shooter joins one season and gets a
-- paired opponent every round. Free-form challenges (matches with no round)
-- are supported by the schema but are not the entry point.

create table public.seasons (
  id                     uuid primary key default gen_random_uuid(),
  discipline_id          uuid not null references public.disciplines (id),
  format_id              uuid not null references public.formats (id),
  slug                   text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  name                   text not null,
  -- null = open to the world. Set for a national ladder.
  country_code           char(2) check (country_code ~ '^[A-Z]{2}$'),
  state                  public.season_state not null default 'draft',
  round_count            integer not null check (round_count between 1 and 26),
  registration_opens_at  timestamptz not null,
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  max_entries            integer check (max_entries > 1),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint seasons_timeline check (registration_opens_at <= starts_at and starts_at < ends_at)
);

create index seasons_state_idx on public.seasons (state) where state in ('registration', 'running');

create trigger seasons_set_updated_at
  before update on public.seasons
  for each row execute function public.set_updated_at();

create table public.season_entries (
  season_id     uuid not null references public.seasons (id) on delete cascade,
  shooter_id    uuid not null references public.profiles (id) on delete cascade,
  joined_at     timestamptz not null default now(),
  -- Rating at the moment of joining, kept so a season table can be rebuilt
  -- even after the live rating has moved on.
  seed_rating   numeric(6, 2),
  withdrawn_at  timestamptz,
  primary key (season_id, shooter_id)
);

create index season_entries_shooter_idx on public.season_entries (shooter_id);

create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.seasons (id) on delete cascade,
  index       integer not null check (index > 0),
  opens_at    timestamptz not null,
  closes_at   timestamptz not null,
  paired_at   timestamptz,
  created_at  timestamptz not null default now(),

  unique (season_id, index),
  constraint rounds_window check (opens_at < closes_at)
);

create index rounds_open_idx on public.rounds (opens_at, closes_at);
