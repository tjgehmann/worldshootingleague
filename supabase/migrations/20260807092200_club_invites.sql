-- Minting an invite code.
--
-- The table, the policy and redeem_club_invite() have been here since clubs
-- were added; what was missing is the half that creates a code, so a club
-- founded from the app had no way to let anyone in. Somebody had to write the
-- insert by hand, which makes the whole club path depend on an operator.
--
-- It is a function rather than a client-side insert for two reasons. The code
-- has to be unique, and a client that generates one can only retry blindly.
-- And a code somebody picks is a code somebody can guess: this is the only
-- thing standing between a stranger and a club's roster.

/**
 * A code that survives being read out over the phone.
 *
 * No I, L, O, 0 or 1 — the pairs that get misheard and mistyped. Eight
 * characters from an alphabet of 31 is about 10^12 codes, which is far more
 * than a guessing attempt gets through before the invite expires.
 */
create or replace function public.generate_invite_code()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select string_agg(
           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                  1 + floor(random() * 31)::integer, 1),
           '')
    from generate_series(1, 8);
$$;

create or replace function public.create_club_invite(
  p_club_id  uuid,
  p_days     integer default 14,
  p_max_uses integer default null
)
returns table (code text, expires_at timestamptz, max_uses integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code    text;
  v_expires timestamptz;
  v_try     integer := 0;
begin
  if not public.is_club_official(p_club_id) then
    raise exception 'only an official of the club can invite people'
      using errcode = 'insufficient_privilege';
  end if;

  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'an invite lasts between a day and three months'
      using errcode = 'check_violation';
  end if;

  v_expires := now() + make_interval(days => p_days);

  loop
    v_try := v_try + 1;
    v_code := public.generate_invite_code();

    begin
      insert into public.club_invites (club_id, code, created_by, expires_at, max_uses)
      values (p_club_id, v_code, auth.uid(), v_expires, p_max_uses);
      exit;
    exception when unique_violation then
      -- Astronomically unlikely, but a collision must not surface as a failure
      -- to the official standing in front of their club.
      if v_try >= 5 then
        raise;
      end if;
    end;
  end loop;

  return query select v_code, v_expires, p_max_uses;
end;
$$;

/**
 * The codes that are still worth showing: not expired, not used up. Newest
 * first, so the screen can show one code rather than a history.
 */
create or replace function public.club_invites_active(p_club_id uuid)
returns table (
  code       text,
  expires_at timestamptz,
  max_uses   integer,
  uses       integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.code, i.expires_at, i.max_uses, i.uses
    from public.club_invites i
   where i.club_id = p_club_id
     and public.is_club_official(p_club_id)
     and i.expires_at > now()
     and (i.max_uses is null or i.uses < i.max_uses)
   order by i.created_at desc;
$$;

/** Withdrawing a code that has been shared too widely. */
create or replace function public.revoke_club_invite(p_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club uuid;
begin
  select club_id into v_club from public.club_invites where code = upper(p_code);

  if v_club is null then
    raise exception 'no such code' using errcode = 'no_data_found';
  end if;

  if not public.is_club_official(v_club) then
    raise exception 'only an official of the club can withdraw its codes'
      using errcode = 'insufficient_privilege';
  end if;

  -- Expiring rather than deleting: the row is the record of who invited whom.
  update public.club_invites set expires_at = now() where code = upper(p_code);
end;
$$;

revoke execute on function public.create_club_invite(uuid, integer, integer) from public;
revoke execute on function public.club_invites_active(uuid) from public;
revoke execute on function public.revoke_club_invite(text) from public;

grant execute on function public.create_club_invite(uuid, integer, integer) to authenticated;
grant execute on function public.club_invites_active(uuid) to authenticated;
grant execute on function public.revoke_club_invite(text) to authenticated;
