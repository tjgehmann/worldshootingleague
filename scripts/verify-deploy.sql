-- Post-deploy check. Run against a linked Supabase project after
-- `supabase db push` and `psql -f supabase/seed.sql`:
--
--   psql "$DATABASE_URL" -f scripts/verify-deploy.sql
--
-- Every line must end in OK. Anything else means the migration did not fully
-- land, and the app will fail in ways that look like client bugs.

\pset tuples_only on

select 'tables:            ' ||
       case when count(*) = 21 then 'OK (21)' else 'MISSING — found ' || count(*) end
  from pg_tables
 where schemaname = 'public'
   and tablename in (
     'profiles','disciplines','formats','seasons','season_entries','rounds',
     'matches','bouts','submissions','bout_confirmations','disputes',
     'ratings','rating_events',
     'clubs','club_members','club_invites','club_season_entries','team_matches',
     'device_tokens','notifications','deletion_requests');

select 'rls enabled:       ' ||
       case when count(*) = 0 then 'OK' else 'FAIL — unprotected: ' || string_agg(relname, ', ') end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and not c.relrowsecurity;

select 'blind reveal:      ' ||
       case when count(*) = 3 then 'OK'
            else 'FAIL — expected 3 select policies on submissions, found ' || count(*) end
  from pg_policies
 where schemaname = 'public' and tablename = 'submissions' and cmd = 'SELECT';

select 'submissions write: ' ||
       case
         when count(*) filter (where cmd = 'INSERT') = 1
          and count(*) filter (where cmd = 'DELETE') = 0
         then 'OK (insert only, no delete)'
         else 'FAIL — submissions must be insert-only for shooters'
       end
  from pg_policies
 where schemaname = 'public' and tablename = 'submissions';

select 'functions:         ' ||
       case when count(*) = 31 then 'OK (31)' else 'MISSING — found ' || count(*) end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'advance_match','finalize_match','glicko2_update','pair_round',
     'expire_bouts','expire_confirmations','run_league_tick','shooter_recent_form',
     'create_club','redeem_club_invite','club_lineup','pair_team_round',
     'advance_team_match','enqueue_deadline_reminders',
     -- the referee console
     'claim_dispute','decide_dispute','submission_effective_inner_tens',
     -- joining a season from the app, as a shooter or as a club
     'join_season','leave_season','my_season_entry',
     'enter_club_in_season','withdraw_club_from_season','my_club_season_entries',
     'club_eligible_count',
     -- getting the rest of the club in
     'create_club_invite','club_invites_active','revoke_club_invite',
     -- accounts, consent and deletion
     'is_adult','request_account_deletion','export_my_data',
     -- what the beta is measured by
     'beta_health','beta_backlog',
     -- the second delivery channel
     'pending_email_notifications',
     -- editing a profile without lying about which club fields you
     'check_primary_club_membership','shares_a_match_with');

select 'views:             ' ||
       case when count(*) = 5 then 'OK (5)' else 'MISSING — found ' || count(*) end
  from pg_views
 where schemaname = 'public'
   and viewname in ('leaderboard','match_results','shooter_reliability','club_standings',
                    'dispute_queue');

select 'notification dedupe:' ||
       case when count(*) = 1 then ' OK'
            else ' MISSING — reminders would resend on every tick' end
  from pg_indexes
 where schemaname = 'public' and indexname = 'notifications_dedupe';

select 'outbox is private:  ' ||
       case when count(*) = 2 then 'OK (own rows only)'
            else 'CHECK — found ' || count(*) || ' policies' end
  from pg_policies
 where schemaname = 'public' and tablename = 'notifications';

select 'triggers:          ' ||
       case when count(*) >= 4 then 'OK' else 'MISSING — found ' || count(*) end
  from pg_trigger
 where tgname in (
   'submissions_validate','submissions_reveal','matches_create_bouts','on_auth_user_created');

select 'storage buckets:   ' ||
       case when count(*) = 2 then 'OK (target-photos, avatars)'
            else 'MISSING — found ' || count(*) end
  from storage.buckets
 where id in ('target-photos','avatars');

select 'target-photos:     ' ||
       case when bool_and(not public) then 'OK (private)' else 'FAIL — bucket is public!' end
  from storage.buckets where id = 'target-photos';

select 'photo policies:    ' ||
       case when count(*) = 4 then 'OK (4, no update/delete)'
            else 'CHECK — found ' || count(*) end
  from pg_policies
 where schemaname = 'storage' and policyname like 'target_photos%';

select 'seed disciplines:  ' ||
       case when count(*) >= 4 then 'OK (' || count(*) || ')'
            else 'MISSING — run supabase/seed.sql' end
  from public.disciplines;

select 'seed formats:      ' ||
       case when count(*) >= 2 then 'OK (' || count(*) || ')'
            else 'MISSING — run supabase/seed.sql' end
  from public.formats;

select 'pg_cron:           ' ||
       case when count(*) = 1 then 'OK' else 'MISSING — enable it in Database > Extensions' end
  from pg_extension where extname = 'pg_cron';

-- cron.job only exists once pg_cron is installed, so this cannot be a plain
-- select: on a project without the extension the query would abort the script
-- instead of reporting the very thing it is checking for.
do $$
declare
  v_count integer;
begin
  if to_regclass('cron.job') is null then
    raise notice 'league tick job:   MISSING — pg_cron not installed';
  else
    execute $q$ select count(*) from cron.job where jobname = 'league-tick' $q$ into v_count;
    if v_count = 1 then
      raise notice 'league tick job:   OK (every 10 min)';
    else
      raise notice 'league tick job:   MISSING — cron.schedule did not run';
    end if;
  end if;
end $$;

-- Glicko-2 against the reference values the local suite checks.
select 'glicko-2 maths:    ' ||
       case when rating = 1662.31 and rd = 290.32 then 'OK'
            else 'FAIL — got ' || rating || ' / ' || rd || ', expected 1662.31 / 290.32' end
  from public.glicko2_update(1500, 350, 0.06, 1500, 350, 1);
