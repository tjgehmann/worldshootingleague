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

-- play the first match: shooter_a takes bouts 1-3
do $$
declare
  v_match public.matches%rowtype;
  v_bout  public.bouts%rowtype;
  v_a numeric[]; v_b numeric[];
begin
  select * into v_match from public.matches order by id limit 1;

  for v_bout in select * from public.bouts where match_id = v_match.id order by index loop
    -- a shoots 104.x, b shoots 102.x -> a wins every bout, match ends after 3
    v_a := array[10.5,10.4,10.3,10.6,10.2,10.5,10.4,10.3,10.7,10.5];
    v_b := array[10.1,10.2,10.0, 9.8,10.3,10.1, 9.9,10.2,10.0,10.1];

    insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
      values (v_bout.id, v_match.shooter_a, v_a, now(), 'manual');

    raise notice 'after A submits bout %: bout state=%',
      v_bout.index, (select state from public.bouts where id = v_bout.id);

    insert into public.submissions (bout_id, shooter_id, shots, shot_at, source)
      values (v_bout.id, v_match.shooter_b, v_b, now(), 'manual');

    exit when (select state from public.matches where id = v_match.id) <> 'live';
  end loop;
end $$;

select index, state, is_tie, (winner_id is not null) as has_winner
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

rollback;
