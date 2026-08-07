-- Catalog tables: what can be shot, and how a match is scored.
--
-- Both are data, not code. Adding "AP10ET best of seven" must be an INSERT,
-- not a migration.

create table public.disciplines (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[A-Z0-9]{4,12}$'),
  name           text not null,
  weapon_group   text not null check (weapon_group in ('rifle', 'pistol')),
  distance_m     integer not null check (distance_m > 0),
  position       text not null check (position in ('standing', 'prone', 'kneeling')),
  shot_count     integer not null check (shot_count between 5 and 60),
  scoring_mode   public.scoring_mode not null,
  max_shot_value numeric(3, 1) not null check (max_shot_value > 0),
  -- Everything in the league is shot on electronic targets; the column exists
  -- so a paper-target variant can be added without another migration.
  target_system  text not null default 'electronic',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

comment on column public.disciplines.max_shot_value is
  'Highest value a single shot can carry: 10.9 for decimal rifle, 10 for integer pistol.';

create table public.formats (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  bout_count      integer not null check (bout_count between 1 and 9),
  -- Match points needed to win. best_of_five => 3.0 (win 1.0, tie 0.5).
  points_to_win   numeric(3, 1) not null check (points_to_win > 0),
  win_points      numeric(3, 1) not null default 1.0,
  tie_points      numeric(3, 1) not null default 0.5,
  progression     public.bout_progression not null default 'parallel',
  -- How long a match window stays open once it goes live.
  window_hours    integer not null default 168 check (window_hours between 1 and 1440),
  -- Grace period after settlement in which either side may call a referee.
  dispute_hours   integer not null default 24 check (dispute_hours between 0 and 336),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),

  constraint formats_points_reachable
    check (points_to_win <= bout_count * win_points)
);

comment on column public.formats.progression is
  'parallel: all bouts open at once, shooter can fire the whole match in one range '
  'session. sequential: bout n+1 opens when bout n is revealed. Async play makes '
  'sequential slow (one waiting cycle per bout), so parallel is the default.';
