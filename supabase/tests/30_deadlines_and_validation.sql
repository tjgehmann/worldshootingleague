\set ON_ERROR_STOP on
\pset tuples_only on

-- ============================================ 1. forfeit on a missed window ==
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001','f1@x.de','{"handle":"forf_a","display_name":"ForfA"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002','f2@x.de','{"handle":"forf_b","display_name":"ForfB"}'),
  ('bbbbbbbb-0000-0000-0000-000000000001','t1@x.de','{"handle":"tie_a","display_name":"TieA"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002','t2@x.de','{"handle":"tie_b","display_name":"TieB"}'),
  ('cccccccc-0000-0000-0000-000000000001','d1@x.de','{"handle":"dead_a","display_name":"DeadA"}'),
  ('cccccccc-0000-0000-0000-000000000002','d2@x.de','{"handle":"dead_b","display_name":"DeadB"}');

insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
       'live', now() - interval '8 days', now() - interval '1 day'
  from public.disciplines d, public.formats f where d.code='AR10ET' and f.code='single_10';

-- only one side turns up; backdate the bout so shot_at passes validation
update public.bouts set closes_at = now() + interval '1 hour'
 where match_id = (select id from public.matches where shooter_a='aaaaaaaa-0000-0000-0000-000000000001');

insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
select b.id, 'aaaaaaaa-0000-0000-0000-000000000001',
       array[10.0,10.0,10.0,10.0,10.0,10.0,10.0,10.0,10.0,10.0], now(), 'manual'
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

insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
select b.id, m.shooter_a, array[10.0,10.0,10.0,10.0,10.0,10.0,10.0,10.0,10.0,10.0], now(), 'manual'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.shooter_a='bbbbbbbb-0000-0000-0000-000000000001';

insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
select b.id, m.shooter_b, array[10.0,10.0,10.0,10.0,10.0,10.0,10.0,10.0,10.0,10.0], now(), 'manual'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.shooter_a='bbbbbbbb-0000-0000-0000-000000000001';

select 'tied match state: ' || state || ', bouts now: ' || (
  select count(*) from public.bouts b where b.match_id = m.id
) || ' (shoot-off added)'
  from public.matches m where m.shooter_a='bbbbbbbb-0000-0000-0000-000000000001';

-- ==================================== 3. nobody shows up -> match is voided ==
insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, 'cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002',
       'live', now() - interval '9 days', now() - interval '2 days'
  from public.disciplines d, public.formats f where d.code='AR10ET' and f.code='single_10';

select 'void_dead_matches voided ' || public.void_dead_matches() || ' match(es)';
select 'dead match state: ' || state from public.matches
 where shooter_a='cccccccc-0000-0000-0000-000000000001';

-- ============================================ 4. input validation on shots ==
\set ON_ERROR_STOP off
\echo '-- 9 shots instead of 10 (expect failure)'
insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
select b.id, m.shooter_a, array[10,10,10,10,10,10,10,10,10]::numeric[], now(), 'manual'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.shooter_a='bbbbbbbb-0000-0000-0000-000000000001' and b.state='open' limit 1;

\echo '-- 11.5 on a 10.9 discipline (expect failure)'
insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
select b.id, m.shooter_a, array[11.5,10,10,10,10,10,10,10,10,10]::numeric[], now(), 'manual'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.shooter_a='bbbbbbbb-0000-0000-0000-000000000001' and b.state='open' limit 1;

\echo '-- decimal value on an integer-scored pistol discipline (expect failure)'
insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
       'live', now() - interval '1 hour', now() + interval '7 days'
  from public.disciplines d, public.formats f where d.code='AP10ET' and f.code='single_10';

insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
select b.id, m.shooter_a, array[10.4,10,10,10,10,10,10,10,10,10]::numeric[], now(), 'manual'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.discipline_id = (select id from public.disciplines where code='AP10ET') limit 1;

\echo '-- series fired before the bout opened (expect failure)'
insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
select b.id, m.shooter_a, array[10,10,10,10,10,10,10,10,10,10]::numeric[], now() - interval '30 days', 'manual'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.discipline_id = (select id from public.disciplines where code='AP10ET') limit 1;
