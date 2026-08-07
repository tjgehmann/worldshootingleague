-- Catalog seed: short formats only.
--
-- 10 shots is the unit. Everything longer is deliberately absent — a ladder
-- lives on how often a shooter completes a match, not on how long one is.

-- Inner tens are asked for only where the discipline is scored in whole rings.
-- With decimal scoring the score breaks its own ties, and a second field at the
-- moment of submission would cost more than it returns.
insert into public.disciplines
  (code, name, weapon_group, distance_m, position, shot_count, scoring_mode,
   max_shot_value, requires_inner_tens)
values
  ('AR10ET',  'Air Rifle 10 shots, 10 m, standing',    'rifle',  10, 'standing', 10, 'decimal', 10.9, false),
  ('AP10ET',  'Air Pistol 10 shots, 10 m, standing',   'pistol', 10, 'standing', 10, 'integer', 10.0, true),
  ('SBR10ET', 'Smallbore Rifle 10 shots, 50 m, prone', 'rifle',  50, 'prone',    10, 'decimal', 10.9, false),
  ('SBP10ET', 'Sport Pistol 10 shots, 25 m, standing', 'pistol', 25, 'standing', 10, 'integer', 10.0, true)
on conflict (code) do nothing;

insert into public.formats
  (code, name, bout_count, points_to_win, win_points, tie_points, progression,
   window_hours, dispute_hours, confirm_hours)
values
  -- The everyday match: one series, one week, done.
  ('single_10',    'Single series, 10 shots', 1, 1.0, 1.0, 0.5, 'parallel', 168, 24, 48),

  -- The ladder format. Five series of 10, first to 3 points, a tie in a series
  -- splits the point. Parallel progression: all five open together so a shooter
  -- can fire the whole match in one range session. Sequential would mean five
  -- waiting cycles per match, which is what kills async leagues.
  ('best_of_five', 'Best of five, 10 shots each', 5, 3.0, 1.0, 0.5, 'parallel', 168, 24, 48)
on conflict (code) do nothing;
