\set ON_ERROR_STOP on
\pset tuples_only on

-- Six shooters, three per club.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-0000-0000-0000-000000000001','ka1@x.de','{"handle":"ka_one","display_name":"Anna Bauer","date_of_birth":"1990-05-14"}'),
  ('a1111111-0000-0000-0000-000000000002','ka2@x.de','{"handle":"ka_two","display_name":"Ben Fischer","date_of_birth":"1990-05-14"}'),
  ('a1111111-0000-0000-0000-000000000003','ka3@x.de','{"handle":"ka_three","display_name":"Clara Wolf","date_of_birth":"1990-05-14"}'),
  ('b2222222-0000-0000-0000-000000000001','mu1@x.de','{"handle":"mu_one","display_name":"Dirk Hoffmann","date_of_birth":"1990-05-14"}'),
  ('b2222222-0000-0000-0000-000000000002','mu2@x.de','{"handle":"mu_two","display_name":"Eva Krause","date_of_birth":"1990-05-14"}'),
  ('b2222222-0000-0000-0000-000000000003','mu3@x.de','{"handle":"mu_three","display_name":"Felix Lang","date_of_birth":"1990-05-14"}'),
  ('c3333333-0000-0000-0000-000000000001','out@x.de','{"handle":"outsider","display_name":"Gerd Ohne","date_of_birth":"1990-05-14"}');

-- ================================================= 1. founding a club ======
set request.jwt.claim.sub = 'a1111111-0000-0000-0000-000000000001';
select 'club A created: ' || (public.create_club('SV Karlsruhe', 'sv-karlsruhe', 'DE', 'SVK', 'Karlsruhe') is not null);

select 'founder is owner: ' || role from public.club_members
 where shooter_id = 'a1111111-0000-0000-0000-000000000001';

insert into public.club_invites (club_id, code, created_by, expires_at)
select id, 'SVK2026', 'a1111111-0000-0000-0000-000000000001', now() + interval '7 days'
  from public.clubs where slug = 'sv-karlsruhe';

set request.jwt.claim.sub = 'a1111111-0000-0000-0000-000000000002';
select 'invite redeemed: ' || (public.redeem_club_invite('SVK2026') is not null);
set request.jwt.claim.sub = 'a1111111-0000-0000-0000-000000000003';
select 'invite redeemed: ' || (public.redeem_club_invite('SVK2026') is not null);

set request.jwt.claim.sub = 'b2222222-0000-0000-0000-000000000001';
select 'club B created: ' || (public.create_club('SG Musterstadt', 'sg-musterstadt', 'DE', 'SGM') is not null);

insert into public.club_invites (club_id, code, created_by, expires_at)
select id, 'SGM2026', 'b2222222-0000-0000-0000-000000000001', now() + interval '7 days'
  from public.clubs where slug = 'sg-musterstadt';

set request.jwt.claim.sub = 'b2222222-0000-0000-0000-000000000002';
select public.redeem_club_invite('SGM2026');
set request.jwt.claim.sub = 'b2222222-0000-0000-0000-000000000003';
select public.redeem_club_invite('SGM2026');

reset request.jwt.claim.sub;
select 'club A members: ' || count(*) from public.club_members
 where club_id = (select id from public.clubs where slug = 'sv-karlsruhe');

-- An outsider joins club A but shoots for nobody, so cannot be fielded by it.
insert into public.club_members (club_id, shooter_id)
select id, 'c3333333-0000-0000-0000-000000000001' from public.clubs where slug = 'sv-karlsruhe';
update public.profiles set primary_club_id = null
 where id = 'c3333333-0000-0000-0000-000000000001';

select 'club A lineup of 3 excludes the guest: ' ||
       bool_and(shooter_id <> 'c3333333-0000-0000-0000-000000000001')
  from public.club_lineup(
    (select id from public.clubs where slug = 'sv-karlsruhe'),
    (select id from public.disciplines where code = 'AR10ET'), 3);

-- Ratings decide both which club is listed first and the order of the boards.
-- Without them the pairing falls back to a random uuid and this test flaps.
insert into public.ratings (shooter_id, discipline_id, rating, matches_played)
select u.id, (select id from public.disciplines where code = 'AR10ET'), u.rating, 4
  from (values
    ('a1111111-0000-0000-0000-000000000001'::uuid, 1680),
    ('a1111111-0000-0000-0000-000000000002'::uuid, 1620),
    ('a1111111-0000-0000-0000-000000000003'::uuid, 1590),
    ('b2222222-0000-0000-0000-000000000001'::uuid, 1560),
    ('b2222222-0000-0000-0000-000000000002'::uuid, 1520),
    ('b2222222-0000-0000-0000-000000000003'::uuid, 1470)
  ) as u(id, rating);

-- ============================================ 2. a team season is paired ===
insert into public.seasons (discipline_id, format_id, slug, name, state, round_count,
                            competition_type, team_size,
                            registration_opens_at, starts_at, ends_at)
select d.id, f.id, 'team-ar10et-2026', 'Club League AR10ET 2026', 'running', 4,
       'team', 3, now() - interval '30 days', now() - interval '1 day', now() + interval '60 days'
  from public.disciplines d, public.formats f
 where d.code = 'AR10ET' and f.code = 'single_10';

insert into public.club_season_entries (season_id, club_id)
select s.id, c.id from public.seasons s, public.clubs c where s.slug = 'team-ar10et-2026';

insert into public.rounds (season_id, index, opens_at, closes_at)
select id, 1, now() - interval '1 hour', now() + interval '7 days'
  from public.seasons where slug = 'team-ar10et-2026';

select 'pair_team_round created ' || public.pair_team_round(id) || ' team match(es)'
  from public.rounds where index = 1;

select 'boards created: ' || count(*) || ', all with a board number: ' || bool_and(board is not null)
  from public.matches where team_match_id is not null;

select 'board ' || board || ': ' || pa.display_name || ' (SVK) vs ' || pb.display_name || ' (SGM)'
  from public.matches m
  join public.profiles pa on pa.id = m.shooter_a
  join public.profiles pb on pb.id = m.shooter_b
 where m.team_match_id is not null
 order by m.board;

select 'everyone was notified of the pairing: ' || count(*)
  from public.notifications where kind = 'round_paired';

-- ================================================ 3. the boards are shot ===
-- Club A takes boards 1 and 3, club B takes board 2.
do $$
declare
  v_board record;
  v_a numeric;
  v_b numeric;
begin
  for v_board in
    select m.*, b.id as bout_id
      from public.matches m
      join public.bouts b on b.match_id = m.id
     where m.team_match_id is not null
     order by m.board
  loop
    if v_board.board = 2 then
      v_a := 99.5; v_b := 103.2;
    else
      v_a := 104.1; v_b := 101.8;
    end if;

    insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
    values (v_board.bout_id, v_board.shooter_a, v_a, now(), v_board.bout_id::text || '/a/x.jpg');

    insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
    values (v_board.bout_id, v_board.shooter_b, v_b, now(), v_board.bout_id::text || '/b/x.jpg');
  end loop;
end $$;

select 'team match: ' || state || ' ' || points_a || ':' || points_b
       || ', winner is the stronger club: '
       || (winner_club_id = (select id from public.clubs where slug='sv-karlsruhe'))::text
       || ', decided by ' || decided_by
  from public.team_matches;

select 'standings: ' || club_name || ' pos ' || position || ', ' || table_points
       || ' pts, boards ' || board_points_for || ':' || board_points_against
  from public.club_standings order by position;

-- ================================================== 4. what got notified ===
select 'notifications by kind: ' || kind || ' x' || count(*)
  from public.notifications group by kind order by kind;

select 'the opponent was told to move, not what the score was: '
       || (body not like '%104%' and body not like '%99%')
  from public.notifications where kind = 'opponent_submitted' limit 1;

-- The sweeper must not queue the same reminder twice.
update public.bouts set closes_at = now() + interval '6 hours' where state = 'open';
select 'first sweep queued ' || public.enqueue_deadline_reminders() || ' reminder(s)';
select 'second sweep queued ' || public.enqueue_deadline_reminders() || ' (must be 0)';
select 'deadline_soon rows: ' || count(*) from public.notifications where kind = 'deadline_soon';

-- Turning push off stops the queue at the source.
update public.profiles set notify_push = false
 where id = 'a1111111-0000-0000-0000-000000000001';
delete from public.notifications where shooter_id = 'a1111111-0000-0000-0000-000000000001';
select public.enqueue_notification(
  'a1111111-0000-0000-0000-000000000001', 'your_turn', 'x', 'y');
select 'opted out, so nothing queued: ' || count(*)
  from public.notifications where shooter_id = 'a1111111-0000-0000-0000-000000000001';

-- ============================================ 5. what a spectator can see ===
-- anon must reach results without reaching the machinery behind them.
set role anon;

select 'anon sees ' || count(*) || ' season(s) in season_summary' from public.season_summary;
select 'anon sees standings for ' || count(*) || ' club(s)' from public.club_standings;
select 'anon sees ' || count(*) || ' scorecard row(s)' from public.match_scorecard;
select 'anon sees a real score: ' || (total_a is not null and total_b is not null)
  from public.match_scorecard limit 1;
select 'anon sees ' || count(*) || ' club profile(s)' from public.club_profile;
select 'anon sees ' || count(*) || ' finished match(es)' from public.match_results;

-- A match still in progress must not appear on any public surface.
select 'scorecard only covers finished matches: ' || bool_and(m.state in ('settled','finalized'))
  from public.match_scorecard sc join public.matches m on m.id = sc.match_id;

-- ...and nothing behind the results is reachable at all. These are not "zero
-- rows" checks: the tables are not granted to anon in the first place.
\set ON_ERROR_STOP off
\echo '-- anon reading submissions (expect failure)'
select count(*) from public.submissions;
\echo '-- anon reading notifications (expect failure)'
select count(*) from public.notifications;
\echo '-- anon reading device tokens (expect failure)'
select count(*) from public.device_tokens;
\echo '-- anon reading disputes (expect failure)'
select count(*) from public.disputes;
\echo '-- anon reading bout confirmations (expect failure)'
select count(*) from public.bout_confirmations;

reset role;

-- ==================================== 6. the tick has to pair a club round ===
-- A third club, so round 2 has a pairing to find: A and B have already met and
-- there are no rematches inside a season.
insert into auth.users (id, email, raw_user_meta_data) values
  ('d4444444-0000-0000-0000-000000000001','tc1@x.de','{"handle":"tc_one","display_name":"Hanna Meier","date_of_birth":"1990-05-14"}'),
  ('d4444444-0000-0000-0000-000000000002','tc2@x.de','{"handle":"tc_two","display_name":"Ingo Ritter","date_of_birth":"1990-05-14"}'),
  ('d4444444-0000-0000-0000-000000000003','tc3@x.de','{"handle":"tc_three","display_name":"Jana Roth","date_of_birth":"1990-05-14"}');

set request.jwt.claim.sub = 'd4444444-0000-0000-0000-000000000001';
select public.create_club('SV Drittstadt', 'sv-drittstadt', 'DE', 'SVD');

insert into public.club_invites (club_id, code, created_by, expires_at)
select id, 'SVD2026', 'd4444444-0000-0000-0000-000000000001', now() + interval '7 days'
  from public.clubs where slug = 'sv-drittstadt';

set request.jwt.claim.sub = 'd4444444-0000-0000-0000-000000000002';
select public.redeem_club_invite('SVD2026');
set request.jwt.claim.sub = 'd4444444-0000-0000-0000-000000000003';
select public.redeem_club_invite('SVD2026');
reset request.jwt.claim.sub;

insert into public.club_season_entries (season_id, club_id)
select s.id, c.id from public.seasons s, public.clubs c
 where s.slug = 'team-ar10et-2026' and c.slug = 'sv-drittstadt';

-- Round 2, left to the scheduler exactly as it would be in a real season: the
-- operator creates the round, run_league_tick() is supposed to draw it.
insert into public.rounds (season_id, index, opens_at, closes_at)
select id, 2, now() - interval '1 hour', now() + interval '7 days'
  from public.seasons where slug = 'team-ar10et-2026';

select 'tick reports: ' || (public.run_league_tick() ->> 'rounds_paired') || ' round(s) opened';

select 'round 2 is marked paired: ' || (paired_at is not null)::text
  from public.rounds r join public.seasons s on s.id = r.season_id
 where s.slug = 'team-ar10et-2026' and r.index = 2;

select 'round 2 produced ' || count(*) || ' club fixture(s)'
  from public.team_matches tm
  join public.rounds r on r.id = tm.round_id
 where r.index = 2;

select 'and the boards under them: ' || count(*)
  from public.matches m
  join public.team_matches tm on tm.id = m.team_match_id
  join public.rounds r on r.id = tm.round_id
 where r.index = 2;

select 'the fixture is live, not scheduled: ' || (state = 'live')::text
  from public.team_matches tm join public.rounds r on r.id = tm.round_id
 where r.index = 2;
