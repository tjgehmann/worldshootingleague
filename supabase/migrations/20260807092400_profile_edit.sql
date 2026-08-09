-- Editing a profile, and the two holes that opens.
--
-- The columns have been writable since the first migration; what was missing
-- was a screen. Adding one turns two latent problems into real ones.
--
-- 1. primary_club_id decides which club a shooter competes for, and it is
--    joined straight into the public season table. Nothing checked that the
--    shooter was actually a member of it, so anyone could appear in the
--    standings under a club they had never joined. The pairing would not have
--    fielded them — club_lineup() joins club_members as well — but the table
--    would have carried the claim, which is worse than useless.
--
-- 2. is_public hides a profile row from other shooters. Nothing sets it today,
--    but the moment something does, the two people in a match stop being able
--    to read each other's names, and a screen that renders opponent.display_name
--    breaks rather than degrades. An opponent is not a stranger.

create or replace function public.check_primary_club_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.primary_club_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.primary_club_id is not distinct from old.primary_club_id then
    return new;
  end if;

  if not exists (
    select 1 from public.club_members
     where club_id = new.primary_club_id and shooter_id = new.id
  ) then
    raise exception 'you can only shoot for a club you belong to'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger profiles_primary_club_membership
  before insert or update of primary_club_id on public.profiles
  for each row execute function public.check_primary_club_membership();

-- Leaving a club you shoot for stops you shooting for it, rather than leaving a
-- profile pointing at a roster it is not on.
create or replace function public.clear_primary_club_on_leaving()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set primary_club_id = null
   where id = old.shooter_id and primary_club_id = old.club_id;

  return old;
end;
$$;

create trigger club_members_clear_primary
  after delete on public.club_members
  for each row execute function public.clear_primary_club_on_leaving();

-- Whoever you are in a match with can always read your name, whatever your
-- profile visibility says. Everything else about you stays behind it.
create or replace function public.shares_a_match_with(p_other uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.matches m
     where (m.shooter_a = p_other and m.shooter_b = p_uid)
        or (m.shooter_b = p_other and m.shooter_a = p_uid)
  );
$$;

drop policy read_profiles on public.profiles;

create policy read_profiles on public.profiles
  for select using (
    is_public
    or id = auth.uid()
    or public.is_referee()
    or public.shares_a_match_with(id)
  );
