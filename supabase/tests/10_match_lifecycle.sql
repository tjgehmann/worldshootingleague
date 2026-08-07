\set ON_ERROR_STOP on
begin;

-- four shooters
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','a@x.de','{"handle":"thomas","display_name":"Thomas","country_code":"DE"}'),
  ('22222222-2222-2222-2222-222222222222','b@x.de','{"handle":"stefan","display_name":"Stefan","country_code":"DE"}'),
  ('33333333-3333-3333-3333-333333333333','c@x.de','{"handle":"alina","display_name":"Alina","country_code":"AT"}'),
  ('44444444-4444-4444-4444-444444444444','d@x.de','{"handle":"manuel","display_name":"Manuel","country_code":"CH"}');

select count(*) as profiles_created from public.profiles;

-- a running season, one round already open
insert into public.seasons (discipline_id, format_id, slug, name, state, round_count,
                            registration_opens_at, starts_at, ends_at)
select d.id, f.id, 'ar10et-2026-h2', 'AR10ET Ladder 2026 H2', 'running', 2,
       now() - interval '30 days', now() - interval '1 day', now() + interval '60 days'
  from public.disciplines d, public.formats f
 where d.code = 'AR10ET' and f.code = 'best_of_five';

insert into public.season_entries (season_id, shooter_id)
select s.id, p.id from public.seasons s, public.profiles p where s.slug = 'ar10et-2026-h2';

insert into public.rounds (season_id, index, opens_at, closes_at)
select id, 1, now() - interval '1 hour', now() + interval '7 days' from public.seasons where slug = 'ar10et-2026-h2';

select public.pair_round(id) as matches_created from public.rounds where index = 1;

select m.state, count(b.*) as bouts, min(b.state::text) as bout_state
  from public.matches m join public.bouts b on b.match_id = m.id
 group by m.id, m.state;

-- Play the first match. AR10ET is scored in tenths, so inner tens are not
-- asked for: one number and a photo, which is the everyday path.
do $$
declare
  v_match public.matches%rowtype;
  v_bout  public.bouts%rowtype;
begin
  select * into v_match from public.matches order by id limit 1;

  for v_bout in select * from public.bouts where match_id = v_match.id order by index loop
    -- A reports 104.4, B reports 102.7 -> A wins every bout
    insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
      values (v_bout.id, v_match.shooter_a, 104.4, now(), v_bout.id::text || '/a/shot.jpg');

    raise notice 'after A submits bout %: bout state=%',
      v_bout.index, (select state from public.bouts where id = v_bout.id);

    insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
      values (v_bout.id, v_match.shooter_b, 102.7, now(), v_bout.id::text || '/b/shot.jpg');

    exit when (select state from public.matches where id = v_match.id) <> 'live';
  end loop;
end $$;

select index, state, is_tie, (winner_id is not null) as has_winner,
       (confirm_closes_at is not null) as confirm_window_set
  from public.bouts
 where match_id = (select id from public.matches order by id limit 1)
 order by index;

select state, points_a, points_b, decided_by,
       (winner_id = shooter_a) as a_won,
       dispute_closes_at > now() as dispute_window_open
  from public.matches order by id limit 1;

-- finalize must refuse while the dispute window is open
select public.finalize_match((select id from public.matches order by id limit 1)) as finalize_too_early;

-- close the window, then finalize
update public.matches set dispute_closes_at = now() - interval '1 minute'
 where id = (select id from public.matches order by id limit 1);

select public.finalize_match((select id from public.matches order by id limit 1)) as finalize_now;
select public.finalize_match((select id from public.matches order by id limit 1)) as finalize_again_idempotent;

select p.handle, r.rating, r.rd, r.volatility, r.matches_played, r.wins, r.losses
  from public.ratings r join public.profiles p on p.id = r.shooter_id
 order by r.rating desc;

select count(*) as rating_events from public.rating_events;

-- recent form, used by the client to warn about a slipped digit before upload
select 'thomas form: ' || series || ' series, avg ' || average || ', best ' || best
  from public.shooter_recent_form(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.disciplines where code = 'AR10ET'));

-- a file export may carry the individual shots; they must agree with the numbers
insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
       'live', now() - interval '1 hour', now() + interval '7 days'
  from public.disciplines d, public.formats f where d.code='AR10ET' and f.code='single_10';

insert into public.submissions (bout_id, shooter_id, total, shots, shot_at, photo_path, source)
select b.id, m.shooter_a, 100.4,
       array[10.5,10.4,10.3,10.6,10.2,10.5,10.4,9.8,10.7,7.0], now(),
       b.id::text || '/c/export.jpg', 'file_export'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.shooter_a = '33333333-3333-3333-3333-333333333333'
   and m.format_id = (select id from public.formats where code = 'single_10');

select 'file export accepted, total ' || total || ' / source ' || source
  from public.submissions where source = 'file_export';

-- Pistol is scored in whole rings, so inner tens are mandatory there.
insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
       'live', now() - interval '1 hour', now() + interval '7 days'
  from public.disciplines d, public.formats f where d.code='AP10ET' and f.code='single_10';

insert into public.submissions (bout_id, shooter_id, total, inner_tens, shot_at, photo_path)
select b.id, m.shooter_a, 95, 4, now(), b.id::text || '/a/p.jpg'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.discipline_id = (select id from public.disciplines where code='AP10ET');

insert into public.submissions (bout_id, shooter_id, total, inner_tens, shot_at, photo_path)
select b.id, m.shooter_b, 95, 2, now(), b.id::text || '/b/p.jpg'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.discipline_id = (select id from public.disciplines where code='AP10ET');

select 'pistol tie 95:95 decided by ' || decided_by || ', winner has more inner tens: '
       || (winner_id = '11111111-1111-1111-1111-111111111111')::text
  from public.matches
 where discipline_id = (select id from public.disciplines where code='AP10ET');

rollback;
