-- The operator's handbook, as runnable SQL.
--
-- There is no admin console yet, and for a beta of a few dozen shooters there
-- does not need to be — but there does need to be one place where the handful
-- of things an operator actually does are written down correctly. Run these in
-- the Supabase SQL editor.
--
-- Nothing here is called by the app. Everything here needs the service role.

-- ============================================================ a new season ==
-- Registration opens immediately; the ladder starts on Monday and runs six
-- rounds. Short deliberately: a season nobody finishes teaches nothing.

-- insert into public.seasons
--   (discipline_id, format_id, slug, name, state, round_count,
--    registration_opens_at, starts_at, ends_at, max_entries)
-- select d.id, f.id,
--        'air-rifle-beta-2026', 'Air Rifle Beta 2026',
--        'registration', 6,
--        now(), date_trunc('week', now() + interval '1 week'),
--        date_trunc('week', now() + interval '7 weeks'), 80
--   from public.disciplines d, public.formats f
--  where d.code = 'AR10ET' and f.code = 'best_of_five';

-- Open it for entries, then start it. join_season() accepts entrants in both
-- states, so there is no rush between the two.
-- update public.seasons set state = 'running' where slug = 'air-rifle-beta-2026';

-- ================================================= a round, every Monday ====
-- Creates the round window and draws the pairings. Swiss: closest rating that
-- has not been played yet. Run it once a week — twice is harmless, it does
-- nothing if the round is already paired.

-- insert into public.rounds (season_id, index, opens_at, closes_at)
-- select s.id,
--        coalesce(max(r.index), 0) + 1,
--        now(),
--        now() + interval '7 days'
--   from public.seasons s left join public.rounds r on r.season_id = s.id
--  where s.slug = 'air-rifle-beta-2026'
--  group by s.id;

-- select public.pair_round(id) from public.rounds
--  where season_id = (select id from public.seasons where slug = 'air-rifle-beta-2026')
--  order by index desc limit 1;

-- For a club season, the same thing one level up:
-- select public.pair_team_round(id) from public.rounds ...;

-- ==================================================== the tick, every hour ==
-- Walkovers on missed windows, automatic confirmations, void matches, ratings
-- once the dispute window closes, and the deadline reminders. pg_cron runs
-- this; call it by hand if the extension is not enabled yet.

-- select public.run_league_tick();

-- ================================================= making somebody a referee ==
-- The one role change the app cannot make. A referee sees the case queue and
-- can decide cases; they still cannot see a match they are not on unless a
-- case about it is open.

-- update public.profiles set role = 'referee' where handle = '<handle>';

-- =========================================================== how it is going ==
-- Both need an admin profile, not the service role, so run them as yourself
-- after setting role = 'admin' on your own profile.

-- select * from public.beta_health(30);
-- select * from public.beta_backlog();

-- ====================================================== the deletion queue ==
-- request_account_deletion() has already removed the name, the handle and the
-- date of birth. What is left for a human: the auth row and the photographs.
--
--   1. Photos, per shooter, from the storage API or the dashboard:
--        target-photos/<bout_id>/<shooter_id>/...
--   2. The auth user, from Authentication → Users, or:
--        select auth.uid_delete('<uuid>');   -- if your project exposes it
--   3. Mark it done:

-- select shooter_id, requested_at from public.deletion_requests where completed_at is null;
-- update public.deletion_requests set completed_at = now() where shooter_id = '<uuid>';

-- ===================================================== photo retention ======
-- The privacy notice promises evidence photographs are deleted a set time
-- after the match they belong to is finalised. Until that is a scheduled job,
-- this is the list to work from.

-- select s.photo_path, m.finalized_at
--   from public.submissions s
--   join public.bouts b on b.id = s.bout_id
--   join public.matches m on m.id = b.match_id
--  where m.finalized_at < now() - interval '12 months'
--    and s.photo_path is not null
--  order by m.finalized_at;
