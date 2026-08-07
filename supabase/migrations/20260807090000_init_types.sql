-- Enum types and shared helpers.
--
-- Naming: every state a row can be in is an enum, never free text. The
-- settlement functions branch on these, so a typo must fail at write time.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Rifle disciplines on electronic targets score in tenths (max 10.9 per shot),
-- pistol qualification scores whole rings (max 10).
create type public.scoring_mode as enum ('decimal', 'integer');

-- How the bouts of a multi-bout match become available to the shooters.
create type public.bout_progression as enum ('sequential', 'parallel');

create type public.season_state as enum (
  'draft', 'registration', 'running', 'finished', 'archived'
);

create type public.match_state as enum (
  'scheduled',        -- pairing exists, window not open yet
  'live',             -- shooters may submit
  'awaiting_review',  -- a dispute blocks settlement
  'settled',          -- winner known, dispute window still open
  'finalized',        -- dispute window closed, ratings applied
  'void'              -- cancelled, no rating effect
);

create type public.bout_state as enum (
  'pending',            -- exists, not yet open (sequential progression)
  'open',               -- nobody has submitted
  'awaiting_opponent',  -- exactly one submission, results still blind
  'revealed',           -- both submissions in, both sides may now look
  'settled',            -- bout winner recorded
  'disputed',           -- under referee review
  'forfeited',          -- deadline passed with a missing submission
  'void'                -- match already decided, bout no longer needed
);

create type public.submission_state as enum (
  'submitted', 'revealed', 'accepted', 'disputed', 'rejected'
);

-- Where the shot values came from. 'device_api' is reserved for a future
-- direct integration with the target manufacturers.
create type public.submission_source as enum ('photo_ocr', 'manual', 'device_api');

create type public.dispute_state as enum ('open', 'assigned', 'resolved', 'withdrawn');

create type public.decided_by as enum ('score', 'tiebreak', 'forfeit', 'referee', 'walkover');

create type public.shooter_role as enum ('shooter', 'referee', 'admin');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
