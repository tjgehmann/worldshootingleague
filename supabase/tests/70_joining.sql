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

-- ==================================================== 5. inviting people in ==
set role authenticated;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000003';

-- expect failure: a member who is not an official cannot mint a code
select public.create_club_invite(
  (select id from public.clubs where slug = 'sv-joinerstadt'));

reset role;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000001';
set role authenticated;

select code as minted, expires_at from public.create_club_invite(
  (select id from public.clubs where slug = 'sv-joinerstadt'), 14, 20) \gset

select 'code minted: ' || (:'minted' ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$')::text
       || ', no character anyone can mishear: ' || (:'minted' !~ '[ILO01]')::text;

select 'lasts ' || round(extract(epoch from (expires_at - now())) / 86400)::text || ' days'
  from public.club_invites where code = :'minted';

-- expect failure: an invite cannot outlive three months
select public.create_club_invite(
  (select id from public.clubs where slug = 'sv-joinerstadt'), 400);

reset role;
reset request.jwt.claim.sub;

-- A code is given to somebody, not looked up by them: club_invites_active is
-- for officials only.
set role authenticated;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000002';

select 'a stranger sees no codes: ' || count(*)::text
  from public.club_invites_active((select id from public.clubs where slug = 'sv-joinerstadt'));

select 'redeemed: ' || (public.redeem_club_invite(:'minted') is not null)::text;

reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000001';

select 'the official sees it was used: ' || uses::text || ' of ' || max_uses::text
  from public.club_invites_active((select id from public.clubs where slug = 'sv-joinerstadt'))
 where code = :'minted';

select public.revoke_club_invite(:'minted');

select 'withdrawn, so it is gone from the list: ' ||
       (count(*) filter (where code = :'minted') = 0)::text
  from public.club_invites_active((select id from public.clubs where slug = 'sv-joinerstadt'));

-- expect failure: a withdrawn code no longer works
reset role;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000003';
set role authenticated;
select public.redeem_club_invite(:'minted');

reset role;
reset request.jwt.claim.sub;

-- ================================================= 6. editing your profile ===
-- The club you shoot for decides whether a club can field you, and it is
-- joined straight into the public season table — so it has to be a club you
-- are actually in.
set role authenticated;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000002';

update public.profiles set primary_club_id = null
 where id = '4a000000-0000-0000-0000-000000000002';

update public.profiles
   set primary_club_id = (select id from public.clubs where slug = 'sv-joinerstadt')
 where id = '4a000000-0000-0000-0000-000000000002';

select 'a member picks the club they belong to: ' ||
       (primary_club_id = (select id from public.clubs where slug = 'sv-joinerstadt'))::text
  from public.profiles where id = '4a000000-0000-0000-0000-000000000002';

-- expect failure: a club they are not in
update public.profiles
   set primary_club_id = (select id from public.clubs where slug = 'sv-karlsruhe')
 where id = '4a000000-0000-0000-0000-000000000002';

-- Renaming yourself is allowed; taking somebody else's handle is not.
update public.profiles set display_name = 'Jo the Second'
 where id = '4a000000-0000-0000-0000-000000000002';

-- expect failure: the handle is taken
update public.profiles set handle = 'joiner_one'
 where id = '4a000000-0000-0000-0000-000000000002';

-- expect failure: somebody else's profile
update public.profiles set display_name = 'Hacked'
 where id = '4a000000-0000-0000-0000-000000000001';

reset role;
reset request.jwt.claim.sub;

select 'renamed: ' || display_name || ', shooting for ' ||
       coalesce((select short_name from public.clubs where id = p.primary_club_id), 'nobody')
  from public.profiles p where id = '4a000000-0000-0000-0000-000000000002';

select 'the other profile is untouched: ' || (display_name = 'Jo One')::text
  from public.profiles where id = '4a000000-0000-0000-0000-000000000001';

-- Leaving the club stops you shooting for it.
delete from public.club_members
 where shooter_id = '4a000000-0000-0000-0000-000000000002'
   and club_id = (select id from public.clubs where slug = 'sv-joinerstadt');

select 'after leaving the club: shooting for ' ||
       coalesce((select short_name from public.clubs where id = p.primary_club_id), 'nobody')
  from public.profiles p where id = '4a000000-0000-0000-0000-000000000002';

-- An opponent can always read your name, whatever your profile visibility says.
update public.profiles set is_public = false
 where id = '4a000000-0000-0000-0000-000000000001';

insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, '4a000000-0000-0000-0000-000000000001',
       '4a000000-0000-0000-0000-000000000002',
       'live', now() - interval '1 hour', now() + interval '7 days'
  from public.disciplines d, public.formats f
 where d.code = 'AR10ET' and f.code = 'single_10';

set role authenticated;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000002';
select 'a private opponent is still readable to me: ' || count(*)::text
  from public.profiles where id = '4a000000-0000-0000-0000-000000000001';
reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '4a000000-0000-0000-0000-000000000003';
select 'but not to a stranger: ' || count(*)::text
  from public.profiles where id = '4a000000-0000-0000-0000-000000000001';
reset role;
reset request.jwt.claim.sub;
