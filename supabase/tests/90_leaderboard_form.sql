\set ON_ERROR_STOP off
\pset tuples_only on

-- Recent form on the ladder. The counts already said how often somebody wins;
-- what the table could not say is whether they are winning lately.

insert into auth.users (id, email, raw_user_meta_data) values
  ('60000000-0000-0000-0000-000000000001','lf1@x.de',
   '{"handle":"form_climb","display_name":"Frieda Steigend","date_of_birth":"1990-01-01"}'),
  ('60000000-0000-0000-0000-000000000002','lf2@x.de',
   '{"handle":"form_slide","display_name":"Frieda Fallend","date_of_birth":"1990-01-01"}'),
  ('60000000-0000-0000-0000-000000000003','lf3@x.de',
   '{"handle":"form_new","display_name":"Frieda Neu","date_of_birth":"1990-01-01"}');

-- Two shooters with the identical record — six won, six lost — and opposite
-- recent form. This is the whole point: on wins and losses alone they are the
-- same row, and they are not the same shooter.
insert into public.ratings (shooter_id, discipline_id, rating, rd, matches_played, wins, losses)
select '60000000-0000-0000-0000-000000000001', id, 1600, 60, 12, 6, 6
  from public.disciplines where code = 'AR10ET';
insert into public.ratings (shooter_id, discipline_id, rating, rd, matches_played, wins, losses)
select '60000000-0000-0000-0000-000000000002', id, 1590, 60, 12, 6, 6
  from public.disciplines where code = 'AR10ET';
-- A newcomer with two rated matches: fewer than five events to draw.
insert into public.ratings (shooter_id, discipline_id, rating, rd, matches_played, wins, losses)
select '60000000-0000-0000-0000-000000000003', id, 1500, 200, 2, 1, 1
  from public.disciplines where code = 'AR10ET';

-- rating_events carries one row per shooter per match, so six events need six
-- matches. The view reads the events, not the matches, but the constraint is
-- right and the fixture has to respect it.
insert into public.matches (id, discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select ('60000000-0000-0000-0000-0000000000b' || n)::uuid, d.id, f.id,
       '60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002',
       'settled', now() - ((n * 5 + 2) || ' days')::interval,
                  now() - ((n * 5) || ' days')::interval
  from generate_series(1, 6) n, public.disciplines d, public.formats f
 where d.code = 'AR10ET' and f.code = 'single_10';

-- Six each, oldest first. The climber loses twice then wins four; the slider
-- does the reverse and draws the last. Only the last five are shown, so the
-- climber reads L W W W W and the slider W L L L D.
insert into public.rating_events
  (match_id, shooter_id, opponent_id, discipline_id, score,
   rating_before, rd_before, volatility_before, rating_after, rd_after, volatility_after, created_at)
select ('60000000-0000-0000-0000-0000000000b' || v.n)::uuid,
       '60000000-0000-0000-0000-000000000001',
       '60000000-0000-0000-0000-000000000002',
       (select id from public.disciplines where code = 'AR10ET'),
       v.score, v.before, 60, 0.06, v.after, 60, 0.06,
       now() - (v.days || ' days')::interval
  from (values
    (1, 0::numeric,   1560::numeric, 1544::numeric, 30),
    (2, 0::numeric,   1544::numeric, 1528::numeric, 25),
    (3, 1::numeric,   1528::numeric, 1546::numeric, 20),
    (4, 1::numeric,   1546::numeric, 1563::numeric, 15),
    (5, 1::numeric,   1563::numeric, 1582::numeric, 10),
    (6, 1::numeric,   1582::numeric, 1600::numeric,  5)
  ) as v(n, score, before, after, days);

insert into public.rating_events
  (match_id, shooter_id, opponent_id, discipline_id, score,
   rating_before, rd_before, volatility_before, rating_after, rd_after, volatility_after, created_at)
select ('60000000-0000-0000-0000-0000000000b' || v.n)::uuid,
       '60000000-0000-0000-0000-000000000002',
       '60000000-0000-0000-0000-000000000001',
       (select id from public.disciplines where code = 'AR10ET'),
       v.score, v.before, 60, 0.06, v.after, 60, 0.06,
       now() - (v.days || ' days')::interval
  from (values
    (1, 1::numeric,   1640::numeric, 1658::numeric, 30),
    (2, 1::numeric,   1658::numeric, 1674::numeric, 25),
    (3, 0::numeric,   1674::numeric, 1652::numeric, 20),
    (4, 0::numeric,   1652::numeric, 1631::numeric, 15),
    (5, 0::numeric,   1631::numeric, 1610::numeric, 10),
    (6, 0.5::numeric, 1610::numeric, 1590::numeric,  5)
  ) as v(n, score, before, after, days);

-- The newcomer's two matches. Only their own side is written, so the climber's
-- count stays at exactly six and the "never more than five" check still means
-- something.
insert into public.matches (id, discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select ('60000000-0000-0000-0000-0000000000c' || n)::uuid, d.id, f.id,
       '60000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001',
       'settled', now() - ((n * 4 + 2) || ' days')::interval,
                  now() - ((n * 4) || ' days')::interval
  from generate_series(1, 2) n, public.disciplines d, public.formats f
 where d.code = 'AR10ET' and f.code = 'single_10';

insert into public.rating_events
  (match_id, shooter_id, opponent_id, discipline_id, score,
   rating_before, rd_before, volatility_before, rating_after, rd_after, volatility_after, created_at)
select ('60000000-0000-0000-0000-0000000000c' || v.n)::uuid,
       '60000000-0000-0000-0000-000000000003',
       '60000000-0000-0000-0000-000000000001',
       (select id from public.disciplines where code = 'AR10ET'),
       v.score, v.before, 200, 0.06, v.after, 200, 0.06,
       now() - (v.days || ' days')::interval
  from (values
    (1, 0::numeric, 1500::numeric, 1470::numeric, 8),
    (2, 1::numeric, 1470::numeric, 1500::numeric, 4)
  ) as v(n, score, before, after, days);

-- ============================================== 1. five, newest last ========
select 'climber: ' || string_agg(
         case when (e->>'score')::numeric = 1 then 'W'
              when (e->>'score')::numeric = 0 then 'L'
              else 'D' end, ' ')
  from public.leaderboard l,
       lateral jsonb_array_elements(l.recent_form) e
 where l.shooter_id = '60000000-0000-0000-0000-000000000001';

select 'slider: ' || string_agg(
         case when (e->>'score')::numeric = 1 then 'W'
              when (e->>'score')::numeric = 0 then 'L'
              else 'D' end, ' ')
  from public.leaderboard l,
       lateral jsonb_array_elements(l.recent_form) e
 where l.shooter_id = '60000000-0000-0000-0000-000000000002';

-- The two records are identical, which is exactly why the strip has to differ.
select 'same record: ' || (a.wins = b.wins and a.losses = b.losses)::text ||
       ', same form: ' || (a.recent_form = b.recent_form)::text
  from public.leaderboard a, public.leaderboard b
 where a.shooter_id = '60000000-0000-0000-0000-000000000001'
   and b.shooter_id = '60000000-0000-0000-0000-000000000002';

-- ============================================== 2. never more than five =====
select 'climber events: ' || count(*)::text ||
       ', shown: ' || jsonb_array_length(
         (select recent_form from public.leaderboard
           where shooter_id = '60000000-0000-0000-0000-000000000001'))::text
  from public.rating_events
 where shooter_id = '60000000-0000-0000-0000-000000000001';

-- ============================================== 3. a newcomer shows fewer ===
select 'newcomer shown: ' || jsonb_array_length(recent_form)::text ||
       ', provisional: ' || is_provisional::text
  from public.leaderboard
 where shooter_id = '60000000-0000-0000-0000-000000000003';

-- ============================================== 4. the delta is whole ========
-- A rating is displayed rounded, so a delta carrying tenths would disagree with
-- the difference between two numbers the reader can see.
select 'deltas: ' || string_agg(e->>'delta', ' ')
  from public.leaderboard l,
       lateral jsonb_array_elements(l.recent_form) e
 where l.shooter_id = '60000000-0000-0000-0000-000000000001';

select 'all whole: ' || bool_and((e->>'delta')::numeric = round((e->>'delta')::numeric))::text
  from public.leaderboard l,
       lateral jsonb_array_elements(l.recent_form) e;

-- ============================================== 5. never null ===============
-- A shooter with a rating row but no rated events must come back as an empty
-- array, not null: the client maps over this and null would be a crash on the
-- one screen everybody opens.
insert into auth.users (id, email, raw_user_meta_data) values
  ('60000000-0000-0000-0000-000000000004','lf4@x.de',
   '{"handle":"form_none","display_name":"Frieda Ohne","date_of_birth":"1990-01-01"}');
insert into public.ratings (shooter_id, discipline_id, rating, rd, matches_played, wins, losses)
select '60000000-0000-0000-0000-000000000004', id, 1500, 90, 3, 0, 3
  from public.disciplines where code = 'AR10ET';

select 'no events: ' || recent_form::text ||
       ', is null: ' || (recent_form is null)::text
  from public.leaderboard
 where shooter_id = '60000000-0000-0000-0000-000000000004';

-- ============================================== 6. a spectator may read it ==
-- The ladder is public, and the form column has to travel with it — otherwise
-- the signed-out table and the signed-in one disagree about what a row is.
set role anon;
select 'anon reads form: ' || (recent_form is not null)::text
  from public.leaderboard
 where shooter_id = '60000000-0000-0000-0000-000000000001';
reset role;
