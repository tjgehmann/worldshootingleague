-- Round pairing.
--
-- Swiss-style: sort the active field by rating, pair neighbours, skip a pairing
-- that already happened this season and take the next candidate instead. Good
-- enough for a few hundred entrants and it keeps matches competitive, which is
-- what makes an async ladder worth finishing.

create or replace function public.pair_round(p_round_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round   public.rounds%rowtype;
  v_season  public.seasons%rowtype;
  v_field   uuid[];
  v_taken   boolean[];
  v_i       integer;
  v_j       integer;
  v_a       uuid;
  v_b       uuid;
  v_created integer := 0;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if not found then
    raise exception 'unknown round %', p_round_id;
  end if;
  if v_round.paired_at is not null then
    return 0;  -- idempotent
  end if;

  select * into v_season from public.seasons where id = v_round.season_id;

  -- Active field, strongest first. Newcomers without a rating sit at 1500.
  select array_agg(e.shooter_id order by coalesce(r.rating, 1500) desc, e.joined_at)
    into v_field
    from public.season_entries e
    left join public.ratings r
      on r.shooter_id = e.shooter_id and r.discipline_id = v_season.discipline_id
   where e.season_id = v_season.id
     and e.withdrawn_at is null;

  if v_field is null or array_length(v_field, 1) < 2 then
    update public.rounds set paired_at = now() where id = p_round_id;
    return 0;
  end if;

  v_taken := array_fill(false, array[array_length(v_field, 1)]);

  for v_i in 1 .. array_length(v_field, 1) loop
    continue when v_taken[v_i];
    v_a := v_field[v_i];

    v_b := null;
    for v_j in v_i + 1 .. array_length(v_field, 1) loop
      continue when v_taken[v_j];

      -- No rematches inside a season.
      if not exists (
        select 1 from public.matches m
         where m.season_id = v_season.id
           and ((m.shooter_a = v_a and m.shooter_b = v_field[v_j])
             or (m.shooter_a = v_field[v_j] and m.shooter_b = v_a))
      ) then
        v_b := v_field[v_j];
        v_taken[v_j] := true;
        exit;
      end if;
    end loop;

    if v_b is null then
      continue;  -- odd one out, or everyone already played: bye this round
    end if;

    v_taken[v_i] := true;

    insert into public.matches (
      round_id, season_id, discipline_id, format_id,
      shooter_a, shooter_b, state, opens_at, closes_at
    )
    values (
      p_round_id, v_season.id, v_season.discipline_id, v_season.format_id,
      v_a, v_b,
      case when now() >= v_round.opens_at then 'live' else 'scheduled' end::public.match_state,
      v_round.opens_at, v_round.closes_at
    );

    v_created := v_created + 1;
  end loop;

  update public.rounds set paired_at = now() where id = p_round_id;
  return v_created;
end;
$$;

-- Opens rounds whose window has started and pairs anything still unpaired.
create or replace function public.open_due_rounds()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round record;
  v_count integer := 0;
begin
  for v_round in
    select r.id from public.rounds r
      join public.seasons s on s.id = r.season_id
     where s.state = 'running'
       and r.paired_at is null
       and now() >= r.opens_at - interval '24 hours'
  loop
    perform public.pair_round(v_round.id);
    v_count := v_count + 1;
  end loop;

  update public.matches
     set state = 'live'
   where state = 'scheduled' and opens_at <= now();

  return v_count;
end;
$$;
