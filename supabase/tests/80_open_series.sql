\set ON_ERROR_STOP off
\pset tuples_only on

-- Shooting without waiting to be paired: declare, shoot, report, and get
-- compared with whoever else has reported.

insert into auth.users (id, email, raw_user_meta_data) values
  ('50000000-0000-0000-0000-000000000001','os1@x.de',
   '{"handle":"os_one","display_name":"Ola Eins","date_of_birth":"1990-01-01"}'),
  ('50000000-0000-0000-0000-000000000002','os2@x.de',
   '{"handle":"os_two","display_name":"Ola Zwei","date_of_birth":"1990-01-01"}'),
  ('50000000-0000-0000-0000-000000000003','os3@x.de',
   '{"handle":"os_three","display_name":"Ola Drei","date_of_birth":"1990-01-01"}');

-- Ratings so the matching has something to sort on: one and three are close,
-- two is a long way off. The pairing must prefer the near one.
insert into public.ratings (shooter_id, discipline_id, rating, matches_played)
select '50000000-0000-0000-0000-000000000001', id, 1600, 10
  from public.disciplines where code = 'AR10ET';
insert into public.ratings (shooter_id, discipline_id, rating, matches_played)
select '50000000-0000-0000-0000-000000000002', id, 1200, 10
  from public.disciplines where code = 'AR10ET';
insert into public.ratings (shooter_id, discipline_id, rating, matches_played)
select '50000000-0000-0000-0000-000000000003', id, 1590, 10
  from public.disciplines where code = 'AR10ET';

-- ================================= 1. the first shooter has nobody to beat ===
set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';

select public.declare_open_series((select id from public.disciplines where code = 'AR10ET'))
  as first_series \gset

select 'declared, state: ' || state || ', window ' ||
       round(extract(epoch from (report_by - opens_at)) / 60)::text || ' minutes'
  from public.open_series where id = :'first_series';

-- expect failure: a series shot before the window was opened
select public.report_open_series(:'first_series', 103.4, null,
  :'first_series' || '/a/x.jpg', now() - interval '2 hours');

select 'reported: ' || (public.report_open_series(:'first_series', 103.4, null,
  :'first_series' || '/a/x.jpg', now()) is not null)::text;

select 'waiting: ' || state || ', matched to ' ||
       coalesce(match_id::text, 'nobody yet')
  from public.open_series where id = :'first_series';

-- expect failure: reporting the same series twice
select public.report_open_series(:'first_series', 107.0, null,
  :'first_series' || '/b/x.jpg', now());

-- expect failure: two live declarations at once would be two windows to choose
select public.declare_open_series((select id from public.disciplines where code = 'AR10ET'));

reset role;
reset request.jwt.claim.sub;

-- ==================== 2. the second shooter is matched against the waiting ===
-- Deliberately the distant rating: whoever reports next gets whoever is there.
-- Making the second shooter wait for a closer opponent would be the waiting
-- this whole mechanism exists to remove, and Glicko-2 makes a mismatch cheap —
-- beating somebody 400 points below you is worth almost nothing.
set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select public.declare_open_series((select id from public.disciplines where code = 'AR10ET'))
  as far_series \gset
select public.report_open_series(:'far_series', 96.2, null, :'far_series' || '/a/x.jpg', now());

reset role;
reset request.jwt.claim.sub;

select 'the waiting series was taken: ' || state from public.open_series where id = :'first_series';
select 'and so was the one that took it: ' || state from public.open_series where id = :'far_series';

select 'the match settled itself: ' || state || ', decided_by ' || coalesce(decided_by::text, '-')
  from public.matches
 where id = (select match_id from public.open_series where id = :'first_series');

select 'and it belongs to no season: ' || (season_id is null and round_id is null)::text
  from public.matches
 where id = (select match_id from public.open_series where id = :'first_series');

select 'the better series won: ' || (winner_id = '50000000-0000-0000-0000-000000000001')::text
  from public.matches
 where id = (select match_id from public.open_series where id = :'first_series');

select 'both scores are on the bout: ' || count(*)::text
  from public.submissions s
  join public.bouts b on b.id = s.bout_id
 where b.match_id = (select match_id from public.open_series where id = :'first_series');

select 'neither could have seen the other: both shot before the match existed: ' ||
       bool_and(s.shot_at <= m.created_at)::text
  from public.submissions s
  join public.bouts b on b.id = s.bout_id
  join public.matches m on m.id = b.match_id
 where m.id = (select match_id from public.open_series where id = :'first_series');

-- ============================================ 3. it is rated like any other ==
update public.matches set dispute_closes_at = now() - interval '1 minute'
 where id = (select match_id from public.open_series where id = :'first_series');

select 'finalized: ' || public.finalize_match(
  (select match_id from public.open_series where id = :'first_series'))::text;

select 'the winner gained: ' || (rating > 1600)::text
  from public.ratings
 where shooter_id = '50000000-0000-0000-0000-000000000001'
   and discipline_id = (select id from public.disciplines where code = 'AR10ET');

-- ================================= 4. nobody waiting means nobody is paired ==
set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000003';
select public.declare_open_series((select id from public.disciplines where code = 'AR10ET'))
  as third_series \gset
select public.report_open_series(:'third_series', 101.9, null, :'third_series' || '/a/x.jpg', now());
reset role;
reset request.jwt.claim.sub;

select 'alone, so it waits: ' || state from public.open_series where id = :'third_series';

-- Somebody they have not played turns up, and the two are compared.
set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
select public.declare_open_series((select id from public.disciplines where code = 'AR10ET'))
  as again_one \gset
select public.report_open_series(:'again_one', 104.0, null, :'again_one' || '/c/x.jpg', now());
reset role;
reset request.jwt.claim.sub;

select 'a new opponent, so it is taken: ' || state from public.open_series where id = :'third_series';

-- ============================== 5. but not the same two again straight away ==
set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
select public.declare_open_series((select id from public.disciplines where code = 'AR10ET'))
  as rematch_one \gset
select public.report_open_series(:'rematch_one', 103.0, null, :'rematch_one' || '/d/x.jpg', now());
reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000003';
select public.declare_open_series((select id from public.disciplines where code = 'AR10ET'))
  as rematch_three \gset
select public.report_open_series(:'rematch_three', 100.0, null, :'rematch_three' || '/d/x.jpg', now());
reset role;
reset request.jwt.claim.sub;

select 'the two who just met both wait instead: ' ||
       (count(*) filter (where state = 'reported') = 2)::text
  from public.open_series where id in (:'rematch_one', :'rematch_three');

select 'and the tick does not force them together either: ' ||
       (public.run_league_tick() ->> 'open_series_matched');

-- =================================================== 5. giving up on one ====
set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';
select public.declare_open_series((select id from public.disciplines where code = 'AP10ET'))
  as pistol \gset

-- expect failure: whole rings, and inner tens are required for pistol
select public.report_open_series(:'pistol', 95.4, 4, :'pistol' || '/a/x.jpg', now());

-- expect failure: eleven inner tens in a ten shot series
select public.report_open_series(:'pistol', 94, 11, :'pistol' || '/a/x.jpg', now());

select public.withdraw_open_series(:'pistol');
select 'withdrawn: ' || state from public.open_series where id = :'pistol';

reset role;
reset request.jwt.claim.sub;

-- The whole tick object, so a missing key shows up as a missing key rather than
-- as a blank line. This is what caught scheduling.sql being applied last and
-- quietly overwriting every later version of run_league_tick().
select 'the tick reports on every job: ' ||
       (select bool_and(public.run_league_tick() ? k)
          from unnest(array['rounds_paired','open_series_matched','bouts_expired',
                            'matches_voided','confirmations_lapsed','reminders_queued',
                            'matches_finalized']) as k)::text;

-- ================== 6. late is late for the ladder, not for the shooter ======
-- The queue on the phone may hold a report while there is no signal, but the
-- deadline is the server's. A client that says it tried in time proves nothing:
-- the set of series somebody can choose between is everything they shot between
-- declaring and the report arriving, so only arrival can bound it.
--
-- What that buys is the right to be compared, and nothing else. A late report
-- is still a series somebody fired, so it is kept as practice: in their own
-- record, never offered to the matcher, never near a rating.
set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select public.declare_open_series((select id from public.disciplines where code = 'SBR10ET'))
  as late_series \gset

reset role;
reset request.jwt.claim.sub;

update public.open_series
   set opens_at = now() - interval '3 hours',
       report_by = now() - interval '1 hour'
 where id = :'late_series';

set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select 'a late report lands as ' ||
       public.report_open_series(:'late_series', 102.0, null,
         :'late_series' || '/a/x.jpg', now() - interval '2 hours');

reset role;
reset request.jwt.claim.sub;

select 'and the numbers were kept: ' || (total is not null)::text ||
       ', matchable: ' || (state = 'reported')::text
  from public.open_series where id = :'late_series';

select 'the shooter was told: ' || count(*)::text
  from public.notifications
 where shooter_id = '50000000-0000-0000-0000-000000000002'
   and kind = 'open_series_expired';

select 'and it counts as practice: ' || practice::text
  from public.shooter_form('50000000-0000-0000-0000-000000000002')
 where discipline_code = 'SBR10ET';

-- The matcher must not see it however many times the tick runs.
select 'after the tick: ' || (public.run_league_tick() is not null)::text;
select 'still let go: ' || state from public.open_series where id = :'late_series';

-- A day later there is nothing left to record: at that distance a declaration
-- is a notebook to be filled in at leisure rather than a series being shot.
set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select public.declare_open_series((select id from public.disciplines where code = 'SBR10ET'))
  as stale_series \gset

reset role;
reset request.jwt.claim.sub;

update public.open_series
   set opens_at = now() - interval '3 days',
       report_by = now() - interval '3 days' + interval '2 hours'
 where id = :'stale_series';

set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

-- expect failure: three days is not a walk back up the stairs
select public.report_open_series(:'stale_series', 102.0, null,
  :'stale_series' || '/a/x.jpg', now() - interval '3 days');

-- And a series the shooter said they were not shooting stays not shot.
select public.declare_open_series((select id from public.disciplines where code = 'AP10ET'))
  as dropped_series \gset

select public.withdraw_open_series(:'dropped_series');

-- expect failure: withdrawn is a decision, not a window running out
select public.report_open_series(:'dropped_series', 95, 4,
  :'dropped_series' || '/a/x.jpg', now());

reset role;
reset request.jwt.claim.sub;

-- ================================ 7. both shooters are told it was compared ==
-- The comparison is the payoff, so it has to reach them. An open series match
-- settles the instant the second report lands, which is an ordinary state
-- change on matches — so the existing settle trigger carries it.
select 'both were told: ' || count(*)::text
  from public.notifications n
 where n.match_id = (select match_id from public.open_series where id = :'first_series')
   and n.kind = 'match_settled';

-- And it shows up where anyone can see a finished match, without a season.
select 'the public results carry it: ' || count(*)::text
  from public.match_results
 where match_id = (select match_id from public.open_series where id = :'first_series');

-- ===================== 8. a series nobody answered still counts for its owner ==
-- Shooting is a measurement whether or not somebody was there to compare with.
-- It goes into the shooter's own record in full; it does not go into the
-- rating, because the only reason to believe a reported number is that the
-- opponent looked at the photograph.
select 'form counts the compared and the practice: ' || series::text ||
       ' series, ' || compared::text || ' compared, ' || practice::text || ' practice'
  from public.shooter_form('50000000-0000-0000-0000-000000000001')
 where discipline_code = 'AR10ET';

select 'and it has an average: ' || (average is not null)::text
  from public.shooter_form('50000000-0000-0000-0000-000000000001')
 where discipline_code = 'AR10ET';

-- The warning before submitting uses the same record, so practice counts there.
select 'the pre-submit check sees ' || series::text || ' recent series'
  from public.shooter_recent_form(
    '50000000-0000-0000-0000-000000000001',
    (select id from public.disciplines where code = 'AR10ET'), 10);

-- Letting a series go says so rather than being silent about it.
update public.open_series
   set reported_at = now() - interval '20 days'
 where id = :'rematch_one';

select 'the sweep let it go and said so: ' ||
       (public.match_open_series() >= 0)::text;

select 'told: ' || count(*)::text
  from public.notifications
 where shooter_id = '50000000-0000-0000-0000-000000000001'
   and kind = 'open_series_expired';

select 'the rating did not move for it: ' || (
  (select count(*) from public.rating_events re
    join public.matches m on m.id = re.match_id
   where re.shooter_id = '50000000-0000-0000-0000-000000000001'
     and m.season_id is null) <= 1)::text;

-- ================================================== 9. what the beta reports ==
set role authenticated;
set request.jwt.claim.sub = 'acc00000-0000-0000-0000-00000000000a';

select 'health: ' || metric || ' = ' || coalesce(value::text, 'n/a')
  from public.beta_health(30)
 where metric like 'series%' or metric like 'hours_to%' or metric = 'reachable'
    or metric like 'disputes_%' or metric = 'window_used';

select 'backlog: ' || metric || ' = ' || value::text
  from public.beta_backlog() where metric = 'series_waiting';

reset role;
reset request.jwt.claim.sub;

-- Both submissions of an open series match land in one statement, so the reveal
-- trigger fires twice with both rows visible. It must not undo the settlement
-- the first firing caused: a bout left 'revealed' under a settled match is
-- invisible to everything that counts series by bout state.
select 'the bout ended settled, not revealed: ' ||
       (count(*) filter (where b.state = 'settled') = count(*))::text ||
       ' (' || string_agg(distinct b.state::text, ',') || ')'
  from public.submissions s
  join public.bouts b on b.id = s.bout_id
  join public.matches m on m.id = b.match_id
 where s.shooter_id = '50000000-0000-0000-0000-000000000001'
   and m.season_id is null;
