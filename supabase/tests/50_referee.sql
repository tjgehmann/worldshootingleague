\set ON_ERROR_STOP off
\pset tuples_only on

-- The four endings a referee can give a case, and who is allowed to give them.

insert into auth.users (id, email, raw_user_meta_data) values
  ('eeee0000-0000-0000-0000-000000000001','ra@x.de','{"handle":"ref_a","display_name":"RefShooterA","date_of_birth":"1990-05-14"}'),
  ('eeee0000-0000-0000-0000-000000000002','rb@x.de','{"handle":"ref_b","display_name":"RefShooterB","date_of_birth":"1990-05-14"}'),
  ('eeee0000-0000-0000-0000-000000000003','rc@x.de','{"handle":"ref_c","display_name":"RefShooterC","date_of_birth":"1990-05-14"}'),
  ('eeee0000-0000-0000-0000-000000000004','rd@x.de','{"handle":"ref_d","display_name":"RefShooterD","date_of_birth":"1990-05-14"}'),
  ('eeee0000-0000-0000-0000-00000000000f','ref@x.de','{"handle":"the_ref","display_name":"TheReferee","date_of_birth":"1990-05-14"}');

update public.profiles set role = 'referee' where id = 'eeee0000-0000-0000-0000-00000000000f';

-- A one-series pistol match, so inner tens are in play.
create or replace function pg_temp.new_case(
  p_a uuid, p_b uuid, p_total_a numeric, p_inner_a integer,
  p_total_b numeric, p_inner_b integer
)
returns uuid
language plpgsql
as $$
declare
  v_match uuid;
  v_bout  uuid;
begin
  insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
  select d.id, f.id, p_a, p_b, 'live', now() - interval '1 hour', now() + interval '7 days'
    from public.disciplines d, public.formats f
   where d.code = 'AP10ET' and f.code = 'single_10'
  returning id into v_match;

  select id into v_bout from public.bouts where match_id = v_match;

  insert into public.submissions (bout_id, shooter_id, total, inner_tens, shot_at, photo_path)
  values (v_bout, p_a, p_total_a, p_inner_a, now(), v_bout::text || '/a/x.jpg'),
         (v_bout, p_b, p_total_b, p_inner_b, now(), v_bout::text || '/b/x.jpg');

  insert into public.disputes (bout_id, match_id, raised_by, reason)
  values (v_bout, v_match, p_b, 'The photo shows a different total than was reported.');

  return v_match;
end;
$$;

-- ================================================ 1. a shooter cannot decide ==
select 'case 1 match: ' || pg_temp.new_case(
  'eeee0000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-000000000002',
  95, 4, 92, 2)::text;

select 'blocked while disputed: ' || (state = 'awaiting_review')::text
  from public.matches where shooter_a = 'eeee0000-0000-0000-0000-000000000001';

select 'finalize refused while open: ' || (public.finalize_match(id) = false)::text
  from public.matches where shooter_a = 'eeee0000-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claim.sub = 'eeee0000-0000-0000-0000-000000000002';

-- expect failure: the complainant is not a referee
select public.decide_dispute(
  (select d.id from public.disputes d join public.matches m on m.id = d.match_id
    where m.shooter_a = 'eeee0000-0000-0000-0000-000000000001'),
  'unchanged', 'This is my own case and I would like to win it.');

reset role;
reset request.jwt.claim.sub;

-- ============================================== 2. unchanged: report stands ==
set role authenticated;
set request.jwt.claim.sub = 'eeee0000-0000-0000-0000-00000000000f';

select 'queue shows ' || count(*) || ' open case(s) to the referee'
  from public.dispute_queue where state in ('open', 'assigned');

select public.claim_dispute(
  (select dispute_id from public.dispute_queue
    where shooter_a = 'eeee0000-0000-0000-0000-000000000001'));

select 'claimed: ' || state || ' by the referee: ' ||
       (referee_id = 'eeee0000-0000-0000-0000-00000000000f')::text
  from public.dispute_queue where shooter_a = 'eeee0000-0000-0000-0000-000000000001';

select public.decide_dispute(
  (select dispute_id from public.dispute_queue
    where shooter_a = 'eeee0000-0000-0000-0000-000000000001'),
  'unchanged', 'Photo and report agree. The complaint does not hold.');

reset role;
reset request.jwt.claim.sub;

select 'unchanged -> ' || state || ', winner is A: ' ||
       (winner_id = 'eeee0000-0000-0000-0000-000000000001')::text
  from public.matches where shooter_a = 'eeee0000-0000-0000-0000-000000000001';

select 'dispute closed as: ' || outcome::text
  from public.disputes d join public.matches m on m.id = d.match_id
 where m.shooter_a = 'eeee0000-0000-0000-0000-000000000001';

select 'both shooters told: ' || count(*)
  from public.notifications n
  join public.matches m on m.id = n.match_id
 where m.shooter_a = 'eeee0000-0000-0000-0000-000000000001' and n.kind = 'dispute_resolved';

-- ================================ 3. corrected: the correction flips the win ==
select 'case 3 match: ' || pg_temp.new_case(
  'eeee0000-0000-0000-0000-000000000003', 'eeee0000-0000-0000-0000-000000000004',
  98, 5, 94, 3)::text;

set role authenticated;
set request.jwt.claim.sub = 'eeee0000-0000-0000-0000-00000000000f';

select public.decide_dispute(
  (select dispute_id from public.dispute_queue
    where shooter_a = 'eeee0000-0000-0000-0000-000000000003'),
  'corrected',
  'The display shows 89, not 98. Corrected to what the photo says.',
  (select s.id from public.submissions s
     join public.bouts b on b.id = s.bout_id
     join public.matches m on m.id = b.match_id
    where m.shooter_a = 'eeee0000-0000-0000-0000-000000000003'
      and s.shooter_id = 'eeee0000-0000-0000-0000-000000000003'),
  89, 1);

reset role;
reset request.jwt.claim.sub;

select 'corrected -> winner is B: ' ||
       (winner_id = 'eeee0000-0000-0000-0000-000000000004')::text
  from public.matches where shooter_a = 'eeee0000-0000-0000-0000-000000000003';

select 'the reported total is still readable: ' || s.total ||
       ' next to the correction ' || s.adjusted_total
  from public.submissions s
  join public.bouts b on b.id = s.bout_id
  join public.matches m on m.id = b.match_id
 where m.shooter_a = 'eeee0000-0000-0000-0000-000000000003'
   and s.shooter_id = 'eeee0000-0000-0000-0000-000000000003';

-- ================================================= 4. forfeited and voided ==
select 'case 4 match: ' || pg_temp.new_case(
  'eeee0000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-000000000003',
  97, 4, 93, 2)::text;

set role authenticated;
set request.jwt.claim.sub = 'eeee0000-0000-0000-0000-00000000000f';

select public.decide_dispute(
  (select dispute_id from public.dispute_queue
    where shooter_a = 'eeee0000-0000-0000-0000-000000000001'
      and shooter_b = 'eeee0000-0000-0000-0000-000000000003'),
  'forfeited', 'No photo of the display was supplied for this series.',
  null, null, null, 'eeee0000-0000-0000-0000-000000000003');

reset role;
reset request.jwt.claim.sub;

select 'forfeited -> bout ' || b.state || ', match decided_by=' || m.decided_by::text
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.shooter_a = 'eeee0000-0000-0000-0000-000000000001'
   and m.shooter_b = 'eeee0000-0000-0000-0000-000000000003';

select 'the untrusted report is marked: ' || s.state::text
  from public.submissions s
  join public.bouts b on b.id = s.bout_id
  join public.matches m on m.id = b.match_id
 where m.shooter_a = 'eeee0000-0000-0000-0000-000000000001'
   and m.shooter_b = 'eeee0000-0000-0000-0000-000000000003'
   and s.shooter_id = 'eeee0000-0000-0000-0000-000000000001';

select 'case 5 match: ' || pg_temp.new_case(
  'eeee0000-0000-0000-0000-000000000002', 'eeee0000-0000-0000-0000-000000000004',
  91, 2, 91, 2)::text;

set role authenticated;
set request.jwt.claim.sub = 'eeee0000-0000-0000-0000-00000000000f';

select public.decide_dispute(
  (select dispute_id from public.dispute_queue
    where shooter_a = 'eeee0000-0000-0000-0000-000000000002'),
  'voided', 'The range was mis-set. Neither series can be scored.');

reset role;
reset request.jwt.claim.sub;

-- Voiding the only series leaves nothing to score, so a decider is added
-- rather than a winner being invented.
select 'voided -> match ' || m.state || ', bouts: ' ||
       (select count(*) from public.bouts where match_id = m.id) ||
       ', open again: ' || (select count(*) from public.bouts where match_id = m.id and state = 'open')
  from public.matches m where m.shooter_a = 'eeee0000-0000-0000-0000-000000000002';

-- ==================================================== 5. a case ends once ===
set role authenticated;
set request.jwt.claim.sub = 'eeee0000-0000-0000-0000-00000000000f';

-- expect failure: already resolved
select public.decide_dispute(
  (select d.id from public.disputes d join public.matches m on m.id = d.match_id
    where m.shooter_a = 'eeee0000-0000-0000-0000-000000000002'),
  'unchanged', 'Trying to decide the same case a second time.');

-- expect failure: a decision without a readable reason
select public.decide_dispute(
  (select d.id from public.disputes d join public.matches m on m.id = d.match_id
    where m.shooter_a = 'eeee0000-0000-0000-0000-000000000003'),
  'unchanged', 'nope');

reset role;
reset request.jwt.claim.sub;
