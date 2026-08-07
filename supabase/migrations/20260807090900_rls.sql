-- Row Level Security.
--
-- The blind reveal is enforced here and nowhere else. A client holding a valid
-- JWT still cannot read the opponent's submission until bouts.state says both
-- results are in, so tampering with the app buys nothing.

-- ---------------------------------------------------------------- helpers ---

create or replace function public.is_referee(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = p_uid and role in ('referee', 'admin')
  );
$$;

create or replace function public.is_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles where id = p_uid and role = 'admin');
$$;

create or replace function public.is_match_participant(p_match_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.matches
     where id = p_match_id and p_uid in (shooter_a, shooter_b)
  );
$$;

-- True once both sides are in and the results may be shown to the two shooters.
create or replace function public.bout_is_revealed(p_bout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.bouts
     where id = p_bout_id
       and state in ('revealed', 'settled', 'disputed', 'forfeited', 'void')
  );
$$;

create or replace function public.can_submit_to_bout(p_bout_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.bouts b
      join public.matches m on m.id = b.match_id
      join public.profiles p on p.id = p_uid
     where b.id = p_bout_id
       and b.state in ('open', 'awaiting_opponent')
       and b.closes_at > now()
       and p_uid in (m.shooter_a, m.shooter_b)
       and (p.banned_until is null or p.banned_until < now())
       and not exists (
         select 1 from public.submissions s
          where s.bout_id = b.id and s.shooter_id = p_uid
       )
  );
$$;

-- Referees only see the material of cases they are actually on.
create or replace function public.is_assigned_referee(p_bout_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.disputes
     where bout_id = p_bout_id
       and state in ('open', 'assigned')
       and (referee_id = p_uid or (referee_id is null and public.is_referee(p_uid)))
  );
$$;

-- ------------------------------------------------------------- privileges ---

revoke all on all tables in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on
  public.disciplines, public.formats, public.seasons, public.rounds,
  public.season_entries, public.matches, public.bouts,
  public.ratings, public.rating_events, public.profiles
  to anon, authenticated;

grant insert on public.season_entries, public.submissions,
                public.bout_confirmations, public.disputes to authenticated;
grant select on public.submissions, public.bout_confirmations, public.disputes to authenticated;
grant update (display_name, country_code, club, avatar_path, bio, equipment, is_public, handle)
  on public.profiles to authenticated;
grant update (adjusted_total, adjusted_by, adjusted_reason, state) on public.submissions to authenticated;
grant update (state, referee_id, assigned_at, resolution_note, resolved_at) on public.disputes to authenticated;
grant update (withdrawn_at) on public.season_entries to authenticated;

-- Ratings, matches and bouts are written by security-definer functions only.

-- ------------------------------------------------------------- policies -----

alter table public.profiles           enable row level security;
alter table public.disciplines        enable row level security;
alter table public.formats            enable row level security;
alter table public.seasons            enable row level security;
alter table public.rounds             enable row level security;
alter table public.season_entries     enable row level security;
alter table public.matches            enable row level security;
alter table public.bouts              enable row level security;
alter table public.submissions        enable row level security;
alter table public.bout_confirmations enable row level security;
alter table public.disputes           enable row level security;
alter table public.ratings            enable row level security;
alter table public.rating_events      enable row level security;

-- Catalog and schedule are public reading material.
create policy catalog_read_disciplines on public.disciplines for select using (true);
create policy catalog_read_formats     on public.formats     for select using (true);
create policy catalog_read_seasons     on public.seasons     for select using (state <> 'draft' or public.is_admin());
create policy catalog_read_rounds      on public.rounds      for select using (true);
create policy read_season_entries      on public.season_entries for select using (true);
create policy read_matches             on public.matches     for select using (true);
create policy read_bouts               on public.bouts       for select using (true);
create policy read_ratings             on public.ratings     for select using (true);
create policy read_rating_events       on public.rating_events for select using (true);

create policy read_profiles on public.profiles
  for select using (is_public or id = auth.uid() or public.is_referee());

create policy update_own_profile on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy join_season on public.season_entries
  for insert to authenticated
  with check (
    shooter_id = auth.uid()
    and exists (
      select 1 from public.seasons s
       where s.id = season_id
         and s.state = 'registration'
         and now() >= s.registration_opens_at
         and (s.max_entries is null or (
           select count(*) from public.season_entries e where e.season_id = s.id
         ) < s.max_entries)
    )
  );

create policy withdraw_own_entry on public.season_entries
  for update to authenticated
  using (shooter_id = auth.uid()) with check (shooter_id = auth.uid());

-- The blind reveal, in three clauses.
create policy read_own_submission on public.submissions
  for select to authenticated
  using (shooter_id = auth.uid());

create policy read_opponent_submission_after_reveal on public.submissions
  for select to authenticated
  using (
    public.bout_is_revealed(bout_id)
    and exists (
      select 1 from public.bouts b
       where b.id = submissions.bout_id
         and public.is_match_participant(b.match_id, auth.uid())
    )
  );

create policy read_submission_as_referee on public.submissions
  for select to authenticated
  using (public.is_assigned_referee(bout_id));

create policy insert_own_submission on public.submissions
  for insert to authenticated
  with check (
    shooter_id = auth.uid()
    and public.can_submit_to_bout(bout_id, auth.uid())
  );

-- No update or delete policy for shooters: a submission is final. Referees get
-- the adjusted_* columns only (column grant above).
create policy adjust_submission_as_referee on public.submissions
  for update to authenticated
  using (public.is_assigned_referee(bout_id))
  with check (public.is_assigned_referee(bout_id));

create policy read_confirmations on public.bout_confirmations
  for select to authenticated
  using (
    exists (
      select 1 from public.submissions s join public.bouts b on b.id = s.bout_id
       where s.id = submission_id and public.is_match_participant(b.match_id, auth.uid())
    )
    or public.is_referee()
  );

create policy insert_confirmation on public.bout_confirmations
  for insert to authenticated
  with check (
    confirmed_by = auth.uid()
    and not is_auto                              -- only expire_confirmations() sets that
    and exists (
      select 1 from public.submissions s join public.bouts b on b.id = s.bout_id
       where s.id = submission_id
         and s.shooter_id <> auth.uid()          -- you confirm the other side
         and public.bout_is_revealed(b.id)
         and public.is_match_participant(b.match_id, auth.uid())
    )
  );

create policy read_disputes on public.disputes
  for select to authenticated
  using (public.is_match_participant(match_id, auth.uid()) or public.is_referee());

create policy raise_dispute on public.disputes
  for insert to authenticated
  with check (
    raised_by = auth.uid()
    and public.is_match_participant(match_id, auth.uid())
    and public.bout_is_revealed(bout_id)
    and exists (
      select 1 from public.matches m
       where m.id = match_id
         and (m.dispute_closes_at is null or now() < m.dispute_closes_at)
         and m.state in ('live', 'settled')
    )
  );

create policy handle_dispute_as_referee on public.disputes
  for update to authenticated
  using (public.is_referee()) with check (public.is_referee());

-- --------------------------------------------------------------- views ------
-- Spectator-facing projections. These run with the owner's rights (no
-- security_invoker), so they can expose settled scores without exposing the
-- submission rows themselves — photos and pending results stay private.

create view public.match_results
with (security_invoker = false) as
  select
    m.id                as match_id,
    m.season_id,
    m.round_id,
    d.code              as discipline,
    f.code              as format,
    m.shooter_a,
    m.shooter_b,
    m.points_a,
    m.points_b,
    m.winner_id,
    m.decided_by,
    m.settled_at,
    m.finalized_at
  from public.matches m
  join public.disciplines d on d.id = m.discipline_id
  join public.formats f on f.id = m.format_id
  where m.state in ('settled', 'finalized');

create view public.leaderboard
with (security_invoker = false) as
  select
    r.discipline_id,
    d.code as discipline,
    p.id   as shooter_id,
    p.handle,
    p.display_name,
    p.country_code,
    r.rating,
    r.rd,
    r.matches_played,
    r.wins,
    r.losses,
    r.draws,
    -- Provisional until the deviation drops; do not rank newcomers against
    -- established shooters on rating alone.
    (r.rd > 110) as is_provisional,
    rank() over (partition by r.discipline_id order by r.rating desc) as position
  from public.ratings r
  join public.profiles p on p.id = r.shooter_id
  join public.disciplines d on d.id = r.discipline_id
  where r.matches_played > 0 and p.is_public;

-- With no automated scoring, peer verification is the check. How reliably a
-- shooter performs it belongs next to their name.
create view public.shooter_reliability
with (security_invoker = false) as
  select
    p.id     as shooter_id,
    p.handle,
    count(c.*)                                          as confirmations_due,
    count(c.*) filter (where not c.is_auto)             as confirmations_given,
    case
      when count(c.*) = 0 then null
      else round(100.0 * count(c.*) filter (where not c.is_auto) / count(c.*))
    end                                                 as confirmation_rate_pct
  from public.profiles p
  left join public.bout_confirmations c on c.confirmed_by = p.id
  where p.is_public
  group by p.id, p.handle;

grant select on public.match_results, public.leaderboard, public.shooter_reliability
  to anon, authenticated;
