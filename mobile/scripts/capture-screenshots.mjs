#!/usr/bin/env node
/**
 * Screenshots of the real app, not a drawing of it.
 *
 *   cd mobile && node scripts/capture-screenshots.mjs
 *
 * The web build is exported, served locally, and driven in a phone-sized
 * Chromium. Every Supabase request is answered from scripts/fixtures.mjs, so
 * the screens are the actual React components with actual layout, actual fonts
 * and actual states — only the league behind them is invented.
 *
 * This exists because the alternative is a mockup that drifts from the code the
 * first time a component changes. Here a regression shows up in the picture.
 *
 * Nothing here can reach the internet: every request to the Supabase host is
 * intercepted, and anything else is aborted.
 */

import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright is not a dependency of the app — it is only needed to regenerate
 * the pictures, so it stays out of package.json and is asked for by name here.
 */
const { chromium } = await import('playwright').catch(() => {
  console.error(
    'This needs playwright:\n' +
      '  npm i -D playwright && npx playwright install chromium\n' +
      'Or point PLAYWRIGHT_CHROMIUM_PATH at a Chromium you already have.',
  );
  process.exit(1);
});

import {
  fixtures,
  BOUT_PISTOL,
  BOUT_TO_CONFIRM,
  MATCH_DONE,
  DISPUTE,
  MATCH_LIVE,
  ME,
  outboxEntry,
  SEASON_SLUG,
} from './fixtures.mjs';

const MOBILE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(MOBILE, 'dist');
const OUT = resolve(MOBILE, '..', 'docs', 'screenshots');
const PORT = 8931;

const PROJECT_REF = 'demo';
const SUPABASE_HOST = 'demo.supabase.co';

/** A phone, not a browser window. */
const VIEWPORT = { width: 390, height: 844 };

// ------------------------------------------------------------- build ------

function build() {
  if (process.argv.includes('--no-build') && existsSync(DIST)) return;
  rmSync(DIST, { recursive: true, force: true });
  console.log('exporting web build…');
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--clear'], {
    cwd: MOBILE,
    stdio: 'inherit',
    env: {
      ...process.env,
      // The fixtures answer for this host; nothing is sent to a real project.
      EXPO_PUBLIC_SUPABASE_URL: `https://${SUPABASE_HOST}`,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key',
      // So the invite link in the screenshots reads like a link somebody would
      // paste, rather than the local server this run happens to use.
      EXPO_PUBLIC_SITE_URL: 'https://league.example.org',
    },
  });
}

// ------------------------------------------------------------ serving -----

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

/** Static server with the SPA rewrite the export needs for deep links. */
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(DIST, path);

    if (!extname(path) || !existsSync(file)) file = join(DIST, 'index.html');

    try {
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });

  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

// ----------------------------------------------------------- fixtures -----

const nameOf = (id) => fixtures.people[id];

/** Answers one PostgREST read. `wantsObject` is .single()'s Accept header. */
function restResponse(pathname, search, wantsObject, { asReferee = false } = {}) {
  const table = pathname.replace('/rest/v1/', '').split('?')[0];
  const params = new URLSearchParams(search);

  const rows = (() => {
    switch (table) {
      case 'season_summary':
        return params.has('slug')
          ? fixtures.seasons.filter((s) => params.get('slug') === `eq.${s.slug}`)
          : fixtures.seasons;
      case 'season_standings':
        return fixtures.seasonStandings;
      case 'club_standings':
        return [];
      case 'match_results':
        return fixtures.results;
      case 'match_scorecard':
        return fixtures.scorecard;
      case 'club_profile':
        return [fixtures.clubProfile];
      case 'matches': {
        const id = params.get('id');
        return id ? fixtures.matches.filter((m) => id === `eq.${m.id}`) : fixtures.matches;
      }
      case 'bouts': {
        const id = (params.get('id') ?? '').replace('eq.', '');
        return fixtures.matches.flatMap((m) => m.bouts).filter((b) => b.id === id);
      }
      case 'submissions': {
        const inList = (params.get('bout_id') ?? '').replace('in.(', '').replace(')', '');
        const ids = inList.split(',').map((s) => s.replace(/"/g, ''));
        // Only what RLS would return: my own rows always, the opponent's only
        // once the bout is revealed.
        const revealed = new Set(
          fixtures.matches
            .flatMap((m) => m.bouts)
            .filter((b) => b.revealed_at)
            .map((b) => b.id),
        );
        // A referee sees both reports on a bout with an open case — the same
        // widening is_assigned_referee() does in the database.
        const underReview = new Set(fixtures.disputes.map((d) => d.bout_id));

        return [...fixtures.submissions, ...fixtures.caseSubmissions].filter(
          (s) =>
            ids.includes(s.bout_id) &&
            (s.shooter_id === ME || revealed.has(s.bout_id) || underReview.has(s.bout_id)),
        );
      }
      case 'bout_confirmations':
        return fixtures.confirmations;
      case 'dispute_queue': {
        const id = params.get('dispute_id');
        return id
          ? fixtures.disputes.filter((d) => id === `eq.${d.dispute_id}`)
          : fixtures.disputes;
      }
      case 'leaderboard': {
        const code = params.get('discipline');
        return code
          ? fixtures.leaderboard.filter((r) => code === `eq.${r.discipline}`)
          : fixtures.leaderboard;
      }
      case 'disciplines':
        return fixtures.disciplines;
      case 'profiles': {
        const id = params.get('id') ?? '';
        // The case queue is a tab only for a referee, so the role has to come
        // back different for the two referee screenshots.
        if (id.startsWith('eq.'))
          return [asReferee ? { ...fixtures.profile, role: 'referee' } : fixtures.profile];
        const ids = id.replace('in.(', '').replace(')', '').split(',');
        return ids.map(nameOf).filter(Boolean);
      }
      case 'ratings':
        return fixtures.ratings;
      case 'shooter_reliability':
        return fixtures.reliability;
      case 'club_members':
        // Two different reads hit this table: "which clubs am I in" is keyed by
        // shooter, "who is in this club" by club, and they select different
        // embeds. The parameter says which.
        return params.has('club_id') ? fixtures.clubRoster : fixtures.clubMembers;
      case 'clubs':
        return fixtures.clubs;
      default:
        return [];
    }
  })();

  return wantsObject ? (rows[0] ?? null) : rows;
}

function session() {
  const in_an_hour = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: 'fixture-access-token',
    refresh_token: 'fixture-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: in_an_hour,
    user: {
      id: ME,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'thomas@example.org',
      app_metadata: { provider: 'email' },
      user_metadata: { display_name: fixtures.profile.display_name },
      created_at: new Date(Date.now() - 86_400_000 * 400).toISOString(),
    },
  };
}

// -------------------------------------------------------------- photo -----

/**
 * A photograph of a target monitor — the proof a report carries.
 *
 * Drawn here rather than committed as a binary, so the repository holds no
 * image whose origin nobody can check, and so the numbers on the display can be
 * made to agree with the numbers in the fixtures. The confirm screen exists to
 * compare the two; a screenshot where they disagree would be showing a dispute.
 */
async function targetPhoto(browser, kind) {
  const decimal = kind === 'rifle';
  // Every display has to agree with the number the fixture says was reported —
  // except the one the open case is about, where disagreeing is the point.
  const shots = {
    // Stefan's series 3: ten decimal shots adding up to 104.4.
    rifle: [10.4, 10.7, 10.2, 9.8, 10.9, 10.6, 10.3, 10.5, 10.1, 10.9],
    // The series being reported on the report screen: 95 with 4 inner tens.
    pistol: [10, 9, 10, 10, 9, 10, 10, 9, 9, 9],
    // Manuel's report in the open case: 92, and the display says 3 inner tens.
    'case-a': [10, 9, 9, 10, 9, 9, 10, 9, 9, 8],
    // Jonas reported 94 with eleven inner tens. The display says four.
    'case-b': [10, 10, 9, 10, 9, 10, 9, 9, 9, 9],
  }[kind];
  const innerTens = { rifle: null, pistol: 4, 'case-a': 3, 'case-b': 4 }[kind];

  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page.setContent(`
    <style>
      body { margin:0; background:#0a0a0a; font-family: "DejaVu Sans", sans-serif; color:#e8e8e8; }
      .screen { padding:22px 26px; }
      .head { display:flex; justify-content:space-between; font-size:15px; color:#9aa; letter-spacing:2px; }
      .grid { display:flex; gap:26px; margin-top:18px; }
      .target { width:210px; height:210px; border-radius:50%; background:
        radial-gradient(circle, #111 0 12%, #0a0a0a 12% 24%, #111 24% 36%, #0a0a0a 36% 48%, #111 48% 60%, #0a0a0a 60% 72%, #111 72% 84%, #0a0a0a 84% 100%);
        border:2px solid #333; position:relative; }
      .hole { position:absolute; width:13px; height:13px; border-radius:50%; background:#e6e6e6; }
      table { border-collapse:collapse; font-size:17px; }
      td { padding:2px 12px 2px 0; font-variant-numeric: tabular-nums; }
      td.n { color:#7c8; }
      .total { margin-top:14px; font-size:34px; font-weight:700; letter-spacing:-1px; }
      .sub { color:#9aa; font-size:14px; }
    </style>
    <div class="screen">
      <div class="head"><span>${decimal ? 'AR' : 'AP'} 10 &#183; MATCH</span><span>LANE 4</span></div>
      <div class="grid">
        <div class="target">
          ${[
            [92, 88],
            [104, 96],
            [98, 108],
            [110, 92],
            [96, 102],
            [88, 99],
            [102, 86],
            [106, 104],
            [94, 110],
            [100, 94],
          ]
            .map(([x, y]) => `<div class="hole" style="left:${x}px; top:${y}px"></div>`)
            .join('')}
        </div>
        <div>
          <table>
            ${[0, 1, 2, 3, 4]
              .map((i) => {
                const show = (v) => (decimal ? v.toFixed(1) : String(v));
                return (
                  `<tr><td>${i + 1}</td><td class="n">${show(shots[i])}</td>` +
                  `<td>${i + 6}</td><td class="n">${show(shots[i + 5])}</td></tr>`
                );
              })
              .join('')}
          </table>
          <div class="total">${
            decimal
              ? shots.reduce((a, b) => a + b, 0).toFixed(1)
              : shots.reduce((a, b) => a + b, 0)
          }</div>
          <div class="sub">${
            decimal ? '10 shots &#183; decimal' : `Inner tens ${innerTens} &#183; 10 shots`
          }</div>
        </div>
      </div>
    </div>
  `);
  const bytes = await page.screenshot();
  await page.close();
  return bytes;
}

// ------------------------------------------------------------ capture -----

/**
 * One context per shot: a fresh storage state is the only reliable way to
 * switch between "signed in" and "a visitor with no account".
 */
async function contextFor(browser, { theme, signedIn, offline, outbox, asReferee }, photos) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: theme,
    isMobile: true,
    hasTouch: true,
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
  });

  if (signedIn) {
    const stored = JSON.stringify(session());
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [`sb-${PROJECT_REF}-auth-token`, stored],
    );
  }

  if (outbox) {
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      ['wsl.outbox.v1', JSON.stringify(outbox)],
    );
  }

  if (offline) {
    // What expo-network reads on web. Without this the queue would try to send
    // the entry the moment the screen mounts.
    await context.addInitScript(() =>
      Object.defineProperty(window.navigator, 'onLine', { get: () => false }),
    );
  }

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (url.hostname !== SUPABASE_HOST) {
      // Local build assets pass through; anything else has no business here.
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
      return route.abort();
    }

    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname.endsWith('/user')) return json({ user: session().user });
      if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
      return json(session());
    }

    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop();
      if (fn === 'shooter_recent_form') return json(fixtures.recentForm);
      if (fn === 'my_season_entry')
        return json([{ joined: false, joined_at: null, entrants: 148 }]);
      if (fn === 'my_club_season_entries') return json(fixtures.clubSeasonEntries);
      if (fn === 'club_invites_active') return json(fixtures.clubInvites);
      return json(null);
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      const wantsObject = (route.request().headers()['accept'] ?? '').includes('pgrst.object');
      return json(restResponse(url.pathname, url.search, wantsObject, { asReferee }));
    }

    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      if (route.request().method() === 'POST') {
        const rest = url.pathname.replace('/storage/v1', '');
        return json({ signedURL: `${rest}?token=fixture` });
      }
      const owner = Object.keys(photos).find((id) => url.pathname.includes(id));
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: photos[owner ?? 'default'],
      });
    }

    // Uploads have nowhere to go in a screenshot run.
    return route.abort();
  });

  return context;
}

/**
 * On the web build the picker is a file input, so the proof can be attached
 * here exactly as a shooter would attach it — the screenshot then shows the
 * screen in the state it is submitted from, not an empty form.
 */
async function attachPhoto(page, photoPath) {
  const chooser = page.waitForEvent('filechooser', { timeout: 5_000 }).catch(() => null);
  await page.getByText('Library', { exact: true }).click();
  const dialog = await chooser;
  if (!dialog) return;
  await dialog.setFiles(photoPath);
  await page.waitForTimeout(600);
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  // React Query resolves a tick after the fetch; the tab bar and lists need one
  // more frame to lay out.
  await page.waitForTimeout(700);
}

const shots = [
  {
    name: 'public-home',
    path: '/',
    signedIn: false,
    note: 'What a visitor without an account lands on.',
  },
  {
    name: 'public-season',
    path: `/season/${SEASON_SLUG}`,
    signedIn: false,
    note: 'A season table, readable by anyone.',
  },
  {
    name: 'public-match',
    path: `/match/${MATCH_DONE}`,
    signedIn: false,
    note: 'A finished match, series by series, without photos.',
  },
  { name: 'sign-in', path: '/sign-in', signedIn: false, note: 'Sign in or create an account.' },
  {
    name: 'sign-up',
    path: '/sign-in',
    signedIn: false,
    note: 'Creating an account: age, and consent you have to reach for.',
    async act(page) {
      await page.getByText('New here? Create an account').click();
      await page.waitForTimeout(400);
      await page.getByPlaceholder('you@club.org').fill('stefan@sv-karlsruhe.de');
      await page.getByPlaceholder('thomas', { exact: true }).fill('sbraeuer');
      await page.getByPlaceholder('Thomas Gehmann').fill('Stefan Bräuer');
      await page.getByPlaceholder('1990-05-14').fill('1994-11-02');
      await page.getByText('I accept the').click();
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'club-invite',
    path: `/club/invite?club=${fixtures.clubs[0].id}`,
    signedIn: true,
    note: 'An official gets the rest of the club in.',
  },
  {
    name: 'password-reset',
    path: '/reset',
    signedIn: false,
    note: 'Forgetting a password, which somebody will in week one.',
  },
  {
    name: 'season-team-join',
    path: '/season/club-cup-2026',
    signedIn: true,
    note: 'A club competition: an official enters the club.',
  },
  {
    name: 'season-join',
    path: `/season/${SEASON_SLUG}`,
    signedIn: true,
    note: 'Entering a season from the app, including one already running.',
  },
  { name: 'matches', path: '/', signedIn: true, note: 'Your matches.' },
  {
    name: 'matches-offline',
    path: '/',
    signedIn: true,
    offline: true,
    outbox: outboxEntry,
    note: 'A result shot without reception, waiting on the phone.',
  },
  {
    name: 'match',
    path: `/match/${MATCH_LIVE}`,
    signedIn: true,
    note: 'A running match: one series decided, one still blind.',
  },
  {
    name: 'report',
    path: `/bout/${BOUT_PISTOL}/report`,
    signedIn: true,
    note: 'One number, the inner tens, and a photo.',
    async act(page, { photoPath }) {
      await page.getByPlaceholder('95').fill('95');
      await page.getByPlaceholder('4').fill('4');
      await page.keyboard.press('Enter');
      await attachPhoto(page, photoPath);
    },
  },
  {
    name: 'report-warning',
    path: `/bout/${BOUT_PISTOL}/report`,
    signedIn: true,
    note: 'A total well above the shooter’s own average asks once more.',
    async act(page) {
      await page.getByPlaceholder('95').fill('99');
      await page.getByPlaceholder('4').fill('7');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'confirm',
    path: `/bout/${BOUT_TO_CONFIRM}/confirm`,
    signedIn: true,
    note: 'Checking the opponent’s photo against the number they reported.',
  },
  { name: 'rankings', path: '/leaderboard', signedIn: true, note: 'Glicko-2 rankings.' },
  {
    name: 'referee-queue',
    path: '/cases',
    signedIn: true,
    asReferee: true,
    note: 'What is left when two shooters disagree.',
  },
  {
    name: 'referee-case',
    path: `/case/${DISPUTE}`,
    signedIn: true,
    asReferee: true,
    note: 'The complaint, and the evidence it is about.',
  },
  {
    name: 'referee-decision',
    path: `/case/${DISPUTE}`,
    signedIn: true,
    asReferee: true,
    note: 'The four endings a case can have.',
    async act(page) {
      await page.getByText('Correct a score').click();
      await page.getByText('Void the series').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
    },
  },
  { name: 'profile', path: '/profile', signedIn: true, note: 'Club, ratings, reliability, push.' },
];

/** Dark is captured for the screens the README shows side by side. */
const ALSO_DARK = new Set(['public-home', 'matches', 'match', 'report', 'confirm']);

async function main() {
  build();
  mkdirSync(OUT, { recursive: true });

  const server = await serve();
  // PLAYWRIGHT_CHROMIUM_PATH lets a machine with a preinstalled Chromium skip
  // playwright's own download.
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  // One display per shooter whose photo any screen asks for. The path carries
  // the shooter id, so the route below can hand back the right one.
  const photos = {
    default: await targetPhoto(browser, 'rifle'),
    [fixtures.MANUEL]: await targetPhoto(browser, 'case-a'),
    [fixtures.JONAS]: await targetPhoto(browser, 'case-b'),
  };
  const photoPath = join(tmpdir(), 'wsl-target-photo.png');
  writeFileSync(photoPath, await targetPhoto(browser, 'pistol'));

  try {
    for (const shot of shots) {
      for (const theme of shot.name && ALSO_DARK.has(shot.name) ? ['light', 'dark'] : ['light']) {
        const context = await contextFor(
          browser,
          {
            theme,
            signedIn: shot.signedIn,
            offline: shot.offline,
            outbox: shot.outbox,
            asReferee: shot.asReferee,
          },
          photos,
        );
        const page = await context.newPage();
        const failures = [];
        page.on('pageerror', (e) => failures.push(e.message));

        await page.goto(`http://127.0.0.1:${PORT}${shot.path}`, { waitUntil: 'domcontentloaded' });
        await settle(page);
        if (shot.act) await shot.act(page, { photoPath });

        const file = join(OUT, `${shot.name}-${theme}.png`);
        await page.screenshot({ path: file });
        await context.close();

        console.log(
          `${shot.name}-${theme}${failures.length ? `  (page errors: ${failures[0]})` : ''}`,
        );
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

await main();
