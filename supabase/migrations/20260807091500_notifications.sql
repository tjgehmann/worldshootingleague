-- Notifications.
--
-- In turn-based play this is the retention engine: a match where nobody is told
-- it is their turn simply expires. The database decides *what* is worth telling
-- someone and writes it to an outbox; an edge function drains the outbox and
-- talks to Expo's push service. Nothing here knows about HTTP.

create type public.notification_kind as enum (
  'your_turn',              -- a bout opened and you have not reported
  'opponent_submitted',     -- they went first; you still cannot see their score
  'results_in',             -- both reported, the bout is revealed
  'confirmation_due',       -- their photo is waiting for your check
  'deadline_soon',          -- the window closes within a day
  'match_settled',          -- a winner is recorded
  'dispute_opened',
  'dispute_resolved',
  'round_paired'            -- a new round drew you an opponent
);

create type public.device_platform as enum ('ios', 'android', 'web');

alter table public.profiles add column notify_push boolean not null default true;

revoke update on public.profiles from authenticated;
grant update (display_name, country_code, avatar_path, bio, equipment, is_public,
              handle, primary_club_id, notify_push)
  on public.profiles to authenticated;

create table public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  shooter_id   uuid not null references public.profiles (id) on delete cascade,
  token        text not null unique,
  platform     public.device_platform not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set when Expo reports the token as dead, so it stops being retried.
  disabled_at  timestamptz
);

create index device_tokens_shooter_idx on public.device_tokens (shooter_id)
  where disabled_at is null;

-- The outbox. Rows are written by triggers, drained by the edge function.
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  shooter_id uuid not null references public.profiles (id) on delete cascade,
  kind       public.notification_kind not null,
  title      text not null,
  body       text not null,
  -- Deep-link payload for the client.
  data       jsonb not null default '{}'::jsonb,
  match_id   uuid references public.matches (id) on delete cascade,
  bout_id    uuid references public.bouts (id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  read_at    timestamptz,
  error      text
);

create index notifications_pending_idx on public.notifications (created_at)
  where sent_at is null and error is null;
create index notifications_inbox_idx on public.notifications (shooter_id, created_at desc);

-- One of each kind per bout or match. Without this a deadline sweep every ten
-- minutes would send the same reminder 144 times a day.
create unique index notifications_dedupe
  on public.notifications (shooter_id, kind, coalesce(bout_id, match_id))
  where bout_id is not null or match_id is not null;

-- Returns whether a row was actually queued, so callers can report real work
-- rather than the number of times they asked.
create or replace function public.enqueue_notification(
  p_shooter  uuid,
  p_kind     public.notification_kind,
  p_title    text,
  p_body     text,
  p_data     jsonb default '{}'::jsonb,
  p_match_id uuid default null,
  p_bout_id  uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
begin
  if not exists (
    select 1 from public.profiles where id = p_shooter and notify_push
  ) then
    return false;
  end if;

  insert into public.notifications (shooter_id, kind, title, body, data, match_id, bout_id)
  values (p_shooter, p_kind, p_title, p_body, p_data, p_match_id, p_bout_id)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

create or replace function public.opponent_of(p_match public.matches, p_shooter uuid)
returns uuid
language sql
immutable
as $$
  select case when p_match.shooter_a = p_shooter then p_match.shooter_b else p_match.shooter_a end;
$$;

-- ------------------------------------------------------- the trigger points --

-- Someone reported first. The opponent is told they are up — and deliberately
-- not told what the score was, which is the point of the whole design.
create or replace function public.notify_on_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match     public.matches%rowtype;
  v_opponent  uuid;
  v_name      text;
  v_count     integer;
begin
  select count(*) into v_count from public.submissions where bout_id = new.bout_id;
  if v_count <> 1 then
    return new;  -- the second submission is handled by the reveal
  end if;

  select m.* into v_match
    from public.matches m join public.bouts b on b.match_id = m.id
   where b.id = new.bout_id;

  v_opponent := public.opponent_of(v_match, new.shooter_id);
  select display_name into v_name from public.profiles where id = new.shooter_id;

  perform public.enqueue_notification(
    v_opponent,
    'opponent_submitted',
    v_name || ' has submitted',
    'Your turn. You will see their score once you report yours.',
    jsonb_build_object('route', '/match/' || v_match.id),
    v_match.id,
    new.bout_id
  );

  return new;
end;
$$;

create trigger submissions_notify
  after insert on public.submissions
  for each row execute function public.notify_on_submission();

-- Both are in: results are visible, and each side now owes the other a check.
create or replace function public.notify_on_reveal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match public.matches%rowtype;
  v_sub   record;
begin
  if new.state <> 'revealed' or old.state = 'revealed' then
    return new;
  end if;

  select * into v_match from public.matches where id = new.match_id;

  for v_sub in
    select s.shooter_id from public.submissions s where s.bout_id = new.id
  loop
    perform public.enqueue_notification(
      v_sub.shooter_id,
      'results_in',
      'Results are in',
      'Both scores are visible now. Check your opponent''s photo.',
      jsonb_build_object('route', '/bout/' || new.id || '/confirm'),
      new.match_id,
      new.id
    );
  end loop;

  return new;
end;
$$;

create trigger bouts_notify_reveal
  after update of state on public.bouts
  for each row execute function public.notify_on_reveal();

create or replace function public.notify_on_settle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shooter uuid;
begin
  if new.state <> 'settled' or old.state = 'settled' then
    return new;
  end if;

  foreach v_shooter in array array[new.shooter_a, new.shooter_b] loop
    perform public.enqueue_notification(
      v_shooter,
      'match_settled',
      case when new.winner_id = v_shooter then 'Match won' else 'Match decided' end,
      case when new.winner_id = v_shooter
           then 'You won. It will be rated once the dispute window closes.'
           else 'The match is decided. You can still dispute it.' end,
      jsonb_build_object('route', '/match/' || new.id),
      new.id,
      null
    );
  end loop;

  return new;
end;
$$;

create trigger matches_notify_settle
  after update of state on public.matches
  for each row execute function public.notify_on_settle();

create or replace function public.notify_on_pairing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shooter uuid;
begin
  if new.round_id is null then
    return new;
  end if;

  foreach v_shooter in array array[new.shooter_a, new.shooter_b] loop
    perform public.enqueue_notification(
      v_shooter,
      'round_paired',
      'New round',
      'You have been paired. ' ||
        case when new.board is not null then 'Board ' || new.board || '.' else '' end,
      jsonb_build_object('route', '/match/' || new.id),
      new.id,
      null
    );
  end loop;

  return new;
end;
$$;

create trigger matches_notify_pairing
  after insert on public.matches
  for each row execute function public.notify_on_pairing();

create or replace function public.notify_on_dispute()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id = new.match_id;

  perform public.enqueue_notification(
    public.opponent_of(v_match, new.raised_by),
    'dispute_opened',
    'Your result was disputed',
    'A referee will look at both photos. The match is not rated until then.',
    jsonb_build_object('route', '/match/' || new.match_id),
    new.match_id,
    new.bout_id
  );

  return new;
end;
$$;

create trigger disputes_notify
  after insert on public.disputes
  for each row execute function public.notify_on_dispute();

-- ------------------------------------------------------------- the sweeper --

-- One reminder per bout, a day out. The dedupe index is what keeps this from
-- firing on every tick.
create or replace function public.enqueue_deadline_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in
    select b.id as bout_id, b.match_id, b.closes_at, m.shooter_a, m.shooter_b
      from public.bouts b
      join public.matches m on m.id = b.match_id
     where b.state in ('open', 'awaiting_opponent')
       and b.closes_at between now() and now() + interval '24 hours'
  loop
    -- Only whoever has not reported yet.
    if not exists (
      select 1 from public.submissions
       where bout_id = v_row.bout_id and shooter_id = v_row.shooter_a
    ) and public.enqueue_notification(
        v_row.shooter_a, 'deadline_soon', 'Less than a day left',
        'Report your series or the bout is lost by walkover.',
        jsonb_build_object('route', '/match/' || v_row.match_id),
        v_row.match_id, v_row.bout_id
      ) then
      v_count := v_count + 1;
    end if;

    if not exists (
      select 1 from public.submissions
       where bout_id = v_row.bout_id and shooter_id = v_row.shooter_b
    ) and public.enqueue_notification(
        v_row.shooter_b, 'deadline_soon', 'Less than a day left',
        'Report your series or the bout is lost by walkover.',
        jsonb_build_object('route', '/match/' || v_row.match_id),
        v_row.match_id, v_row.bout_id
      ) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

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
  v_finalized  integer := 0;
  v_match      record;
begin
  v_rounds    := public.open_due_rounds();
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
    'rounds_paired',         v_rounds,
    'bouts_expired',         v_expired,
    'matches_voided',        v_voided,
    'confirmations_lapsed',  v_confirmed,
    'reminders_queued',      v_reminders,
    'matches_finalized',     v_finalized,
    'at', now()
  );
end;
$$;

-- ------------------------------------------------------------------- RLS ----

alter table public.device_tokens enable row level security;
alter table public.notifications enable row level security;

grant select, insert, update (last_seen_at), delete on public.device_tokens to authenticated;
grant select, update (read_at) on public.notifications to authenticated;

create policy manage_own_tokens on public.device_tokens
  for all to authenticated
  using (shooter_id = auth.uid()) with check (shooter_id = auth.uid());

-- Own inbox only, and the outbox columns stay out of reach: a client can mark
-- something read, never mark it sent.
create policy read_own_notifications on public.notifications
  for select to authenticated
  using (shooter_id = auth.uid());

create policy mark_own_notification_read on public.notifications
  for update to authenticated
  using (shooter_id = auth.uid()) with check (shooter_id = auth.uid());
