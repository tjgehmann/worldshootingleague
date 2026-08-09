-- A bout can only be revealed once.
--
-- The reveal trigger is per row, and an AFTER INSERT trigger runs once the
-- whole statement has landed. Insert both submissions in one statement — which
-- is exactly what match_open_series() does, because the two series already
-- exist and there is nothing to wait for — and the trigger fires twice with two
-- rows visible both times:
--
--   first firing:  two submissions -> reveal -> settle_bout -> match settled
--   second firing: two submissions -> reveal AGAIN
--
-- The second reveal put the bout back to 'revealed' and called settle_bout
-- again, which did nothing: advance_match() only works on a match that is still
-- scheduled or live, and by then it was settled. The bout stayed 'revealed'
-- under a settled, even finalized, match.
--
-- Nothing looked broken. The score was right, the winner was right, the rating
-- was right. What was wrong was every query that asks "which series have been
-- shot and settled" — the shooter's own form, the scorecard, anything counting
-- bouts by state. An open series would never have appeared in the shooter's
-- record, which is precisely the thing this week's work was about giving them.
--
-- The season path never hit it because its two submissions arrive in two
-- separate statements, hours or days apart.

create or replace function public.reveal_bout_when_complete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count         integer;
  v_confirm_hours integer;
  v_state         public.bout_state;
begin
  select state into v_state from public.bouts where id = new.bout_id for update;

  -- Already past the reveal: a second firing of the same statement, or a
  -- referee having reopened and re-settled the bout. Either way there is
  -- nothing here to do.
  if v_state not in ('pending', 'open', 'awaiting_opponent') then
    return new;
  end if;

  select count(*) into v_count from public.submissions where bout_id = new.bout_id;

  if v_count = 1 then
    update public.bouts set state = 'awaiting_opponent' where id = new.bout_id;
  elsif v_count >= 2 then
    select f.confirm_hours into v_confirm_hours
      from public.bouts b
      join public.matches m on m.id = b.match_id
      join public.formats f on f.id = m.format_id
     where b.id = new.bout_id;

    update public.bouts
       set state = 'revealed',
           revealed_at = now(),
           confirm_closes_at = now() + make_interval(hours => v_confirm_hours)
     where id = new.bout_id;

    update public.submissions set state = 'revealed' where bout_id = new.bout_id;

    perform public.settle_bout(new.bout_id);
  end if;

  return new;
end;
$$;
