-- Every series is a measurement, even the ones nobody was there to compare.
--
-- A shooter who declares, shoots and reports has done everything asked of them.
-- That nobody else was at a range that evening is not their doing, and telling
-- them "nothing happened" is both unfair and the fastest way to stop them
-- reporting at all.
--
-- Three answers here, in the order of how much they are worth:
--
-- 1. Stop losing them. A reported series waited three days and was dropped;
--    now it waits a fortnight. A series that has been sitting since Tuesday is
--    paired against one shot on Sunday the moment it appears — and that is not
--    a weaker comparison than a live one, because both numbers were sealed
--    before either shooter knew the other existed. It is the same blind reveal
--    with a longer gap.
--
-- 2. Count it as form. Everything reported goes into the shooter's own record —
--    how many series, what they average, their best — whether or not it was
--    ever compared. This is the Schießbuch every shooter already keeps, and it
--    is the honest thing to give somebody for a series nobody answered.
--
-- 3. Tell them. A series that is let go now says so instead of vanishing.
--
-- What is deliberately NOT here: moving the rating for an uncompared series.
-- The rating is what one shooter's number means against another's, and the
-- only reason to believe any reported number is that the opponent looked at the
-- photograph. A series nobody was matched with is a series nobody checked.
-- Rating it would put unverified numbers into the one figure that is supposed
-- to be worth something — and it would make "report a good series and hope
-- nobody matches it" a strategy. So: it counts for the shooter, in full, and it
-- does not count for the ladder.

alter type public.notification_kind add value if not exists 'open_series_expired';

-- ------------------------------------------------------------- patience ----

/**
 * How long a reported series stays matchable.
 *
 * Was three days, which was short enough that a quiet week could waste
 * somebody's evening. A fortnight makes going unmatched a statement about the
 * league being empty rather than about timing.
 */
create or replace function public.open_series_patience()
returns interval language sql immutable as $$ select interval '14 days' $$;

-- ----------------------------------------------------------------- form ----

/**
 * The shooter's own record, per discipline: everything they reported, compared
 * or not.
 *
 * Deliberately separate from the rating. This says how well somebody shoots;
 * the rating says how they do against other people, and only the second one
 * needs an opponent to have checked the photograph.
 */
create or replace function public.shooter_form(p_shooter uuid default auth.uid())
returns table (
  discipline_id   uuid,
  discipline_code text,
  series          integer,
  compared        integer,
  practice        integer,
  average         numeric,
  best            numeric,
  last_shot_at    timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with everything as (
    -- Series that became a match, from the submission that carries them.
    select m.discipline_id,
           public.submission_effective_total(s) as total,
           s.shot_at,
           true as compared
      from public.submissions s
      join public.bouts b   on b.id = s.bout_id
      join public.matches m on m.id = b.match_id
     where s.shooter_id = p_shooter
       and b.state in ('settled', 'forfeited')

    union all

    -- And the ones nobody turned up for. A series that was matched is already
    -- in the half above, so only the unmatched ones are taken from here.
    select o.discipline_id, o.total, o.shot_at, false
      from public.open_series o
     where o.shooter_id = p_shooter
       and o.state in ('reported', 'expired')
       and o.total is not null
       and o.match_id is null
  )
  select e.discipline_id,
         d.code,
         count(*)::integer,
         count(*) filter (where e.compared)::integer,
         count(*) filter (where not e.compared)::integer,
         round(avg(e.total), 1),
         max(e.total),
         max(e.shot_at)
    from everything e
    join public.disciplines d on d.id = e.discipline_id
   group by e.discipline_id, d.code
   order by max(e.shot_at) desc;
$$;

grant execute on function public.shooter_form(uuid) to authenticated;

-- The warning before submitting compares against what the shooter has actually
-- been shooting, which includes the evenings nobody answered.
create or replace function public.shooter_recent_form(
  p_shooter    uuid,
  p_discipline uuid,
  p_limit      integer default 10
)
returns table (series integer, average numeric, best numeric, worst numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recent as (
    select total, shot_at from (
      select public.submission_effective_total(s) as total, s.shot_at
        from public.submissions s
        join public.bouts b   on b.id = s.bout_id
        join public.matches m on m.id = b.match_id
       where s.shooter_id = p_shooter
         and m.discipline_id = p_discipline
         and b.state in ('settled', 'forfeited')

      union all

      select o.total, o.shot_at
        from public.open_series o
       where o.shooter_id = p_shooter
         and o.discipline_id = p_discipline
         and o.state in ('reported', 'expired')
         and o.total is not null
         and o.match_id is null
    ) all_series
    order by shot_at desc
    limit greatest(p_limit, 1)
  )
  select count(*)::integer,
         round(avg(total), 1),
         max(total),
         min(total)
    from recent;
$$;

-- --------------------------------------------------------------- letting go --

-- Same sweep as before, with one addition: a series that is let go says so.
-- Vanishing without a word is what makes somebody stop reporting.
create or replace function public.match_open_series()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      record;
  v_field    record;
  v_taken    uuid[] := array[]::uuid[];
  v_format   uuid;
  v_match    uuid;
  v_bout     uuid;
  v_partner  public.open_series%rowtype;
  v_created  integer := 0;
begin
  select id into v_format from public.formats where code = 'single_10';
  if v_format is null then
    return 0;
  end if;

  -- Declarations nobody reported: no news is the right amount of news.
  update public.open_series
     set state = 'expired'
   where state = 'open' and report_by < now();

  -- Reported series nobody was ever there for. These are worth a word.
  for v_row in
    update public.open_series
       set state = 'expired'
     where state = 'reported'
       and reported_at < now() - public.open_series_patience()
    returning id, shooter_id, discipline_id
  loop
    perform public.enqueue_notification(
      v_row.shooter_id,
      'open_series_expired',
      'Nobody turned up for your series',
      'It stays in your own record as practice. Your rating is untouched — that '
        || 'needs somebody to compare with.',
      jsonb_build_object('route', '/(tabs)/profile'),
      null,
      null
    );
  end loop;

  for v_field in
    select distinct discipline_id from public.open_series where state = 'reported'
  loop
    for v_row in
      select * from public.open_series
       where state = 'reported'
         and discipline_id = v_field.discipline_id
       order by coalesce(seed_rating, 1500) desc, reported_at
    loop
      continue when v_row.id = any (v_taken);

      select * into v_partner
        from public.open_series o
       where o.state = 'reported'
         and o.discipline_id = v_field.discipline_id
         and o.id <> v_row.id
         and o.id <> all (v_taken)
         and o.shooter_id <> v_row.shooter_id
         and not public.met_recently(o.shooter_id, v_row.shooter_id, interval '14 days')
       order by abs(coalesce(o.seed_rating, 1500) - coalesce(v_row.seed_rating, 1500)),
                o.reported_at
       limit 1;

      continue when not found;

      insert into public.matches (
        discipline_id, format_id, shooter_a, shooter_b, state, opens_at, closes_at
      )
      values (
        v_field.discipline_id, v_format,
        v_row.shooter_id, v_partner.shooter_id,
        'live',
        least(v_row.opens_at, v_partner.opens_at),
        now()
      )
      returning id into v_match;

      update public.bouts
         set opens_at = least(v_row.opens_at, v_partner.opens_at),
             closes_at = now()
       where match_id = v_match
      returning id into v_bout;

      insert into public.submissions
        (bout_id, shooter_id, total, inner_tens, photo_path, capture_method, shot_at, source)
      values
        (v_bout, v_row.shooter_id, v_row.total, v_row.inner_tens,
         v_row.photo_path, coalesce(v_row.capture_method, 'in_app_camera'), v_row.shot_at, 'manual'),
        (v_bout, v_partner.shooter_id, v_partner.total, v_partner.inner_tens,
         v_partner.photo_path, coalesce(v_partner.capture_method, 'in_app_camera'),
         v_partner.shot_at, 'manual');

      update public.open_series
         set state = 'matched', match_id = v_match, matched_at = now()
       where id in (v_row.id, v_partner.id);

      v_taken := v_taken || v_row.id || v_partner.id;
      v_created := v_created + 1;
    end loop;
  end loop;

  return v_created;
end;
$$;
