\set ON_ERROR_STOP off
\pset tuples_only on

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','a@x.de','{"handle":"thomas","display_name":"Thomas"}'),
  ('22222222-2222-2222-2222-222222222222','b@x.de','{"handle":"stefan","display_name":"Stefan"}'),
  ('33333333-3333-3333-3333-333333333333','c@x.de','{"handle":"alina","display_name":"Alina"}');

insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id,
       '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
       'live', now() - interval '1 hour', now() + interval '7 days'
  from public.disciplines d, public.formats f
 where d.code = 'AR10ET' and f.code = 'single_10';

select id as bout from public.bouts limit 1 \gset

-- ============================================================== shooter A ==
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '[A] report own result'
insert into public.submissions (bout_id, shooter_id, total, tens, shot_at, photo_path)
values (:'bout', '11111111-1111-1111-1111-111111111111', 104.4, 8, now(), :'bout' || '/a/shot.jpg');

select 'A sees ' || count(*) || ' submission(s)' from public.submissions;

\echo '[A] second report for the same bout (expect failure)'
insert into public.submissions (bout_id, shooter_id, total, tens, shot_at, photo_path)
values (:'bout', '11111111-1111-1111-1111-111111111111', 108.0, 10, now(), :'bout' || '/a/2.jpg');

\echo '[A] report on B''s behalf (expect failure)'
insert into public.submissions (bout_id, shooter_id, total, tens, shot_at, photo_path)
values (:'bout', '22222222-2222-2222-2222-222222222222', 50.0, 0, now(), :'bout' || '/b/fake.jpg');

\echo '[A] rewrite own score (expect failure)'
update public.submissions set total = 109.0;

\echo '[A] delete own submission (expect failure)'
delete from public.submissions;

-- ================================================ shooter B, before reveal ==
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
\echo '[B] before reporting'
select 'B sees ' || count(*) || ' submission(s)  <- must be 0' from public.submissions;
select 'bout state visible to B: ' || state from public.bouts;

\echo '[B] report own result'
insert into public.submissions (bout_id, shooter_id, total, tens, shot_at, photo_path)
values (:'bout', '22222222-2222-2222-2222-222222222222', 102.7, 6, now(), :'bout' || '/b/shot.jpg');

select 'B sees ' || count(*) || ' submission(s)  <- must be 2' from public.submissions;
select 'B sees A''s total: ' || total || ' with ' || tens || ' tens' from public.submissions
 where shooter_id = '11111111-1111-1111-1111-111111111111';

\echo '[B] confirm A''s photo'
insert into public.bout_confirmations (submission_id, confirmed_by, accepted)
select id, '22222222-2222-2222-2222-222222222222', true from public.submissions
 where shooter_id = '11111111-1111-1111-1111-111111111111';

\echo '[B] forge an auto-confirmation (expect failure)'
insert into public.bout_confirmations (submission_id, confirmed_by, accepted, is_auto)
select id, '22222222-2222-2222-2222-222222222222', true, true from public.submissions
 where shooter_id = '22222222-2222-2222-2222-222222222222';

\echo '[B] confirm own submission (expect failure)'
insert into public.bout_confirmations (submission_id, confirmed_by, accepted)
select id, '22222222-2222-2222-2222-222222222222', true from public.submissions
 where shooter_id = '22222222-2222-2222-2222-222222222222';

-- ============================================================ third party ==
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'Alina sees ' || count(*) || ' submission(s)  <- must be 0' from public.submissions;
select 'Alina sees ' || count(*) || ' match_results row(s)' from public.match_results;
select 'Alina sees ' || count(*) || ' bout(s)' from public.bouts;

reset role;
select 'bout ' || state || ', A won: ' || (winner_id = '11111111-1111-1111-1111-111111111111')::text
  from public.bouts;
select 'match ' || state || ', points ' || points_a || ':' || points_b || ' by ' || decided_by
  from public.matches;
select 'stefan confirmation rate: ' || coalesce(confirmation_rate_pct::text, 'n/a') || '%'
  from public.shooter_reliability where handle = 'stefan';
