-- A report that misses the window is late, not worthless.
--
-- The app has been telling shooters that a series arriving after the two hours
-- "counts as practice". It did not. It was refused outright and the evening was
-- gone — the one thing the previous migration set out to stop.
--
-- So make the sentence true. A late report is stored with everything a report
-- carries, straight into 'expired': it counts in the shooter's own record, it
-- is never offered to the matcher, and it never touches a rating. The window
-- still does its only job, which is deciding what may be compared with somebody
-- else — not deciding whether a shooter is allowed to have shot.
--
-- Two details that are not obvious:
--
--   The sweep may get there first. A declaration whose window has passed is set
--   to 'expired' by the tick every ten minutes, so whether a late report was
--   refused for being late or for being "already reported" came down to which
--   side of a ten-minute boundary it landed on. An expired declaration with no
--   numbers on it is therefore still reportable.
--
--   A day, and no longer. Without a bound, a declaration could be kept as an
--   open notebook and filled in whenever. Twenty-four hours covers the range
--   with no signal, the phone that died, the drive home — and nothing else.
--
-- Which leaves one thing to tell apart: a declaration the sweep tidied away and
-- one the shooter withdrew both ended up as 'expired' with no numbers on them,
-- and only the first should still be reportable. So withdrawing now says so.

alter table public.open_series add column if not exists withdrawn_at timestamptz;

comment on column public.open_series.withdrawn_at is
  'Set when the shooter said "never mind" rather than the window simply passing. '
  'Both end as expired; only one of them may still be reported.';

create or replace function public.withdraw_open_series(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.open_series
     set state = 'expired',
         withdrawn_at = now()
   where id = p_id and shooter_id = auth.uid() and state in ('open', 'reported');
end;
$$;

-- ------------------------------------------------------------------ photos --

-- Same grace for the photograph, or the report would arrive with nothing to
-- check it against.
create or replace function public.target_photo_writable(p_folder uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_owner = auth.uid()
    and (
      public.can_submit_to_bout(p_folder, auth.uid())
      -- Or a series they declared and have not put numbers on yet. Late is
      -- allowed, for a day, because a late series is still a series they shot.
      or exists (
        select 1 from public.open_series o
         where o.id = p_folder
           and o.shooter_id = auth.uid()
           and o.state in ('open', 'expired')
           and o.total is null
           and o.withdrawn_at is null
           and o.report_by > now() - interval '24 hours'
      )
    );
$$;

-- ----------------------------------------------------------------- report ---

drop function if exists public.report_open_series(
  uuid, numeric, integer, text, timestamptz, public.capture_method
);

/**
 * Put numbers on a declared series.
 *
 * Returns the state it landed in: 'reported' if it is now waiting for somebody
 * to be compared with, 'expired' if it arrived too late for that and was kept
 * as practice. Both are successes — the caller has to say which.
 */
create or replace function public.report_open_series(
  p_id             uuid,
  p_total          numeric,
  p_inner_tens     integer default null,
  p_photo_path     text default null,
  p_shot_at        timestamptz default null,
  p_capture_method public.capture_method default 'in_app_camera'
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_series public.open_series%rowtype;
  v_shot   timestamptz := coalesce(p_shot_at, now());
  v_late   boolean;
  v_state  public.open_series_state;
begin
  select * into v_series from public.open_series where id = p_id for update;

  if not found or v_series.shooter_id <> auth.uid() then
    raise exception 'that is not your series' using errcode = 'insufficient_privilege';
  end if;

  -- 'expired' with nothing on it is a declaration the sweep tidied away, which
  -- is the same thing as an open one whose window has passed. A withdrawn one
  -- is not: that shooter already said they were not shooting it.
  if v_series.total is not null
     or v_series.withdrawn_at is not null
     or v_series.state not in ('open', 'expired') then
    raise exception 'this series has already been reported' using errcode = 'check_violation';
  end if;

  -- The server's clock, always. A phone may hold the report while there is no
  -- signal, but a client that claims it tried in time proves nothing: whatever
  -- it claims, the series somebody could choose between are the ones they shot
  -- between declaring and this arriving.
  v_late := now() > v_series.report_by;

  if now() > v_series.report_by + interval '24 hours' then
    raise exception 'that window closed more than a day ago'
      using errcode = 'check_violation';
  end if;

  if p_photo_path is null then
    raise exception 'a photograph of the display is what makes this checkable'
      using errcode = 'not_null_violation';
  end if;

  perform public.check_series_numbers(v_series.discipline_id, p_total, p_inner_tens);

  -- Shot inside the window it was declared for, whenever the report itself
  -- managed to arrive. An hour of slack for a phone clock that drifts.
  if v_shot < v_series.opens_at - interval '1 minute'
     or v_shot > least(now(), v_series.report_by) + interval '1 hour' then
    raise exception 'this series was not shot inside the window you opened'
      using errcode = 'check_violation';
  end if;

  v_state := case when v_late then 'expired' else 'reported' end::public.open_series_state;

  update public.open_series
     set state = v_state,
         total = p_total,
         inner_tens = p_inner_tens,
         photo_path = p_photo_path,
         capture_method = p_capture_method,
         shot_at = v_shot,
         reported_at = now()
   where id = p_id;

  if v_late then
    -- Said out loud, because the shooter who queued this on a phone in a
    -- basement will not be looking at the screen when it finally goes out.
    perform public.enqueue_notification(
      v_series.shooter_id,
      'open_series_expired',
      'Too late to be compared',
      'Your series arrived after the two hours, so it is in your own record as '
        || 'practice. Your rating is untouched.',
      jsonb_build_object('route', '/(tabs)/profile'),
      null,
      null
    );
  else
    perform public.match_open_series();
  end if;

  return v_state::text;
end;
$$;

grant execute on function public.report_open_series(
  uuid, numeric, integer, text, timestamptz, public.capture_method
) to authenticated;
