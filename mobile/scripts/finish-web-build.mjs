#!/usr/bin/env node
/**
 * Adds to the exported web build what Expo's HTML template leaves out.
 *
 * The beta ships as a web app rather than through the stores: no app review —
 * firearms content policies are a real rejection risk — and a club official can
 * send a link instead of an invitation to install something.
 *
 * A `+html.tsx` would be the tidy way to do this, but that is only used when
 * `web.output` is "static". This project exports "single", because the public
 * pages a crawler needs are already served as real HTML by the public-pages
 * edge function, and one bundle is simpler to host. So the head is patched
 * here instead, as an explicit step rather than a silent one.
 *
 *   node scripts/finish-web-build.mjs [dist]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = resolve(process.argv[2] ?? join(MOBILE, 'dist'));
const INDEX = join(DIST, 'index.html');

if (!existsSync(INDEX)) {
  console.error(`No build at ${INDEX}. Run "npm run build:web" first.`);
  process.exit(1);
}

const HEAD = `
    <meta name="description" content="An online league for sport shooters on electronic targets. Shoot at your own club, report the score with a photo, and neither result is visible until both have submitted." />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icon-512.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="WSL" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F7F8FB" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0B0D13" />
    <style>
      /* Painted before the bundle boots. Without it a phone flashes white,
         which on a dark device at a dim range is a slap in the face. */
      html, body { background-color: #F7F8FB; }
      @media (prefers-color-scheme: dark) {
        html, body { background-color: #0B0D13; }
      }
    </style>
`;

let html = readFileSync(INDEX, 'utf8');

if (html.includes('manifest.webmanifest')) {
  console.log('already finished, nothing to do');
  process.exit(0);
}

// viewport-fit=cover is what lets the safe-area insets reach the tab bar once
// the app is installed to a home screen and runs without browser chrome.
html = html.replace(
  'content="width=device-width, initial-scale=1, shrink-to-fit=no"',
  'content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"',
);

html = html.replace('</head>', `${HEAD}  </head>`);

writeFileSync(INDEX, html);
console.log('web build finished: manifest, theme colour, safe-area viewport');
