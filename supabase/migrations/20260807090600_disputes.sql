-- Referee cases.
--
-- An open dispute blocks finalize_match, so ratings never move on a result
-- that is still contested.

create table public.disputes (
  id              uuid primary key default gen_random_uuid(),
  bout_id         uuid not null references public.bouts (id) on delete cascade,
  match_id        uuid not null references public.matches (id) on delete cascade,
  raised_by       uuid not null references public.profiles (id),
  reason          text not null check (char_length(reason) between 10 and 1000),
  state           public.dispute_state not null default 'open',
  referee_id      uuid references public.profiles (id),
  assigned_at     timestamptz,
  resolution_note text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One open case per bout and complainant.
  constraint disputes_referee_assigned
    check ((state = 'open') = (referee_id is null))
);

create unique index disputes_one_open_per_bout
  on public.disputes (bout_id)
  where state in ('open', 'assigned');

create index disputes_queue_idx on public.disputes (state, created_at)
  where state in ('open', 'assigned');
create index disputes_match_idx on public.disputes (match_id);

create trigger disputes_set_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();

-- Raising a dispute pulls the bout and the match out of the settlement path.
create or replace function public.on_dispute_opened()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.bouts set state = 'disputed' where id = new.bout_id;
  update public.matches set state = 'awaiting_review' where id = new.match_id;
  update public.submissions set state = 'disputed' where bout_id = new.bout_id;
  return new;
end;
$$;

create trigger disputes_open
  after insert on public.disputes
  for each row execute function public.on_dispute_opened();
