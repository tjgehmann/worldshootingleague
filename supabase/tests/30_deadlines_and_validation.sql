\set ON_ERROR_STOP on
\pset tuples_only on

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001','f1@x.de','{"handle":"forf_a","display_name":"ForfA","date_of_birth":"1990-05-14"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002','f2@x.de','{"handle":"forf_b","display_name":"ForfB","date_of_birth":"1990-05-14"}'),
  ('bbbbbbbb-0000-0000-0000-000000000001','t1@x.de','{"handle":"tie_a","display_name":"TieA","date_of_birth":"1990-05-14"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002','t2@x.de','{"handle":"tie_b","display_name":"TieB","date_of_birth":"1990-05-14"}'),
  ('cccccccc-0000-0000-0000-000000000001','d1@x.de','{"handle":"dead_a","display_name":"DeadA","date_of_birth":"1990-05-14"}'),
  ('cccccccc-0000-0000-0000-000000000002','d2@x.de','{"handle":"dead_b","display_name":"DeadB","date_of_birth":"1990-05-14"}');

-- ============================================ 1. forfeit on a missed window ==
insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
       'live', now() - interval '8 days', now() - interval '1 day'
  from public.disciplines d, public.formats f where d.code='AR10ET' and f.code='single_10';

update public.bouts set closes_at = now() + interval '1 hour'
 where match_id = (select id from public.matches where shooter_a='aaaaaaaa-0000-0000-0000-000000000001');

insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
select b.id, 'aaaaaaaa-0000-0000-0000-000000000001', 100.0, now(), b.id::text || '/a/x.jpg'
  from public.bouts b
  join public.matches m on m.id = b.match_id
 where m.shooter_a = 'aaaaaaaa-0000-0000-0000-000000000001';

update public.bouts set closes_at = now() - interval '1 minute'
 where match_id = (select id from public.matches where shooter_a='aaaaaaaa-0000-0000-0000-000000000001');

select 'expire_bouts forfeited ' || public.expire_bouts() || ' bout(s)';
select 'forfeit match: ' || state || ' decided_by=' || coalesce(decided_by::text,'-')
       || ' winner_is_a=' || (winner_id='aaaaaaaa-0000-0000-0000-000000000001')::text
  from public.matches where shooter_a='aaaaaaaa-0000-0000-0000-000000000001';

-- ================================== 2. dead level -> shoot-off bout appears ==
insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
       'live', now() - interval '1 hour', now() + interval '7 days'
  from public.disciplines d, public.formats f where d.code='AR10ET' and f.code='single_10';

insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
select b.id, m.shooter_a, 103.0, now(), b.id::text || '/a/x.jpg'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.shooter_a='bbbbbbbb-0000-0000-0000-000000000001';

insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
select b.id, m.shooter_b, 103.0, now(), b.id::text || '/b/x.jpg'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.shooter_a='bbbbbbbb-0000-0000-0000-000000000001';

select 'tied match state: ' || state || ', bouts now: ' || (
  select count(*) from public.bouts b where b.match_id = m.id
) || ' (shoot-off added)'
  from public.matches m where m.shooter_a='bbbbbbbb-0000-0000-0000-000000000001';

-- ===================== 3. lapsed peer confirmation auto-accepts, but counts ==
update public.bouts set confirm_closes_at = now() - interval '1 minute'
 where match_id = (select id from public.matches where shooter_a='bbbbbbbb-0000-0000-0000-000000000001')
   and state = 'settled';

select 'expire_confirmations auto-accepted ' || public.expire_confirmations() || ' submission(s)';
select 'tie_a confirmations: ' || confirmations_given || '/' || confirmations_due
       || ' -> rate ' || coalesce(confirmation_rate_pct::text,'n/a') || '%'
  from public.shooter_reliability where handle = 'tie_a';

-- ==================================== 4. nobody shows up -> match is voided ==
insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, 'cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002',
       'live', now() - interval '9 days', now() - interval '2 days'
  from public.disciplines d, public.formats f where d.code='AR10ET' and f.code='single_10';

select 'void_dead_matches voided ' || public.void_dead_matches() || ' match(es)';
select 'dead match state: ' || state from public.matches
 where shooter_a='cccccccc-0000-0000-0000-000000000001';

-- ============================================ 5. input validation, no OCR ==
\set ON_ERROR_STOP off

insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
       'live', now() - interval '1 hour', now() + interval '7 days'
  from public.disciplines d, public.formats f where d.code='AP10ET' and f.code='single_10';

select b.id as pbout from public.bouts b join public.matches m on m.id = b.match_id
 where m.discipline_id = (select id from public.disciplines where code='AP10ET') limit 1 \gset

select b.id as rbout from public.bouts b join public.matches m on m.id = b.match_id
 where m.shooter_a = 'bbbbbbbb-0000-0000-0000-000000000001'
   and m.discipline_id = (select id from public.disciplines where code='AR10ET')
   and b.state = 'open' limit 1 \gset

\echo '-- total above the discipline maximum (expect failure)'
insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
values (:'rbout', 'bbbbbbbb-0000-0000-0000-000000000001', 120.0, now(), 'x/y/z.jpg');

\echo '-- pistol submitted without the mandatory inner ten count (expect failure)'
insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
values (:'pbout', 'bbbbbbbb-0000-0000-0000-000000000001', 95, now(), 'x/y/z.jpg');

\echo '-- 11 inner tens in a 10 shot series (expect failure)'
insert into public.submissions (bout_id, shooter_id, total, inner_tens, shot_at, photo_path)
values (:'pbout', 'bbbbbbbb-0000-0000-0000-000000000001', 100, 11, now(), 'x/y/z.jpg');

\echo '-- 8 inner tens cannot add up to a total of 60 (expect failure)'
insert into public.submissions (bout_id, shooter_id, total, inner_tens, shot_at, photo_path)
values (:'pbout', 'bbbbbbbb-0000-0000-0000-000000000001', 60, 8, now(), 'x/y/z.jpg');

\echo '-- decimal total on an integer-scored pistol discipline (expect failure)'
insert into public.submissions (bout_id, shooter_id, total, inner_tens, shot_at, photo_path)
values (:'pbout', 'bbbbbbbb-0000-0000-0000-000000000001', 95.4, 5, now(), 'x/y/z.jpg');

\echo '-- shots array disagreeing with the reported total (expect failure)'
insert into public.submissions (bout_id, shooter_id, total, shots, shot_at, photo_path, source)
values (:'rbout', 'bbbbbbbb-0000-0000-0000-000000000001', 104.4,
        array[10.5,10.4,10.3,10.6,10.2,10.5,10.4,9.8,10.7,7.0], now(), 'x/y/z.jpg', 'file_export');

\echo '-- series fired before the bout opened (expect failure)'
insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
values (:'rbout', 'bbbbbbbb-0000-0000-0000-000000000001', 100.0, now() - interval '30 days', 'x/y/z.jpg');

\echo '-- no photo (expect failure)'
insert into public.submissions (bout_id, shooter_id, total, shot_at)
values (:'rbout', 'bbbbbbbb-0000-0000-0000-000000000001', 100.0, now());
