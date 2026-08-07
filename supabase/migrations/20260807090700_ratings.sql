-- Glicko-2 ratings, one per (shooter, discipline).
--
-- Elo would work too, but Glicko-2 tracks rating deviation, which matters here:
-- a shooter plays maybe 8 rated matches a season, so the system has to know how
-- much it does not yet know about a newcomer. Reference:
-- http://www.glicko.net/glicko/glicko2.pdf

create table public.ratings (
  shooter_id      uuid not null references public.profiles (id) on delete cascade,
  discipline_id   uuid not null references public.disciplines (id) on delete cascade,
  rating          numeric(6, 2) not null default 1500.00,
  rd              numeric(6, 2) not null default 350.00,
  volatility      numeric(8, 6) not null default 0.060000,
  matches_played  integer not null default 0,
  wins            integer not null default 0,
  losses          integer not null default 0,
  draws           integer not null default 0,
  last_played_at  timestamptz,
  updated_at      timestamptz not null default now(),

  primary key (shooter_id, discipline_id)
);

create index ratings_leaderboard_idx on public.ratings (discipline_id, rating desc);

create table public.rating_events (
  id                 uuid primary key default gen_random_uuid(),
  match_id           uuid not null references public.matches (id) on delete cascade,
  shooter_id         uuid not null references public.profiles (id) on delete cascade,
  opponent_id        uuid not null references public.profiles (id),
  discipline_id      uuid not null references public.disciplines (id),
  score              numeric(2, 1) not null check (score in (0, 0.5, 1)),
  rating_before      numeric(6, 2) not null,
  rd_before          numeric(6, 2) not null,
  volatility_before  numeric(8, 6) not null,
  rating_after       numeric(6, 2) not null,
  rd_after           numeric(6, 2) not null,
  volatility_after   numeric(8, 6) not null,
  created_at         timestamptz not null default now(),

  unique (match_id, shooter_id)
);

create index rating_events_shooter_idx on public.rating_events (shooter_id, created_at desc);

-- f(x) from step 5 of the Glicko-2 procedure.
create or replace function public.glicko2_f(
  x         double precision,
  delta_sq  double precision,
  phi_sq    double precision,
  v         double precision,
  a         double precision,
  tau       double precision
)
returns double precision
language sql
immutable
as $$
  select (exp(x) * (delta_sq - phi_sq - v - exp(x)))
           / (2 * power(phi_sq + v + exp(x), 2))
         - (x - a) / power(tau, 2);
$$;

-- Single-opponent Glicko-2 update. Rating periods in this league contain at
-- most one rated match per shooter (one ladder round), so the multi-opponent
-- summations collapse to a single term.
create or replace function public.glicko2_update(
  p_rating      numeric,
  p_rd          numeric,
  p_volatility  numeric,
  p_opp_rating  numeric,
  p_opp_rd      numeric,
  p_score       numeric,   -- 1 win, 0.5 draw, 0 loss
  p_tau         numeric default 0.5,
  p_max_rd      numeric default 350
)
returns table (rating numeric, rd numeric, volatility numeric)
language plpgsql
immutable
as $$
declare
  c constant double precision := 173.7178;  -- Glicko-2 scale factor
  tau      double precision := p_tau::double precision;
  mu       double precision;
  phi      double precision;
  mu_j     double precision;
  phi_j    double precision;
  g        double precision;
  e        double precision;
  v        double precision;
  delta    double precision;
  a        double precision;
  lo       double precision;
  hi       double precision;
  f_lo     double precision;
  f_hi     double precision;
  mid      double precision;
  f_mid    double precision;
  k        integer;
  sigma_p  double precision;
  phi_star double precision;
  phi_p    double precision;
  mu_p     double precision;
begin
  -- Step 2: onto the Glicko-2 scale.
  mu    := (p_rating::double precision - 1500) / c;
  phi   := p_rd::double precision / c;
  mu_j  := (p_opp_rating::double precision - 1500) / c;
  phi_j := p_opp_rd::double precision / c;

  -- Step 3/4: estimated variance and improvement.
  g := 1 / sqrt(1 + 3 * phi_j * phi_j / (pi() * pi()));
  e := 1 / (1 + exp(-g * (mu - mu_j)));
  e := least(greatest(e, 1e-12), 1 - 1e-12);  -- keep v finite at the extremes

  v     := 1 / (g * g * e * (1 - e));
  delta := v * g * (p_score::double precision - e);

  -- Step 5: new volatility, via the Illinois variant of regula falsi.
  a  := ln(p_volatility::double precision * p_volatility::double precision);
  lo := a;

  if delta * delta > phi * phi + v then
    hi := ln(delta * delta - phi * phi - v);
  else
    k := 1;
    while public.glicko2_f(a - k * tau, delta * delta, phi * phi, v, a, tau) < 0 and k <= 100 loop
      k := k + 1;
    end loop;
    hi := a - k * tau;
  end if;

  f_lo := public.glicko2_f(lo, delta * delta, phi * phi, v, a, tau);
  f_hi := public.glicko2_f(hi, delta * delta, phi * phi, v, a, tau);

  k := 0;
  while abs(hi - lo) > 1e-6 and k < 100 loop
    mid   := lo + (lo - hi) * f_lo / (f_hi - f_lo);
    f_mid := public.glicko2_f(mid, delta * delta, phi * phi, v, a, tau);

    if f_mid * f_hi <= 0 then
      lo := hi;
      f_lo := f_hi;
    else
      f_lo := f_lo / 2;
    end if;

    hi   := mid;
    f_hi := f_mid;
    k    := k + 1;
  end loop;

  sigma_p := exp(lo / 2);

  -- Steps 6-8: pre-period RD, new RD, new rating.
  phi_star := sqrt(phi * phi + sigma_p * sigma_p);
  phi_p    := 1 / sqrt(1 / (phi_star * phi_star) + 1 / v);
  mu_p     := mu + phi_p * phi_p * g * (p_score::double precision - e);

  rating     := round((c * mu_p + 1500)::numeric, 2);
  rd         := round(least(c * phi_p, p_max_rd::double precision)::numeric, 2);
  volatility := round(sigma_p::numeric, 6);
  return next;
end;
$$;

-- RD inflation for rating periods a shooter sat out, so an inactive #1 does
-- not keep a tight deviation forever.
create or replace function public.glicko2_decay(
  p_rd          numeric,
  p_volatility  numeric,
  p_periods     integer,
  p_max_rd      numeric default 350
)
returns numeric
language sql
immutable
as $$
  select round(
    least(
      sqrt(
        power(p_rd::double precision, 2)
        + greatest(p_periods, 0) * power(p_volatility::double precision * 173.7178, 2)
      ),
      p_max_rd::double precision
    )::numeric,
    2
  );
$$;

-- Ensures a rating row exists before a match is rated.
create or replace function public.ensure_rating(p_shooter uuid, p_discipline uuid)
returns public.ratings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.ratings%rowtype;
begin
  insert into public.ratings (shooter_id, discipline_id)
  values (p_shooter, p_discipline)
  on conflict (shooter_id, discipline_id) do nothing;

  select * into v_row
    from public.ratings
   where shooter_id = p_shooter and discipline_id = p_discipline;

  return v_row;
end;
$$;
