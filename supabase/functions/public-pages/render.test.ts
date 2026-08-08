/**
 * Exercises the renderer with plain Node — no Deno, no network:
 *
 *   node --experimental-strip-types supabase/functions/public-pages/render.test.ts
 *
 * What matters here is that the pages carry their content in the HTML rather
 * than in a script that has to run first, and that nothing user-supplied can
 * escape into markup.
 */

import assert from 'node:assert/strict';

import {
  esc,
  renderClub,
  renderIndex,
  renderMatch,
  renderNotFound,
  renderSeason,
  type ClubRow,
  type ResultRow,
  type ScorecardRow,
  type SeasonRow,
  type StandingRow,
} from './render.ts';

const meta = {
  title: 'World Shooting League',
  description: 'An online league for sport shooters.',
  url: 'https://example.org/',
  appUrl: 'https://app.example.org',
};

const season: SeasonRow = {
  slug: 'team-ar10et-2026',
  name: 'Club League AR10ET 2026',
  state: 'running',
  competition_type: 'team',
  discipline_name: 'Air Rifle 10 shots, 10 m, standing',
  format_name: 'Single series, 10 shots',
  shooters_entered: 0,
  clubs_entered: 2,
  rounds_paired: 1,
  round_count: 4,
};

const result: ResultRow = {
  match_id: 'f3c1b0de-1111-4222-8333-444455556666',
  discipline: 'AR10ET',
  points_a: 1,
  points_b: 0,
  name_a: 'Anna Bauer',
  name_b: 'Dirk Hoffmann',
  winner_side: 'a',
  settled_at: '2026-08-07T18:20:00.000Z',
};

let passed = 0;
function check(what: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${what}`);
}

console.log('render');

check('escapes anything that could break out of markup', () => {
  assert.equal(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(esc('a "b" & \'c\''), 'a &quot;b&quot; &amp; &#39;c&#39;');
  assert.equal(esc(null), '');
});

check('a club named with a tag cannot inject one', () => {
  const html = renderClub(
    meta,
    {
      slug: 'x',
      name: '<img src=x onerror=alert(1)>',
      short_name: null,
      country_code: 'DE',
      city: null,
      shooters: 1,
      fixtures_played: 0,
      fixtures_won: 0,
    } satisfies ClubRow,
    ['<script>bad</script>'],
  );
  assert.ok(!html.includes('<img src=x'), 'club name was not escaped');
  assert.ok(!html.includes('<script>bad'), 'roster entry was not escaped');
  assert.ok(html.includes('&lt;img src=x'));
});

check('the index carries seasons and results in the HTML itself', () => {
  const html = renderIndex(meta, [season], [result]);
  assert.ok(html.includes('Club League AR10ET 2026'));
  assert.ok(html.includes('Anna Bauer v Dirk Hoffmann'));
  assert.ok(html.includes('href="/s/team-ar10et-2026"'));
  assert.ok(html.includes(`href="/m/${result.match_id}"`));
  assert.ok(html.includes('Round 1/4'));
});

check('every page has a title, description, canonical and og tags', () => {
  const pages = [
    renderIndex(meta, [season], [result]),
    renderSeason(meta, season, []),
    renderMatch(meta, result, []),
    renderNotFound(meta),
  ];
  for (const html of pages) {
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]+"/);
    assert.match(html, /<link rel="canonical"/);
    assert.match(html, /<meta property="og:title"/);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /^<!doctype html>/);
  }
});

check('a season table renders rows, not an empty shell', () => {
  const rows: StandingRow[] = [
    { position: 1, name: 'SV Karlsruhe', detail: '1/0/0 · boards 2:1', played: 1, points: 2 },
    { position: 2, name: 'SG Musterstadt', detail: '0/0/1 · boards 1:2', played: 1, points: 0 },
  ];
  const html = renderSeason(meta, season, rows);
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('SV Karlsruhe'));
  assert.ok(html.includes('SG Musterstadt'));
  assert.ok(html.includes('boards 2:1'));
});

check('a scorecard marks the winning side of each series', () => {
  const card: ScorecardRow[] = [
    { bout: 1, total_a: '104.1', total_b: '101.8', inner_a: null, inner_b: null, winner_side: 'a' },
    { bout: 2, total_a: '99.5', total_b: '103.2', inner_a: null, inner_b: null, winner_side: 'b' },
  ];
  const html = renderMatch(meta, result, card);
  assert.ok(html.includes('104.1'));
  assert.ok(html.includes('103.2'));
  assert.equal((html.match(/class="num win"/g) ?? []).length, 2);
});

check('inner tens only appear where a discipline reports them', () => {
  const withInner = renderMatch(meta, result, [
    { bout: 1, total_a: '95', total_b: '95', inner_a: 4, inner_b: 2, winner_side: 'a' },
  ]);
  const without = renderMatch(meta, result, [
    { bout: 1, total_a: '104.1', total_b: '101.8', inner_a: null, inner_b: null, winner_side: 'a' },
  ]);
  assert.ok(withInner.includes('4 inner tens'));
  assert.ok(!without.includes('inner tens'));
});

check('an empty league still renders a readable page', () => {
  const html = renderIndex(meta, [], []);
  assert.ok(html.includes('No seasons yet.'));
  assert.ok(html.includes('No matches have been decided yet.'));
});

console.log(`\n${passed} checks passed`);
