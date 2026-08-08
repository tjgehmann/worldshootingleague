\set ON_ERROR_STOP off
\pset tuples_only on

-- Entering a season from the app: a shooter into an individual ladder, a club
-- into a team competition, and the things neither may do.

insert into auth.users (id, email, raw_user_meta_data) values
  ('4a000000-0000-0000-0000-000000000001','join1@x.de',
   '{"handle":"joiner_one","display_name":"Jo One","country_code":"DE","date_of_birth":"1991-02-03"}'),
  ('4a000000-0000-0000-0000-000000000002','join2@x.de',
   '{"handle":"joiner_two","display_name":"Jo Two","country_code":"AT","date_of_birth":"1991-02-03"}'),
  ('4a000000-0000-0000-0000-000000000003','join3@x.de',
   '{"handle":"joiner_three","display_name":"Jo Three","country_code":"DE","date_of_birth":"1991-02-03"}');

insert into public.seasons
  (discipline_id, format_id, slug, name, state, round_count,
   registration_opens_at, starts_at, ends_at)
select d.id, f.id, 'join-ladder', 'Joining Ladder', 'running', 6,
       now() - interval '2 days', now() - interval '1 day', now() + interval '40 days'
  from public.disciplines d, public.formats f
 where d.code = 'AR10ET' and f.code = 'best_of_five';

insert into public.seasons
  (discipline_id, format_id, slug, name, state, competition_type, team_size, round_count,
   registration_opens_at, starts_at, ends_at)
select d.id, f.id, 'join-cup', 'Joining Cup', 'registration', 'team', 3, 5,
       now() - interval '2 days', now() + interval '3 days', now() + interval '40 days'
  from public.disciplines d, public.formats f
 where d.code = 'AR10ET' and f.code = 'best_of_five';

insert into public.seasons
  (discipline_id, format_id, slug, name, state, country_code, round_count,
   registration_opens_at, starts_at, ends_at)
select d.id, f.id, 'join-national', 'German Ladder', 'registration', 'DE', 6,
       now() - interval '2 days', now() + interval '3 days', now() + interval '40 days'
  from public.disciplines d, public.formats f
 where d.code = 'AR10ET' and f.code = 'best_of_five';

-- =============================== 1. a shooter joins a season already running ==
set role authenticated;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000001';

select 'joined a running season: ' || (public.join_season('join-ladder') is not null)::text;
select 'entry says joined: ' || joined::text || ', entrants ' || entrants::text
  from public.my_season_entry('join-ladder');

-- Joining twice is not an error, it is the same entry.
select public.join_season('join-ladder');
select 'still one entry: ' || count(*)::text from public.season_entries e
  join public.seasons s on s.id = e.season_id
 where s.slug = 'join-ladder' and e.shooter_id = '4a000000-0000-0000-0000-000000000001';

-- Leaving and coming back keeps the row and clears the withdrawal.
select public.leave_season('join-ladder');
select 'after leaving: ' || joined::text from public.my_season_entry('join-ladder');
select public.join_season('join-ladder');
select 'after rejoining: ' || joined::text from public.my_season_entry('join-ladder');

-- expect failure: a team competition is entered by a club
select public.join_season('join-cup');

reset role;
reset request.jwt.claim.sub;

-- ======================================== 2. a national ladder checks country ==
set role authenticated;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000002';

-- expect failure: an Austrian in a German-only season
select public.join_season('join-national');

reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000003';
select 'a German joins the German ladder: ' ||
       (public.join_season('join-national') is not null)::text;
reset role;
reset request.jwt.claim.sub;

-- ============================================ 3. a club enters, by an official ==
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000001';
select public.create_club('SV Joinerstadt', 'sv-joinerstadt', 'DE', 'SVJ', 'Joinerstadt');

insert into public.club_invites (club_id, code, created_by, expires_at)
select id, 'JOIN2026', '4a000000-0000-0000-0000-000000000001', now() + interval '7 days'
  from public.clubs where slug = 'sv-joinerstadt';

set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000003';
select public.redeem_club_invite('JOIN2026');

set role authenticated;

-- expect failure: a member who is not an official cannot enter the club
select public.enter_club_in_season('join-cup',
  (select id from public.clubs where slug = 'sv-joinerstadt'));

reset role;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000001';
set role authenticated;

select 'the owner enters the club: ' ||
       (public.enter_club_in_season('join-cup',
          (select id from public.clubs where slug = 'sv-joinerstadt')) is not null)::text;

-- The count is what tells an official the club will actually be paired: a team
-- of three needs three shooters competing for the club.
select 'club row: entered=' || entered::text || ' official=' || is_official::text ||
       ' eligible=' || eligible::text || ' of ' || team_size::text
  from public.my_club_season_entries('join-cup');

-- expect failure: an individual season is not entered by a club
select public.enter_club_in_season('join-ladder',
  (select id from public.clubs where slug = 'sv-joinerstadt'));

select public.withdraw_club_from_season('join-cup',
  (select id from public.clubs where slug = 'sv-joinerstadt'));
select 'after withdrawing: ' || entered::text from public.my_club_season_entries('join-cup');

reset role;
reset request.jwt.claim.sub;

-- ==================================================== 4. a season that is over ==
update public.seasons set state = 'finished' where slug = 'join-ladder';

set role authenticated;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000002';

-- expect failure: a finished season takes no entries
select public.join_season('join-ladder');

-- expect failure: no such season
select public.join_season('does-not-exist');

reset role;
reset request.jwt.claim.sub;
