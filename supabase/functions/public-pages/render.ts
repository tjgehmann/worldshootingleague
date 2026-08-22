/**
 * HTML for the public pages.
 *
 * Kept free of Deno and network APIs so it can be exercised with plain Node —
 * see render.test.ts. index.ts does the fetching and hands plain data in.
 *
 * These pages exist because a single-page app shows a crawler an empty shell.
 * Everything here is real HTML with the content already in it, so a search
 * engine, a chat preview and a browser with JavaScript switched off all see the
 * same thing.
 */

export interface SeasonRow {
  slug: string;
  name: string;
  state: string;
  competition_type: string;
  discipline_name: string;
  format_name: string;
  shooters_entered: number;
  clubs_entered: number;
  rounds_paired: number;
  round_count: number;
}

export interface ResultRow {
  match_id: string;
  discipline: string;
  points_a: number;
  points_b: number;
  name_a: string;
  name_b: string;
  winner_side: 'a' | 'b' | null;
  settled_at: string;
}

export interface StandingRow {
  position: number;
  name: string;
  detail: string;
  played: number;
  points: number | string;
}

export interface ScorecardRow {
  bout: number;
  total_a: string;
  total_b: string;
  inner_a: number | null;
  inner_b: number | null;
  winner_side: 'a' | 'b' | null;
}

export interface ClubRow {
  slug: string;
  name: string;
  short_name: string | null;
  country_code: string;
  city: string | null;
  shooters: number;
  fixtures_played: number;
  fixtures_won: number;
}

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute URL of this page, for canonical and og:url. */
  url: string;
  /** Where the app lives, so a reader can carry on there. */
  appUrl?: string;
  /**
   * Absolute URL of the card for this page, if it has one. A result pasted into
   * a club chat is the only thing this league has that travels on its own, and
   * without this it travels as a line of grey text.
   */
  imageUrl?: string;
}

/** Escapes text for HTML. Everything interpolated below goes through it. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STYLE = `
:root{--bg:#0B0D13;--surf:#161A25;--surf2:#1F2432;--line:#272D3C;--ink:#F4F6FB;
--ink2:#939BB0;--ink3:#656D80;--accent:#8788FF;--pos:#34D399}
@media (prefers-color-scheme: light){:root{--bg:#F7F8FB;--surf:#FFF;--surf2:#EFF1F7;
--line:#E3E6EF;--ink:#0B0D13;--ink2:#5B6377;--ink3:#838B9E;--accent:#4B4DE0;--pos:#0E9F6E}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);line-height:1.5;
font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 20px 72px}
a{color:var(--accent)}
.kicker{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink3);
font-weight:700;margin:0 0 6px}
h1{font-size:30px;line-height:1.15;letter-spacing:-.02em;margin:0 0 8px}
h2{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink3);
font-weight:700;margin:36px 0 10px}
p.lede{color:var(--ink2);margin:0 0 24px}
.card{background:var(--surf);border-radius:16px;padding:16px 18px;margin-bottom:10px;
display:flex;align-items:center;gap:14px;text-decoration:none;color:inherit}
.card .grow{flex:1;min-width:0}
.card .name{font-weight:600}
.card .meta{font-size:12.5px;color:var(--ink3)}
.score{font-weight:700;font-size:20px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.win{color:var(--pos)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;
color:var(--ink3);padding:8px 0;border-bottom:2px solid var(--line)}
td{padding:11px 0;border-bottom:1px solid var(--line)}
td.num,th.num{text-align:right}
td.pos{width:28px;color:var(--ink3);font-weight:700}
.foot{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);
color:var(--ink3);font-size:14px}
.pill{display:inline-block;background:var(--surf2);color:var(--ink2);border-radius:999px;
padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
`;

/**
 * JSON inside a <script> block needs more than JSON.stringify: a value
 * containing "</script>" would close the element and everything after it would
 * be parsed as markup. Escaping the angle brackets as unicode keeps the JSON
 * valid and inert.
 */
function jsonForScript(value: object): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function page(meta: PageMeta, body: string, jsonLd?: object): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${esc(meta.url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="World Shooting League">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${esc(meta.url)}">
${
  meta.imageUrl
    ? `<meta property="og:image" content="${esc(meta.imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(meta.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(meta.imageUrl)}">`
    : '<meta name="twitter:card" content="summary">'
}
${jsonLd ? `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>` : ''}
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
<p class="foot">World Shooting League — shooters compete independently of time and place.
Results become visible only once both have submitted.${
    meta.appUrl ? ` <a href="${esc(meta.appUrl)}">Open the app</a>.` : ''
  }</p>
</main>
</body>
</html>`;
}

export function renderIndex(
  meta: PageMeta,
  seasons: SeasonRow[],
  results: ResultRow[],
): string {
  const seasonCards = seasons.length
    ? seasons
        .map(
          (s) => `<a class="card" href="/s/${esc(s.slug)}">
  <span class="grow"><span class="name">${esc(s.name)}</span><br>
  <span class="meta">${esc(s.discipline_name)} &middot; ${
            s.competition_type === 'team'
              ? `${s.clubs_entered} clubs`
              : `${s.shooters_entered} shooters`
          }</span></span>
  <span class="pill">${
    s.state === 'running' ? `Round ${s.rounds_paired}/${s.round_count}` : esc(s.state)
  }</span>
</a>`,
        )
        .join('\n')
    : '<p class="lede">No seasons yet.</p>';

  const resultCards = results.length
    ? results
        .map(
          (r) => `<a class="card" href="/m/${esc(r.match_id)}">
  <span class="grow"><span class="name">${esc(r.name_a)} v ${esc(r.name_b)}</span><br>
  <span class="meta">${esc(r.discipline)} &middot; ${esc(formatDate(r.settled_at))}</span></span>
  <span class="score">${esc(r.points_a)} : ${esc(r.points_b)}</span>
</a>`,
        )
        .join('\n')
    : '<p class="lede">No matches have been decided yet.</p>';

  return page(
    meta,
    `<p class="kicker">Challenging shooters</p>
<h1>World Shooting League</h1>
<p class="lede">An online league for sport shooters on electronic targets. Each shoots at
their own club and reports the score; neither result is visible until both have submitted.</p>
<h2>Seasons</h2>
${seasonCards}
<h2>Recent results</h2>
${resultCards}`,
    {
      '@context': 'https://schema.org',
      '@type': 'SportsOrganization',
      name: 'World Shooting League',
      sport: 'Sport shooting',
      url: meta.url,
    },
  );
}

export function renderSeason(
  meta: PageMeta,
  season: SeasonRow,
  rows: StandingRow[],
): string {
  const isTeam = season.competition_type === 'team';

  const table = rows.length
    ? `<table>
<thead><tr><th class="pos">#</th><th>${isTeam ? 'Club' : 'Shooter'}</th>
<th class="num">Played</th><th class="num">Points</th></tr></thead>
<tbody>
${rows
  .map(
    (r) => `<tr><td class="pos">${esc(r.position)}</td>
<td><strong>${esc(r.name)}</strong><br><span class="meta">${esc(r.detail)}</span></td>
<td class="num">${esc(r.played)}</td><td class="num"><strong>${esc(r.points)}</strong></td></tr>`,
  )
  .join('\n')}
</tbody></table>`
    : '<p class="lede">Nothing decided yet.</p>';

  return page(
    meta,
    `<p class="kicker">${esc(season.discipline_name)} &middot; ${esc(season.format_name)}</p>
<h1>${esc(season.name)}</h1>
<p class="lede">${
      isTeam ? `${season.clubs_entered} clubs` : `${season.shooters_entered} shooters`
    } &middot; ${
      season.state === 'running'
        ? `round ${season.rounds_paired} of ${season.round_count}`
        : esc(season.state)
    }</p>
<h2>Table</h2>
${table}`,
    {
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: season.name,
      sport: 'Sport shooting',
      url: meta.url,
    },
  );
}

export function renderMatch(
  meta: PageMeta,
  match: ResultRow,
  scorecard: ScorecardRow[],
): string {
  const rows = scorecard.length
    ? `<table>
<thead><tr><th>Series</th><th class="num">${esc(match.name_a)}</th>
<th class="num">${esc(match.name_b)}</th></tr></thead>
<tbody>
${scorecard
  .map(
    (r) => `<tr><td>${esc(r.bout)}</td>
<td class="num${r.winner_side === 'a' ? ' win' : ''}"><strong>${esc(r.total_a)}</strong>${
      r.inner_a !== null ? `<br><span class="meta">${esc(r.inner_a)} inner tens</span>` : ''
    }</td>
<td class="num${r.winner_side === 'b' ? ' win' : ''}"><strong>${esc(r.total_b)}</strong>${
      r.inner_b !== null ? `<br><span class="meta">${esc(r.inner_b)} inner tens</span>` : ''
    }</td></tr>`,
  )
  .join('\n')}
</tbody></table>`
    : '<p class="lede">No scorecard for this match.</p>';

  return page(
    meta,
    `<p class="kicker">${esc(match.discipline)} &middot; ${esc(formatDate(match.settled_at))}</p>
<h1>${esc(match.name_a)} v ${esc(match.name_b)}</h1>
<p class="lede"><span class="score${match.winner_side === 'a' ? ' win' : ''}">${esc(
      match.points_a,
    )}</span> : <span class="score${match.winner_side === 'b' ? ' win' : ''}">${esc(
      match.points_b,
    )}</span></p>
<h2>Scorecard</h2>
${rows}
<p class="foot">Target photos stay with the two shooters and the referee.</p>`,
    {
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: `${match.name_a} v ${match.name_b}`,
      sport: 'Sport shooting',
      startDate: match.settled_at,
      url: meta.url,
    },
  );
}

export function renderClub(meta: PageMeta, club: ClubRow, roster: string[]): string {
  return page(
    meta,
    `<p class="kicker">${esc(club.country_code)}${club.city ? ` &middot; ${esc(club.city)}` : ''}</p>
<h1>${esc(club.name)}</h1>
<p class="lede">${esc(club.shooters)} shooters &middot; ${esc(
      club.fixtures_played,
    )} fixtures, ${esc(club.fixtures_won)} won</p>
<h2>Roster</h2>
${
  roster.length
    ? `<ul>${roster.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
    : '<p class="lede">Nobody has joined yet.</p>'
}`,
    {
      '@context': 'https://schema.org',
      '@type': 'SportsTeam',
      name: club.name,
      sport: 'Sport shooting',
      url: meta.url,
    },
  );
}

export function renderNotFound(meta: PageMeta): string {
  return page(
    meta,
    `<h1>Not found</h1>
<p class="lede">There is nothing at this address. It may have been a match that is still
being shot — those stay private until both shooters have submitted.</p>`,
  );
}
