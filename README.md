# World Shooting League

An online league for sport shooters on electronic targets. Two shooters compete
independently of time and place: each shoots at their own club, reports the
score with a photo of the display, and neither result becomes visible until both
have submitted. Afterwards each checks the other's photo.

This repository contains:

* **`supabase/`** — the data model: Postgres schema with the state machine, row
  level security and Glicko-2 rating.
* **`mobile/`** — the Expo client for iOS, Android and web.

## Formats

Short formats, deliberately:

| Format | How it runs |
|---|---|
| `single_10` | One series of 10 shots, one week to shoot it. |
| `best_of_five` | Five series of 10 shots, first to 3 points wins. All five bouts are open at once. |

Disciplines in the seed: `AR10ET` (air rifle 10 m standing), `AP10ET` (air
pistol 10 m), `SBR10ET` (smallbore 50 m prone), `SBP10ET` (sport pistol 25 m).

## Screens

The sign-in screen, captured from the running web build in both themes:

<p>
  <img src="docs/screenshots/sign-in-dark.png" alt="Sign-in screen, dark theme" width="300">
  <img src="docs/screenshots/sign-in-light.png" alt="Sign-in screen, light theme" width="300">
</p>

Every screen — matches, the blind reveal before and after, reporting, checking a
photo, rankings and profile — is laid out in
[`docs/mockups.html`](docs/mockups.html); open it in a browser. Colours, spacing
and type there come from `mobile/lib/theme.ts` and the wording is what the app
renders. Only the data is invented.

## Layout

```
supabase/
  migrations/        schema, in the order it is applied
  seed.sql           disciplines and formats
  tests/             SQL tests against a throwaway cluster
mobile/              Expo client (see mobile/README.md)
scripts/
  test-local.sh      apply migrations and run the tests
  verify-deploy.sql  check a live project after db push
docs/
  data-model.md      entities, state machine, design decisions
  mockups.html       every screen, annotated
  screenshots/       captures from the running build
```

Migrations:

| File | Contents |
|---|---|
| `..._init_types.sql` | enums and shared helpers |
| `..._profiles.sql` | shooter profiles, signup trigger |
| `..._catalog.sql` | disciplines and formats |
| `..._seasons.sql` | seasons, entries, rounds |
| `..._matches.sql` | matches and bouts |
| `..._submissions.sql` | reports, validation, blind reveal |
| `..._disputes.sql` | referee cases |
| `..._ratings.sql` | Glicko-2 |
| `..._settlement.sql` | scoring, deadlines, finalization |
| `..._rls.sql` | row level security and public views |
| `..._storage.sql` | buckets for target photos and avatars |
| `..._pairing.sql` | round pairing |
| `..._scheduling.sql` | `run_league_tick()` and the cron job |

## Testing locally

Needs only `postgresql-16` — no Docker, no Supabase CLI:

```bash
./scripts/test-local.sh
```

The script builds a throwaway cluster, applies stub, migrations and seed, and
runs the tests in `supabase/tests/`. The stub stands in for what Supabase
normally provides: `auth.users`, `auth.uid()`, the `storage` schema and the
`anon` / `authenticated` roles.

What is covered:

* **`10_match_lifecycle.sql`** — pairing, blind reveal, a best-of-five ending
  after three won bouts, the dispute window blocking rating, Glicko-2 applying
  afterwards, `finalize_match()` being idempotent, a file export cross-checking
  its own total, and a tied pistol match decided on inner tens.
* **`20_blind_reveal_rls.sql`** — the opponent sees **nothing** before
  submitting; double submission, submitting on someone else's behalf,
  overwriting and deleting all fail; an outsider sees the result but no
  submission.
* **`30_deadlines_and_validation.sql`** — walkover on a missed deadline,
  shoot-off bout on a dead-level match, automatic confirmation after a lapsed
  window (and its effect on the rate), voiding dead matches; rejection of
  impossible totals, missing inner tens where the discipline requires them,
  more inner tens than shots, tenths in a full-ring discipline, a shot array
  that disagrees with the total, backdated series and missing photos.

## Applying to a Supabase project

1. **Enable `pg_cron`** — Dashboard → Database → Extensions. Without it the
   scheduling migration fails.
2. **Push schema and catalog:**
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
3. **Verify everything landed:**
   ```bash
   psql "$DATABASE_URL" -f scripts/verify-deploy.sql
   ```
   Every line must end in OK. It checks the tables, RLS on each of them, the
   three select policies behind the blind reveal, `submissions` being
   insert-only, the functions, views and triggers, the storage buckets and their
   policies, the seed, the cron job, and the Glicko-2 maths against reference
   values.
4. **Wire up the client** — `mobile/.env` takes the project URL and the
   publishable key (formerly "anon key") from *Project Settings → API Keys*.
   That key is public by design and belongs in the client; the secret /
   `service_role` key bypasses RLS and must never ship in an app.

For testing it helps to turn off the confirmation email under *Authentication →
Sign In / Providers → Email*, otherwise a new account cannot sign in right away.

## Reporting model

Two numbers at most, and a photo. Deliberately **no OCR**: typing one number is
not worth automating, and the verification is done by the opponent after the
reveal — motivated, and more reliable than a model reading a photo of a monitor.
Ranges that can export their data (SIUS CSV, later a manufacturer API) may also
supply the individual shots, in which case the two paths cross-check.

The second number, inner tens, is asked for only where the discipline is scored
in whole rings. That is the ISSF tiebreak for full-ring scores, and simulation
puts the tie rate for a 10-shot pistol series around 11% against roughly 2% for
decimal rifle — so pistol needs it and rifle does not.

Reasoning in [`docs/data-model.md`](docs/data-model.md).

## Running the app

```bash
cd mobile
cp .env.example .env      # project URL and publishable key
npm install
npm start
```

Details in [`mobile/README.md`](mobile/README.md).

## Next steps

What exists today is one complete loop: get paired, shoot, report, reveal,
check, get rated. That is enough to run a closed pilot and not enough to run a
league. What follows is ordered by what actually decides whether a league lives,
drawn from how the established platforms solve the same problems.

Three things decide it. Everything else is downstream.

### 1. Liquidity — nobody plays an empty ladder

A challenge needs an opponent in the same discipline at a similar level. Spread
a few hundred shooters over four disciplines and every ladder looks abandoned.
[FACEIT](https://support.faceit.com/hc/en-us/articles/14996562458268-FACEIT-Beginners-Guide)
solves this two ways: hubs, where a known community plays among itself, and
ladders grouped by level range so each one stays relevant. Both apply here.

- [ ] **Clubs as a first-class entity.** Shooting is already organised in clubs,
      which makes a club the natural unit to onboard twenty people at once
      instead of one at a time. A club-only season is the equivalent of a FACEIT
      hub, and it works at a scale where a global ladder would not.
- [ ] **Club vs club team matches.** German league shooting is team-based
      already, so this is not a new format to teach — it is the one the audience
      knows. Aggregate of N shooters against N shooters.
- [ ] **Join a season from inside the app**, with an invite link a club official
      can send round. Today entrants are inserted into `season_entries` by hand.
- [ ] **A free challenge queue** so somebody who joins mid-season has something
      to do before the next round pairs. The schema already allows a match with
      no round.

### 2. The loop — turn-based play needs a reason to come back

- [ ] **Push notifications.** A table for device tokens plus triggers on reveal,
      on a confirmation waiting, and before a deadline. In turn-based play this
      is the retention engine and nothing substitutes for it.
- [ ] **Divisions with promotion and relegation.** One table for everyone is
      demotivating for everyone outside the top ten. FACEIT splits its ladders by
      level range for exactly this reason; ESEA and ESL run divisions. Glicko-2
      already provides the number to split on.
- [ ] **A weekly challenge.** A single shared task — "10 shots kneeling this
      week" — gives a reason to open the app without needing an opponent to
      respond. FACEIT calls these missions.
- [ ] **Streaks, personal bests and awards.** Cheap to build, and the 2016
      mockups already had "NEW PERSONAL BEST" and a medal.
- [ ] **The activity feed** from the original design: results, awards, comments.
      Worth building once the competitive loop is busy, not before.

### 3. Trust at scale — the ranking is the product

Peer confirmation works while everyone knows each other. It does not survive
growth, and it is exactly where the online chess platforms invested.
[Chess.com](https://www.chess.com/cheating) scores over a hundred factors and
auto-flags performances that are statistically improbable; Lichess pairs
statistics with human moderators and quietly separates offenders rather than
announcing bans.

- [ ] **Statistical fair-play flagging.** The equivalent signal here is a
      shooter's own distribution over time. A submission far outside their
      history, or a sudden step change in level, should open a case by itself
      instead of waiting for an opponent to notice. `rating_events` and the
      submission history already hold the data.
- [ ] **A referee console.** A case queue, both photos side by side, a decision
      with a reason. Disputes can be raised today but not worked.
- [ ] **A sanction ladder and an appeal path.** Warning, voided result, rating
      rollback, suspension — with the reason recorded and the shooter able to
      respond.
- [ ] **Heavier verification where the stakes are.** A witness signature or a
      short video for promotion into the top division and for qualifying to a
      final. The rule the subscription leagues follow: verification scales with
      what is at stake, not uniformly.
- [ ] **Sandbagging detection.** Deliberately shooting low to farm an easier
      division becomes worth doing the moment divisions exist. Chess.com detects
      it explicitly; so should this.

### Competition structure

- [ ] Cups and knockout brackets alongside the ladder — a season is a long
      commitment, a weekend cup is not.
- [ ] **A season final on site.** The reason the whole thing exists: the online
      league qualifies, the title is decided in a hall. It also settles the trust
      question — manipulating an online ladder is embarrassing when the final is
      shot in front of people.
- [ ] Categories: junior, senior, and the equipment classes shooters expect to
      be separated by.
- [ ] An optional handicap mode so a club can run a mixed-ability internal
      ladder.

### Reach

- [ ] **Public web pages** for seasons, tables and finished matches. Everything
      is behind a login today, which means none of it is findable, linkable or
      shareable.
- [ ] Shareable match cards for social, and live results during an on-site
      final.

### Operations, and two things that block a public launch

- [ ] An admin console: create seasons, manage the catalog, work the moderation
      queue.
- [ ] **Minors.** A large share of ISSF shooters are juniors. Age gate, guardian
      consent, and restraint on photos and public profiles for under-16s. This is
      a launch blocker, not a feature.
- [ ] **Prize money is a legal question before it is a product question.** An
      entry fee plus a cash prize can fall under German gambling law; skill-based
      competition helps but is not a blanket exemption. Keep prizes attached to
      the on-site final and take advice before money moves.
- [ ] App store review: firearms content policies are real. Sport shooting apps
      exist, but affiliate links to weapons or ammunition are a rejection risk.
- [ ] GDPR: data export and deletion, and a retention rule for evidence photos.

### Integrations

- [ ] CSV import for SIUS exports (`source = 'file_export'`), which already has
      a place in the schema.
- [ ] DISAG's QR path, where a range already publishes results digitally.
- [ ] A manufacturer API once there is leverage to ask for one. Platforms like
      Challengermode report results automatically and never ask for a screenshot;
      that is the end state, and it is worth reaching only from a position where
      the manufacturers want the distribution.
