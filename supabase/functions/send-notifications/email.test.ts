/**
 * Exercises the email builder with plain Node — no Deno, no network:
 *
 *   node --experimental-strip-types supabase/functions/send-notifications/email.test.ts
 *
 * The two things that matter: nothing user-supplied can escape into markup, and
 * an email never carries a score. The blind reveal is enforced in the database;
 * a mail that quoted the opponent's total would walk straight around it.
 */

import assert from 'node:assert/strict';

import { absoluteUrl, buildEmail, esc, type EmailNotification } from './email.ts';

const checks: [string, () => void][] = [];
const check = (name: string, fn: () => void) => checks.push([name, fn]);

function notification(over: Partial<EmailNotification> = {}): EmailNotification {
  return {
    id: 'n1',
    email: 'stefan@sv-karlsruhe.de',
    display_name: 'Stefan Bräuer',
    kind: 'opponent_submitted',
    title: 'Your opponent has reported',
    body: 'You still cannot see their score until you have submitted too.',
    data: { route: '/match/abc' },
    ...over,
  };
}

check('escapes anything that could break out of markup', () => {
  assert.equal(esc('<script>&"'), '&lt;script&gt;&amp;&quot;');

  const mail = buildEmail(
    notification({ display_name: '<img src=x onerror=alert(1)>', title: 'A <b>tag</b>' }),
    'https://league.example.org',
  );

  assert.ok(!mail.html.includes('<img src=x'));
  assert.ok(!mail.html.includes('<b>tag</b>'));
  assert.ok(mail.html.includes('&lt;b&gt;tag&lt;/b&gt;'));
});

check('a link is only built from a route and a site', () => {
  assert.equal(absoluteUrl('/match/abc', 'https://league.example.org'), 'https://league.example.org/match/abc');
  // A trailing slash on the site must not double up.
  assert.equal(absoluteUrl('/match/abc', 'https://league.example.org/'), 'https://league.example.org/match/abc');
  // Nothing configured, nothing invented.
  assert.equal(absoluteUrl('/match/abc', undefined), null);
  // Anything that is not an app route is refused, so a payload cannot point the
  // button at somebody else's site.
  assert.equal(absoluteUrl('https://evil.example/steal', 'https://league.example.org'), null);
  assert.equal(absoluteUrl(42, 'https://league.example.org'), null);
});

check('without a site there is no button rather than a broken one', () => {
  const mail = buildEmail(notification());
  assert.ok(!mail.html.includes('Open the match'));
  assert.ok(!mail.text.includes('undefined'));
});

check('the message is addressed to a person, not a handle', () => {
  const mail = buildEmail(notification(), 'https://league.example.org');
  assert.ok(mail.text.startsWith('Hello Stefan,'));
  assert.equal(mail.to, 'stefan@sv-karlsruhe.de');
  assert.equal(mail.subject, 'Your opponent has reported');
});

check('a nameless account still gets a greeting', () => {
  const mail = buildEmail(notification({ display_name: '   ' }));
  assert.ok(mail.text.startsWith('Hello there,'));
});

check('no notification carries a score', () => {
  // The bodies the triggers actually write. If one of these ever names a
  // number, the blind reveal has a hole in it that RLS cannot close.
  const bodies = [
    'They went first. You still cannot see their score.',
    'Both results are in. Open the match to see them.',
    'Report your series or the bout is lost by walkover.',
    'A referee will look at both photos. The match is not rated until then.',
  ];

  for (const body of bodies) {
    const mail = buildEmail(notification({ body }), 'https://league.example.org');
    assert.ok(!/\d+[.,]\d/.test(mail.text), `a decimal score leaked: ${body}`);
  }
});

check('the way out is in every message', () => {
  const mail = buildEmail(notification(), 'https://league.example.org');
  assert.ok(mail.text.includes('turn these emails off'));
  assert.ok(mail.html.includes('turn these emails off'));
});

let failed = 0;
for (const [name, fn] of checks) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${(e as Error).message}`);
  }
}

console.log(`\n${checks.length - failed} of ${checks.length} checks passed`);
if (failed) process.exit(1);
