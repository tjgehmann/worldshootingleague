/**
 * Exercises the share card with plain Node — no Deno, no rasteriser:
 *
 *   node --experimental-strip-types supabase/functions/public-pages/card.test.ts
 *
 * What matters here is that the SVG is well formed whatever a shooter called
 * themselves, that a name nobody can measure still fits inside the frame, and
 * that the card never carries anything the match page would not.
 */

import assert from 'node:assert/strict';

import {
  CARD_HEIGHT,
  CARD_WIDTH,
  escXml,
  fit,
  renderCardSvg,
  type CardData,
} from './card.ts';

const base: CardData = {
  nameA: 'Thomas Gehmann',
  nameB: 'Stefan Bräuer',
  clubA: 'SV Karlsruhe 1861',
  clubB: 'SG Zürich',
  countryA: 'DE',
  countryB: 'CH',
  pointsA: '3',
  pointsB: '1',
  winnerSide: 'a',
  discipline: 'AR10ET',
  disciplineName: 'Air Rifle 10 m',
  settledAt: '2026-08-01T19:56:00.000Z',
  seriesA: ['103.7', '102.9', '100.8', '104.1'],
  seriesB: ['101.2', '99.8', '104.4', '100.9'],
};

let passed = 0;
function check(what: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${what}`);
}

console.log('share card');

check('escapes anything that could break out of the document', () => {
  assert.equal(escXml('<g/>'), '&lt;g/&gt;');
  assert.equal(escXml(`a "b" & 'c'`), 'a &quot;b&quot; &amp; &apos;c&apos;');
  assert.equal(escXml(null), '');
});

check('a shooter named with a tag cannot inject one', () => {
  const svg = renderCardSvg({
    ...base,
    nameA: '</text><script>alert(1)</script>',
    clubA: '"><rect width="9999" height="9999" fill="red"/>',
  });
  assert.ok(!svg.includes('<script>'), 'name was not escaped');
  assert.ok(!svg.includes('<rect width="9999"'), 'club was not escaped');
  assert.ok(svg.includes('&lt;script&gt;'));
});

check('an ampersand does not silently blank the card', () => {
  // A raw & is not valid XML, and a rasteriser given invalid XML produces
  // nothing at all rather than an error anyone would see.
  const svg = renderCardSvg({ ...base, clubA: 'Böblingen & Umgebung' });
  assert.ok(svg.includes('&amp;'));
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(svg), 'a bare ampersand survived');
});

check('the frame is the size every preview crops to', () => {
  const svg = renderCardSvg(base);
  assert.equal(CARD_WIDTH, 1200);
  assert.equal(CARD_HEIGHT, 630);
  assert.ok(svg.includes(`width="1200"`));
  assert.ok(svg.includes(`height="630"`));
  assert.ok(svg.includes(`viewBox="0 0 1200 630"`));
});

check('a name too long to measure is cut rather than run off the edge', () => {
  assert.equal(fit('short', 26), 'short');
  assert.equal(fit('x'.repeat(40), 26).length, 26);
  assert.ok(fit('x'.repeat(40), 26).endsWith('…'));

  const svg = renderCardSvg({ ...base, nameA: 'Maximilian '.repeat(6) });
  assert.ok(svg.includes('…'), 'a very long name was not trimmed');
});

check('both shooters, both scores and the discipline are in the picture', () => {
  const svg = renderCardSvg(base);
  // The club and country line is uppercase mono, the same as on the plate in
  // the app, so it appears on the card in that form.
  for (const wanted of ['Thomas Gehmann', 'Stefan Br', 'AIR RIFLE 10 M', 'SV KARLSRUHE 1861']) {
    assert.ok(svg.includes(wanted), `${wanted} missing from the card`);
  }
  // The points are drawn as their own text nodes, so look for them as such.
  assert.ok(/>3<\/text>/.test(svg), 'winner points missing');
  assert.ok(/>1<\/text>/.test(svg), 'loser points missing');
});

check('the winner is the only figure in full ink', () => {
  const a = renderCardSvg({ ...base, winnerSide: 'a' });
  const b = renderCardSvg({ ...base, winnerSide: 'b' });
  assert.notEqual(a, b, 'the card does not change when the winner does');

  // Pitch is the plate ink; muted is the same grey the app uses on bone.
  assert.ok(a.includes('#101418') && a.includes('#5C5F63'));
});

check('a drawn match says so rather than crowning nobody', () => {
  const svg = renderCardSvg({ ...base, winnerSide: null, pointsA: '2.5', pointsB: '2.5' });
  assert.ok(svg.includes('DRAWN'));
  assert.ok(!svg.includes('DECIDED ON SERIES WON'));
});

check('a match with no scorecard still renders a card', () => {
  const svg = renderCardSvg({ ...base, seriesA: undefined, seriesB: undefined });
  assert.ok(svg.includes('Thomas Gehmann'));
  // Match the label itself, not the word: "DECIDED ON SERIES WON" along the
  // bottom contains it too.
  assert.ok(!/>SERIES<\/text>/.test(svg), 'an empty series strip was drawn anyway');
  assert.ok(svg.trimEnd().endsWith('</svg>'));
});

check('a missing club or country does not leave a dangling separator', () => {
  const svg = renderCardSvg({ ...base, clubA: null, countryA: null });
  assert.ok(!svg.includes('· <'), 'a separator was left with nothing beside it');
  assert.ok(svg.includes('WORLD SHOOTING LEAGUE'));
});

check('an unparseable date does not put "Invalid Date" on the card', () => {
  const svg = renderCardSvg({ ...base, settledAt: 'not-a-date' });
  assert.ok(!svg.includes('Invalid Date'));
});

check('the card never carries a photo, a handle or an unsettled score', () => {
  // The blind reveal has a hole in it the moment anything leaks a number that
  // the match page itself would not show. The card is built only from what
  // match_results and match_scorecard already expose.
  const svg = renderCardSvg(base);
  assert.ok(!svg.includes('<image'), 'the card embedded an image');
  assert.ok(!/href/i.test(svg), 'the card linked to something');

  // The xmlns declaration is an identifier rather than an address, so it is the
  // one http: allowed to appear. Anything else would be a fetch the rasteriser
  // makes on somebody else's behalf.
  const withoutNamespace = svg.replace(/xmlns="[^"]*"/g, '');
  assert.ok(!/https?:/.test(withoutNamespace), 'the card referenced something remote');
});

console.log(`\n${passed} checks passed`);
