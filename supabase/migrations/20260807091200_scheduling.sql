-- Scheduled maintenance.
--
-- Enable pg_cron in the Supabase dashboard (Database > Extensions) before
-- applying this migration against a hosted project.

create extension if not exists pg_cron;

-- One entry point so there is a single thing to call, monitor and test.
create or replace function public.run_league_tick()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rounds     integer;
  v_expired    integer;
  v_voided     integer;
  v_confirmed  integer;
  v_finalized  integer := 0;
  v_match      record;
begin
  v_rounds    := public.open_due_rounds();
  v_expired   := public.expire_bouts();
  v_voided    := public.void_dead_matches();
  v_confirmed := public.expire_confirmations();

  for v_match in
    select id from public.matches
     where state = 'settled'
       and dispute_closes_at is not null
       and dispute_closes_at <= now()
     limit 500
  loop
    if public.finalize_match(v_match.id) then
      v_finalized := v_finalized + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'rounds_paired',        v_rounds,
    'bouts_expired',        v_expired,
    'matches_voided',       v_voided,
    'confirmations_lapsed', v_confirmed,
    'matches_finalized',    v_finalized,
    'at', now()
  );
end;
$$;

select cron.schedule(
  'league-tick',
  '*/10 * * * *',
  $$ select public.run_league_tick(); $$
);
