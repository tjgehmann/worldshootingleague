-- Two hours instead of forty-five minutes, and why the number is the number.
--
-- The window exists to stop somebody shooting ten series and reporting the
-- best. The tempting way to be kind about a basement with no signal is to let
-- the client say when it *tried* to send — but that timestamp comes from the
-- device, and anyone can set it. Worse, it buys nothing: whatever the client
-- claims, the set of series somebody can choose between is everything they shot
-- between declaring and the report actually arriving. Accepting a late delivery
-- widens that set by exactly as much as widening the window would, while
-- looking stricter than it is.
--
-- So the honest lever is the window itself, checked on the server clock, and it
-- is set to what the real case needs: shoot, pack up, walk out of the range,
-- have a signal in the car park. Anything later counts as practice.
--
-- The client queues the report while there is no reception and sends it as soon
-- as there is, which is what makes the two hours usable rather than theoretical.
-- With a limit of ten series a day, the worst a determined shooter can do is
-- choose between the few they fired inside one window — and Glicko-2 makes even
-- that a slow way to gain anything.

create or replace function public.open_series_report_minutes()
returns integer language sql immutable as $$ select 120 $$;

comment on function public.open_series_report_minutes() is
  'Minutes from declaring a series to the report having to be on the server. '
  'This is the only real bound on which series a shooter can choose to submit, '
  'so it is checked against now() and never against a client timestamp.';

-- A refusal cannot also record that it happened: the update and the raise are
-- one statement, so the exception rolls the update back. Letting go of a series
-- whose window has passed is therefore the sweep's job alone, which is where it
-- belongs — one place decides what 'expired' means.
create or replace function public.report_open_series(
  p_id             uuid,
  p_total          numeric,
  p_inner_tens     integer default null,
  p_photo_path     text default null,
  p_shot_at        timestamptz default null,
  p_capture_method public.capture_method default 'in_app_camera'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_series public.open_series%rowtype;
  v_shot   timestamptz := coalesce(p_shot_at, now());
begin
  select * into v_series from public.open_series where id = p_id for update;

  if not found or v_series.shooter_id <> auth.uid() then
    raise exception 'that is not your series' using errcode = 'insufficient_privilege';
  end if;

  if v_series.state <> 'open' then
    raise exception 'this series has already been reported' using errcode = 'check_violation';
  end if;

  -- The server's clock, always. A phone may hold the report while there is no
  -- signal, but a client that claims it tried in time proves nothing: whatever
  -- it claims, the series somebody could choose between are the ones they shot
  -- between declaring and this arriving.
  if now() > v_series.report_by then
    raise exception 'the two hours ran out before this arrived; it counts as practice'
      using errcode = 'check_violation';
  end if;

  if p_photo_path is null then
    raise exception 'a photograph of the display is what makes this checkable'
      using errcode = 'not_null_violation';
  end if;

  perform public.check_series_numbers(v_series.discipline_id, p_total, p_inner_tens);

  if v_shot < v_series.opens_at - interval '1 minute' or v_shot > now() + interval '1 hour' then
    raise exception 'this series was not shot inside the window you opened'
      using errcode = 'check_violation';
  end if;

  update public.open_series
     set state = 'reported',
         total = p_total,
         inner_tens = p_inner_tens,
         photo_path = p_photo_path,
         capture_method = p_capture_method,
         shot_at = v_shot,
         reported_at = now()
   where id = p_id;

  perform public.match_open_series();

  return p_id;
end;
$$;
