-- Shooter profiles. One row per auth.users row, created by trigger on signup.

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  handle        citext not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name  text not null check (char_length(display_name) between 2 and 40),
  country_code  char(2) not null default 'DE' check (country_code ~ '^[A-Z]{2}$'),
  club          text,
  avatar_path   text,
  bio           text check (char_length(bio) <= 500),
  -- Free-form equipment map, e.g. {"rifle": "FWB800X", "jacket": "Gehmann 403"}.
  -- Kept as jsonb because the interesting fields differ per discipline and we
  -- do not want a migration every time a manufacturer ships something new.
  equipment     jsonb not null default '{}'::jsonb,
  role          public.shooter_role not null default 'shooter',
  is_public     boolean not null default true,
  banned_until  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_country_idx on public.profiles (country_code);
create index profiles_role_idx on public.profiles (role) where role <> 'shooter';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Signup hook. The client passes handle/display_name/country in the signup
-- metadata; anything missing gets a placeholder the user can change later.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handle citext;
begin
  v_handle := lower(coalesce(
    new.raw_user_meta_data ->> 'handle',
    'shooter_' || substr(replace(new.id::text, '-', ''), 1, 10)
  ));

  insert into public.profiles (id, handle, display_name, country_code)
  values (
    new.id,
    v_handle,
    coalesce(new.raw_user_meta_data ->> 'display_name', v_handle::text),
    upper(coalesce(new.raw_user_meta_data ->> 'country_code', 'DE'))
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
