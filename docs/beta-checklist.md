# Going into beta

Everything below is a step somebody has to take once. It is ordered so that a
failure stops you before the next step wastes time.

The single largest unknown is step 1: none of this has ever run against a real
Supabase project. Budget half a day for it and expect two or three surprises.

## 1. The project

1. **Create the project** and note the region — pick an EU one, the privacy
   notice says the data is in the EU.
2. **Enable `pg_cron`** under Database → Extensions. The scheduling migration
   fails without it.
3. **Push the schema and the catalog:**
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
4. **Verify:**
   ```bash
   psql "$DATABASE_URL" -f scripts/verify-deploy.sql
   ```
   Every line must end in `OK`. It checks the tables, RLS on each of them, the
   three select policies behind the blind reveal, `submissions` being
   insert-only, the functions, the views, the storage buckets and their
   policies, the seed, the cron job, and the Glicko-2 maths against reference
   values.
5. **Turn off email confirmation** while testing, under Authentication →
   Sign In / Providers → Email — otherwise a new account cannot sign in
   straight away. Turn it back on before real people arrive.
6. **Walk the loop by hand, twice**, with two accounts in two browsers:
   sign up → enter a season → report with a photo → check that the opponent
   sees nothing → report as the opponent → both results appear → check the
   photo → dispute one → decide it as a referee. This is the step that finds
   what the tests cannot.

## 2. The app

The beta ships as a **web app**, not through the stores. Not because the stores
ban this: Apple and Google prohibit apps that *facilitate the purchase* of
firearms or ammunition, and ISSF scoring apps sit in both stores today. It is
that review, two developer accounts and signed builds cost a fortnight that buys
nothing in week one — and a club official can send a link instead of an
invitation to install something.

If you do go to the stores later, the rules to stay inside are the ones you are
already inside: no affiliate links to weapon or ammunition sellers, no equipment
marketplace, an honest age rating, and screenshots of scores rather than of
firearms.

```bash
cd mobile
cp .env.example .env          # project URL and publishable key
npm install
npm run build:web             # exports to dist/ and patches the head
```

Host `dist/` anywhere static. Two things the host must do:

* **Rewrite every path to `index.html`.** The export is one bundle; without the
  rewrite a refresh on `/leaderboard` is a 404. `public/_redirects` covers
  Netlify, `vercel.json` covers Vercel.
* **Serve over HTTPS**, or the camera will not open.

Installing it to a home screen gives a standalone app with an icon
(`public/manifest.webmanifest`), and the service worker in the build means it
opens without a network — which is the state a shooter is in at a range.

Push on iOS web only works once the app has been added to the home screen, so
say that in the invitation. Email is the channel that reaches everybody.

### Notification email

The outbox goes out by email as well as push. Set three variables on the
`send-notifications` function, then schedule it:

```bash
npx supabase secrets set \
  RESEND_API_KEY=re_... \
  NOTIFY_FROM='World Shooting League <league@your-domain.org>' \
  PUBLIC_SITE_URL=https://league.your-domain.org
npx supabase functions deploy send-notifications
```

Without `RESEND_API_KEY` the function still runs and still pushes; it just skips
the email pass and says so in its response. The sending domain has to be
verified with the provider, or everything lands in spam — do that before the
invitations go out, not after.

## 3. Before real people

- [ ] Fill in `mobile/lib/legal.ts` — everything in `<angle brackets>`:
      operator name, address, contact, and the photo retention period. Have all
      three documents read by someone qualified. The imprint has content
      requirements a template cannot know.
- [ ] Decide the retention period for evidence photographs and write the same
      number into the privacy notice and `scripts/ops.sql`.
- [ ] Make yourself an admin (`update public.profiles set role = 'admin' …`) and
      one other person a referee, so cases do not wait on one pair of hands.
- [ ] Check that `beta_health()` and `beta_backlog()` return sensible numbers
      before there is data, so a zero later means zero rather than broken.
- [ ] Write the invitation. Say what the beta is for, that it is 18+, that
      results are public and photographs are not, and how to reach you.

## 4. The shape of the beta itself

A ladder with nobody on it is the failure mode, not a bug. So:

* **One discipline.** Air rifle 10 m or air pistol 10 m — not four.
* **Three or four clubs who already know each other**, 30–60 shooters.
* **Six weeks**, one round a week, paired on Monday.
* **Club against club as the headline**, individual table alongside. The club
  captain is both the distribution and the reason people report on time.
* **You are the referee.** Cases are the one thing that cannot wait.

Decide the numbers that would make you continue before you start. Reasonable
first targets, all of them readable from `beta_health()`:

| Metric | Target | What it means if it misses |
|---|---|---|
| `reported_in_window` | > 80% | The window is too short, or the reminder is too late |
| `checked_by_opponent` | > 60% | Peer confirmation is theatre; trust needs another answer |
| `walkover_rate` | < 10% | People are being paired with opponents who are not really there |
| `returning` | > 50% | The loop does not bring anyone back — the hardest one to fix |

And decide what you would stop for. A beta with no kill criterion is a beta
that runs forever.

## What is deliberately not in the beta

Divisions, weekly challenges, streaks, an activity feed, statistical fair-play
flagging, cups, handicaps, and any manufacturer integration. Each of them is
worth building **after** the loop above is shown to work, and none of them
rescues it if it does not.
