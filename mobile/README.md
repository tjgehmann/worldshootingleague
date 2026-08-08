# WSL Mobile

The Expo client for the World Shooting League. iOS, Android and web from one
codebase.

The client is deliberately thin: it computes nothing, decides nothing and scores
nothing. It reads views, writes one row and uploads one photo. All the logic —
blind reveal, settlement, rating, visibility — lives in Postgres. Patching the
app changes nothing.

## Design

Light by default, dark as an equal partner; the app follows the system setting
(`userInterfaceStyle: "automatic"`), so a phone set to dark gets the dark
palette. Both live in `lib/theme.ts` and are built separately rather than
inverted: in light, cards carry a shadow instead of a lift in brightness, and
green, amber and red move darker so they stay legible on white.

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
  index.tsx               fork: signed in to matches, signed out to the league
  (public)/index.tsx      the league without an account
  (public)/season/[slug]  a season table
  (public)/club/[slug]    a club page and its roster
  (auth)/sign-in.tsx      sign in and create an account
  (tabs)/index.tsx        my matches
  (tabs)/leaderboard.tsx  rankings per discipline
  (tabs)/profile.tsx      profile, club, ratings, reliability, push
  match/[id].tsx          a match with all its series
  bout/[id]/report.tsx    report a result: score + photo
  bout/[id]/confirm.tsx   check the opponent's photo
  club/join.tsx           join by invite code, or start a club
```

Pictures of all of them are in [`../docs/screenshots/`](../docs/screenshots),
captured from this build:

```bash
npm i -D playwright && npx playwright install chromium   # once
npm run screenshots
```

That exports the web build, serves it locally and drives it in a phone-sized
Chromium with every Supabase request answered from `scripts/fixtures.mjs`. The
fixtures use the row shapes the app actually reads, including what row level
security would and would not return — the opponent's submission is absent before
the reveal, so the screenshot of a blind series is blind for the real reason.
Nothing in the run can reach the network.

## Signed out

The root is a fork, not a login wall: signed out you land on the public league.
The auth gate lets the `(public)` group and `match/[id]` through, and everything
that acts on someone's behalf stays behind a session.

`match/[id]` serves both. A participant gets the full screen; anyone else gets a
spectator view built from `match_scorecard`, which carries finished matches
only. A match still being shot shows a line saying so and nothing else.

## Clubs and team matches

A shooter competes for one club, and a club fixture is played out as ordinary
matches — one per board. The client shows that context rather than modelling it:
a board carries `team_match` in its payload, so the match list reads
"Board 2 · SVK v SGM" and the match screen puts the fixture score above the
series.

## Notifications

The client's only job is to hand its device token to the database
(`lib/notifications.ts`). What is worth notifying about, and when, is decided by
triggers in Postgres; delivery is an edge function. Tapping a notification
follows the `route` in its payload straight to the match.

Push can be turned off in the profile. It is stored on the profile rather than
on the device, so it holds across reinstalls — and the database stops queueing
at the source rather than sending into the void.

## What the blind reveal looks like in the client

Like nothing at all. Before the reveal the database does not return the
opponent's row, so there is nothing to hide and no condition for the client to
evaluate. `match/[id].tsx` simply renders what is in `submissions`: while only
your own report exists, the opponent's block shows `···`.

## Reporting without reception

Every report goes through `lib/outbox.ts`, online or not — one code path, and a
result is never lost to a dropped connection. Submitting writes a local entry
and flushes it; if that fails on transport, the screen says the report is safe
on the device and will send itself.

The photo is copied out of the picker's cache into the app's document directory,
and `shot_at` is the moment of capture rather than the moment of upload. The
queue retries when connectivity returns (`expo-network`), on app launch, and on
pull-to-refresh.

`lib/outbox-errors.ts` holds the one decision that matters: transport failures
wait, anything the database refuses is marked for the shooter to look at, and a
unique violation counts as delivered. It has no native imports so it can be
tested with plain Node — `./scripts/test-node.sh`.

Reading is offline-capable as well: the query cache is persisted to
AsyncStorage, so open matches are still there without a connection.

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
build. Every screen in `docs/screenshots/` was rendered by the capture run with
no page errors, in both themes — which is a stronger statement than a build
passing: the components mounted, fetched, and laid out with real data.

Requests time out after ten seconds rather than hanging. A range hall is a
concrete box with poor reception, and a socket that never answers would leave
the screen spinning; failing lets the page say so.

Not verified: a run against a live Supabase instance.

## Known simplifications

* `shot_at` is the moment the photo was taken, which is close enough to the
  moment the series was fired. A field the shooter can correct is still missing.
* Push needs an EAS `projectId` in `app.json` before tokens can be issued; the
  outbox and the edge function are in place.
* No joining a season from inside the app; entrants are still inserted into
  `season_entries` directly.
* No referee view. Disputes can be raised but not worked.
* The camera path cannot be exercised on web, so the screenshot run attaches the
  proof through the library picker instead.
