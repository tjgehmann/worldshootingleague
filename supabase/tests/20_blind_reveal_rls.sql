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

\echo '[A] upload own series'
insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
values (:'bout', '11111111-1111-1111-1111-111111111111',
        array[10.5,10.4,10.3,10.6,10.2,10.5,10.4,10.3,10.7,10.5], now(), 'manual');

select 'A sees ' || count(*) || ' submission(s)' from public.submissions;

\echo '[A] second upload for the same bout (expect failure)'
insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
values (:'bout', '11111111-1111-1111-1111-111111111111',
        array[10.9,10.9,10.9,10.9,10.9,10.9,10.9,10.9,10.9,10.9], now(), 'manual');

\echo '[A] upload on B''s behalf (expect failure)'
insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
values (:'bout', '22222222-2222-2222-2222-222222222222',
        array[1,1,1,1,1,1,1,1,1,1]::numeric[], now(), 'manual');

\echo '[A] rewrite own score (expect failure)'
update public.submissions set total = 109.0;

\echo '[A] delete own submission (expect failure)'
delete from public.submissions;

-- ================================================ shooter B, before reveal ==
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
\echo '[B] before uploading'
select 'B sees ' || count(*) || ' submission(s)  <- must be 0' from public.submissions;
select 'bout state visible to B: ' || state from public.bouts;

\echo '[B] upload own series'
insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
values (:'bout', '22222222-2222-2222-2222-222222222222',
        array[10.1,10.2,10.0,9.8,10.3,10.1,9.9,10.2,10.0,10.1], now(), 'manual');

select 'B sees ' || count(*) || ' submission(s)  <- must be 2' from public.submissions;
select 'B sees A''s total: ' || total from public.submissions
 where shooter_id = '11111111-1111-1111-1111-111111111111';

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
