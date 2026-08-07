# WSL Mobile

The Expo client for the World Shooting League. iOS, Android and web from one
codebase.

The client is deliberately thin: it computes nothing, decides nothing and scores
nothing. It reads views, writes one row and uploads one photo. All the logic —
blind reveal, settlement, rating, visibility — lives in Postgres. Patching the
app changes nothing.

## Design

Dark by default, light as an equal partner; the app follows the system setting
(`userInterfaceStyle: "automatic"`). Both palettes live in `lib/theme.ts` and are
built separately rather than inverted: in light, cards carry a shadow instead of
a lift in brightness, and green, amber and red move darker so they stay legible
on white.

Components read the active palette through `useTheme()`. There is no global
`StyleSheet.create` with fixed colours — styles that depend on the palette are
built during render.

Two rules that matter more here than the prevailing style: **high contrast** and
**large targets**. Shooters skew older, stand in a dim hall, have cold hands and
may be wearing shooting glasses. Buttons are 52pt tall, body text 16, scores 40
with tabular figures.

## Getting started

```bash
cp .env.example .env      # project URL and publishable key
npm install
npm start
```

`npm run web` for the browser, `npm run ios` / `npm run android` for devices.
`npm run typecheck` checks without building.

## Screens

```
app/
  (auth)/sign-in.tsx      sign in and create an account
  (tabs)/index.tsx        my matches
  (tabs)/leaderboard.tsx  rankings per discipline
  (tabs)/profile.tsx      profile, ratings, confirmation rate
  match/[id].tsx          a match with all its series
  bout/[id]/report.tsx    report a result: score + photo
  bout/[id]/confirm.tsx   check the opponent's photo
```

## What the blind reveal looks like in the client

Like nothing at all. Before the reveal the database does not return the
opponent's row, so there is nothing to hide and no condition for the client to
evaluate. `match/[id].tsx` simply renders what is in `submissions`: while only
your own report exists, the opponent's block shows `···`.

## Reporting

A total and a photo. Where the discipline is scored in whole rings — pistol —
the shooter also reports inner tens, which is the ISSF tiebreak for full-ring
scores; decimal disciplines break their own ties, so the field is not shown
there at all.

Before submitting, the client checks the same bounds `validate_submission()`
enforces in the database — range, inner ten count, and whether the total is even
reachable with that many inner tens. Not as a safeguard, but so the shooter
finds out before the upload rather than after it.

It also calls `shooter_recent_form()` and asks once more when a report sits more
than 5 rings above the shooter's own average. That is the cheap substitute for
OCR on the one realistic failure mode, the typo.

The photo is taken with the camera (`capture_method = 'in_app_camera'`); the
library stays available but is recorded as such.

## Verified

`npm run typecheck` is clean and the Metro bundles for Android and web both
build. The web build was additionally loaded in a browser and captured in both
themes — the app renders with no runtime errors.

Not verified: a run against a live Supabase instance.

## Known simplifications

* `shot_at` is set to the moment of reporting. That holds as long as shooters
  report right after shooting; a field of its own is still missing.
* No push notifications. In turn-based play they are the retention engine and
  should come next — that needs a table for device tokens and a trigger on
  reveal.
* No joining a season from inside the app; entrants are still inserted into
  `season_entries` directly.
* No referee view. Disputes can be raised but not worked.
