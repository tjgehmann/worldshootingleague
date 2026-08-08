\set ON_ERROR_STOP off
\pset tuples_only on

-- The age gate, recorded consent, the export, and what deletion leaves behind.

-- ==================================================== 1. an adult gets in ===
insert into auth.users (id, email, raw_user_meta_data) values
  ('acc00000-0000-0000-0000-000000000001','adult@x.de',
   '{"handle":"grownup","display_name":"Grown Up","date_of_birth":"1988-03-02"}');

select 'adult signed up, consent recorded: ' ||
       (terms_accepted_at is not null and terms_version is not null)::text
  from public.profiles where id = 'acc00000-0000-0000-0000-000000000001';

-- ====================================================== 2. a minor cannot ===
-- expect failure: under 18
insert into auth.users (id, email, raw_user_meta_data) values
  ('acc00000-0000-0000-0000-000000000002','junior@x.de',
   '{"handle":"junior","display_name":"Junior","date_of_birth":"2014-06-01"}');

-- expect failure: no date of birth at all
insert into auth.users (id, email, raw_user_meta_data) values
  ('acc00000-0000-0000-0000-000000000003','nodob@x.de',
   '{"handle":"nodob","display_name":"No DOB"}');

select 'accounts that exist: ' || count(*)::text || ' (only the adult)'
  from public.profiles where id::text like 'acc00000%';

-- Turning 18 exactly today is old enough; one day short is not.
select 'eighteen today: ' || public.is_adult((current_date - interval '18 years')::date)::text;
select 'a day short: ' ||
       public.is_adult((current_date - interval '18 years' + interval '1 day')::date)::text;

-- ========================================================== 3. the export ===
insert into public.matches (discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at)
select d.id, f.id, 'acc00000-0000-0000-0000-000000000001',
       '11111111-1111-1111-1111-111111111111',
       'live', now() - interval '1 hour', now() + interval '7 days'
  from public.disciplines d, public.formats f
 where d.code = 'AR10ET' and f.code = 'single_10';

insert into public.submissions (bout_id, shooter_id, total, shot_at, photo_path)
select b.id, 'acc00000-0000-0000-0000-000000000001', 101.5, now(), b.id::text || '/a/x.jpg'
  from public.bouts b join public.matches m on m.id = b.match_id
 where m.shooter_a = 'acc00000-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claim.sub = 'acc00000-0000-0000-0000-000000000001';

select 'export carries the profile and 1 submission: ' ||
       ((public.export_my_data() -> 'profile' ->> 'handle') = 'grownup' and
        jsonb_array_length(public.export_my_data() -> 'submissions') = 1)::text;

-- ======================================================== 4. the deletion ===
select public.request_account_deletion('No longer shooting.');

reset role;
reset request.jwt.claim.sub;

select 'the name is gone: ' || (display_name = 'Former shooter')::text ||
       ', handle rewritten: ' || (handle <> 'grownup')::text ||
       ', dob dropped: ' || (date_of_birth is null)::text ||
       ', hidden: ' || (is_public = false)::text
  from public.profiles where id = 'acc00000-0000-0000-0000-000000000001';

select 'the result they shot survives: ' || count(*)::text
  from public.submissions where shooter_id = 'acc00000-0000-0000-0000-000000000001';

select 'queued for the operator: ' || count(*)::text
  from public.deletion_requests where shooter_id = 'acc00000-0000-0000-0000-000000000001';

select 'push is off and no tokens are left: ' ||
       (not exists (select 1 from public.device_tokens
                     where shooter_id = 'acc00000-0000-0000-0000-000000000001'))::text;

-- ================================================= 5. the beta's own numbers ==
insert into auth.users (id, email, raw_user_meta_data) values
  ('acc00000-0000-0000-0000-00000000000a','boss@x.de',
   '{"handle":"theboss","display_name":"The Boss","date_of_birth":"1980-01-01"}');
update public.profiles set role = 'admin' where id = 'acc00000-0000-0000-0000-00000000000a';

set role authenticated;
set request.jwt.claim.sub = 'acc00000-0000-0000-0000-000000000001';

-- expect failure: a shooter cannot read the beta's numbers
select * from public.beta_health(30);

set request.jwt.claim.sub = 'acc00000-0000-0000-0000-00000000000a';

select 'health: ' || metric || ' = ' || coalesce(value::text, 'n/a') || ' (' || detail || ')'
  from public.beta_health(30);

select 'backlog: ' || metric || ' = ' || value || ' (' || detail || ')'
  from public.beta_backlog();

reset role;
reset request.jwt.claim.sub;
