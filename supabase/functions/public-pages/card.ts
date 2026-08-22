/**
 * The share card: a finished match as a single image.
 *
 * A result that only exists behind a link gets read by the two people who shot
 * it. The same result as a picture gets pasted into a club chat group, and that
 * is the only artefact this league has that travels on its own. So the card is
 * the score plate the app already uses — bone, pitch, the ring debossed — at
 * the proportions Open Graph wants.
 *
 * Deliberately no Deno and no network in here, so it can be exercised with
 * plain Node the way render.ts is. index.ts does the fetching and the
 * rasterising; this file only draws.
 *
 * 1200x630 is the size every social preview crops to. Anything important stays
 * well inside it, because Slack, WhatsApp and iMessage all trim the edges
 * differently.
 *
 * SVG cannot measure text without a font engine, so nothing here reflows: the
 * baselines are fixed, names are cut to a length that fits at the size they are
 * drawn, and the series strip is the only optional block. Change a size and the
 * baselines have to move with it.
 */

export interface CardData {
  nameA: string;
  nameB: string;
  clubA?: string | null;
  clubB?: string | null;
  countryA?: string | null;
  countryB?: string | null;
  /** Match points, already formatted — "3", "2.5". */
  pointsA: string;
  pointsB: string;
  winnerSide: 'a' | 'b' | null;
  discipline: string;
  disciplineName?: string | null;
  settledAt: string;
  /** Series totals, already formatted, oldest first. Optional. */
  seriesA?: string[];
  seriesB?: string[];
}

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** The plate does not change theme, so the card has exactly one palette. */
const PLATE = '#EFEAE0';
const PITCH = '#101418';
const MUTED = '#5C5F63';
const RULE = '#CFC9BC';
const AMBER = '#96600F';

/**
 * Escapes text for XML. Everything interpolated below goes through it —
 * a display name is user-supplied, and an unescaped ampersand is enough to
 * make the whole document unparseable and the card silently blank.
 */
export function escXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Trims to fit. SVG has no text wrapping and no way to measure a glyph without
 * a font engine, so a long name has to be cut here rather than allowed to run
 * off the edge of the card.
 */
export function fit(value: string, max: number): string {
  const s = String(value ?? '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * A row: name over club, and the match points on the right. The winner's
 * figure is in pitch and the loser's in muted — the same rule as the app,
 * where only the winning number is in full ink.
 */
function shooterRow(
  y: number,
  name: string,
  detail: string,
  points: string,
  won: boolean,
): string {
  const ink = won ? PITCH : MUTED;
  return `
  <text x="80" y="${y}" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="46"
        font-weight="700" letter-spacing="-1" fill="${ink}">${escXml(fit(name, 26))}</text>
  <text x="80" y="${y + 34}" font-family="IBM Plex Mono, Menlo, monospace" font-size="21"
        letter-spacing="2.4" fill="${MUTED}">${escXml(fit(detail.toUpperCase(), 34))}</text>
  <text x="1120" y="${y + 10}" text-anchor="end"
        font-family="Archivo, Helvetica, Arial, sans-serif" font-size="96" font-weight="800"
        letter-spacing="-4" fill="${ink}">${escXml(points)}</text>`;
}

/** The series totals as a mono strip, so the card shows how it was won. */
function seriesStrip(y: number, totals: string[]): string {
  if (!totals.length) return '';
  const cells = totals
    .slice(0, 5)
    .map((total, i) => {
      const x = 80 + i * 116;
      return `<text x="${x}" y="${y}" font-family="IBM Plex Mono, Menlo, monospace"
        font-size="26" fill="${MUTED}">${escXml(fit(total, 6))}</text>`;
    })
    .join('');
  return cells;
}

/**
 * The card as SVG. index.ts turns this into a PNG; nothing here knows that.
 */
export function renderCardSvg(data: CardData): string {
  const aWon = data.winnerSide === 'a';
  const bWon = data.winnerSide === 'b';

  const detail = (country?: string | null, club?: string | null) =>
    [country, club].filter(Boolean).join(' · ') || 'World Shooting League';

  const seriesA = data.seriesA ?? [];
  const seriesB = data.seriesB ?? [];
  const hasSeries = seriesA.length > 0 || seriesB.length > 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"
     viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img"
     aria-label="${escXml(`${data.nameA} ${data.pointsA} v ${data.pointsB} ${data.nameB}`)}">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${PLATE}"/>

  <!-- The aiming mark, debossed. Same geometry as the plate in the app. -->
  <g opacity="0.10" fill="none" stroke="${PITCH}" stroke-width="2">
    <circle cx="1132" cy="18" r="196"/>
    <circle cx="1132" cy="18" r="152"/>
    <circle cx="1132" cy="18" r="108"/>
  </g>
  <circle cx="1132" cy="18" r="68" fill="${PITCH}" opacity="0.05"/>

  <text x="80" y="86" font-family="IBM Plex Mono, Menlo, monospace" font-size="22"
        letter-spacing="3.4" fill="${MUTED}">${escXml(
          fit((data.disciplineName ?? data.discipline).toUpperCase(), 30),
        )}</text>
  <text x="1120" y="86" text-anchor="end" font-family="IBM Plex Mono, Menlo, monospace"
        font-size="22" letter-spacing="3.4" fill="${MUTED}">${escXml(
          formatDate(data.settledAt).toUpperCase(),
        )}</text>

  <line x1="80" y1="118" x2="1120" y2="118" stroke="${PITCH}" stroke-width="3"/>

  ${shooterRow(210, data.nameA, detail(data.countryA, data.clubA), data.pointsA, aWon)}
  <line x1="80" y1="286" x2="1120" y2="286" stroke="${RULE}" stroke-width="1"/>
  ${shooterRow(356, data.nameB, detail(data.countryB, data.clubB), data.pointsB, bWon)}

  ${
    hasSeries
      ? `<line x1="80" y1="432" x2="1120" y2="432" stroke="${RULE}" stroke-width="1"/>
  <text x="80" y="470" font-family="IBM Plex Mono, Menlo, monospace" font-size="19"
        letter-spacing="2.6" fill="${MUTED}">SERIES</text>
  ${seriesStrip(508, seriesA)}
  ${seriesStrip(546, seriesB)}`
      : ''
  }

  <text x="80" y="${CARD_HEIGHT - 34}" font-family="Archivo, Helvetica, Arial, sans-serif"
        font-size="24" font-weight="700" letter-spacing="1.6"
        fill="${AMBER}">WORLD SHOOTING LEAGUE</text>
  <text x="1120" y="${CARD_HEIGHT - 34}" text-anchor="end"
        font-family="IBM Plex Mono, Menlo, monospace" font-size="20" letter-spacing="2"
        fill="${MUTED}">${escXml(
          data.winnerSide === null ? 'DRAWN' : 'DECIDED ON SERIES WON',
        )}</text>
</svg>`;
}
