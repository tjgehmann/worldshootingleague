/**
 * Server-rendered public pages.
 *
 * The Expo web build is a single-page app, so a crawler that does not run
 * JavaScript sees an empty shell. These routes return real HTML with the
 * content already in it — for search engines, for chat link previews, and for
 * anyone who just wants to read a table.
 *
 *   /            the league: seasons and recent results
 *   /s/{slug}    a season table
 *   /m/{id}      a finished match, series by series
 *   /c/{slug}    a club and its roster
 *
 * It reads with the **anon** key on purpose. This surface can therefore never
 * expose more than a signed-out visitor already sees in the app: the public
 * views, and nothing behind them.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
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

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': CACHE },
  });
}

function scoreText(value: number | null, mode: string): string {
  if (value === null || value === undefined) return '–';
  return mode === 'integer' ? String(Math.round(value)) : Number(value).toFixed(1);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const appUrl = Deno.env.get('PUBLIC_APP_URL') ?? undefined;

  if (!supabaseUrl || !anon) {
    return new Response('SUPABASE_URL and SUPABASE_ANON_KEY must be set', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, anon, { auth: { persistSession: false } });

  // Supabase serves functions under /functions/v1/<name>; strip that so the
  // routes read the same behind a custom domain.
  const path = url.pathname.replace(/^\/functions\/v1\/public-pages/, '') || '/';
  const base = `${url.origin}${url.pathname.startsWith('/functions') ? '/functions/v1/public-pages' : ''}`;
  const meta = (title: string, description: string, at: string) => ({
    title,
    description,
    url: `${base}${at}`,
    appUrl,
  });

  const notFound = () =>
    html(renderNotFound(meta('Not found — World Shooting League', 'Nothing at this address.', path)), 404);

  /** Display names for a set of shooters, resolved in one round trip. */
  async function names(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', [...new Set(ids)]);
    return new Map((data ?? []).map((r) => [r.id as string, r.display_name as string]));
  }

  try {
    // ------------------------------------------------------------- index ---
    if (path === '/' || path === '') {
      const [{ data: seasons }, { data: results }] = await Promise.all([
        supabase
          .from('season_summary')
          .select('*')
          .in('state', ['registration', 'running', 'finished'])
          .order('starts_at', { ascending: false })
          .limit(20),
        supabase
          .from('match_results')
          .select('*')
          .not('settled_at', 'is', null)
          .order('settled_at', { ascending: false })
          .limit(15),
      ]);

      const lookup = await names(
        (results ?? []).flatMap((r) => [r.shooter_a as string, r.shooter_b as string]),
      );

      const rows: ResultRow[] = (results ?? []).map((r) => ({
        match_id: r.match_id as string,
        discipline: r.discipline as string,
        points_a: r.points_a as number,
        points_b: r.points_b as number,
        name_a: lookup.get(r.shooter_a as string) ?? 'Shooter',
        name_b: lookup.get(r.shooter_b as string) ?? 'Shooter',
        winner_side: r.winner_id === r.shooter_a ? 'a' : r.winner_id === r.shooter_b ? 'b' : null,
        settled_at: r.settled_at as string,
      }));

      return html(
        renderIndex(
          meta(
            'World Shooting League',
            'An online league for sport shooters on electronic targets.',
            '/',
          ),
          (seasons ?? []) as unknown as SeasonRow[],
          rows,
        ),
      );
    }

    // ------------------------------------------------------------ season ---
    const season = path.match(/^\/s\/([a-z0-9-]+)$/);
    if (season) {
      const { data: s } = await supabase
        .from('season_summary')
        .select('*')
        .eq('slug', season[1])
        .maybeSingle();
      if (!s) return notFound();

      let rows: StandingRow[];
      if (s.competition_type === 'team') {
        const { data } = await supabase
          .from('club_standings')
          .select('*')
          .eq('season_id', s.id)
          .order('position');
        rows = (data ?? []).map((r) => ({
          position: r.position as number,
          name: r.club_name as string,
          detail: `${r.wins}/${r.draws}/${r.losses} · boards ${r.board_points_for}:${r.board_points_against}`,
          played: r.matches_played as number,
          points: r.table_points as number,
        }));
      } else {
        const { data } = await supabase
          .from('season_standings')
          .select('*')
          .eq('season_id', s.id)
          .order('position');
        rows = (data ?? []).map((r) => ({
          position: r.position as number,
          name: r.display_name as string,
          detail: [r.country_code, r.club_name].filter(Boolean).join(' · '),
          played: r.matches_played as number,
          points: r.points as number,
        }));
      }

      return html(
        renderSeason(
          meta(
            `${s.name} — World Shooting League`,
            `${s.discipline_name}, ${s.format_name}. Standings and results.`,
            `/s/${s.slug}`,
          ),
          s as unknown as SeasonRow,
          rows,
        ),
      );
    }

    // ------------------------------------------------------------- match ---
    const match = path.match(/^\/m\/([0-9a-f-]{36})$/i);
    if (match) {
      const { data: m } = await supabase
        .from('match_results')
        .select('*')
        .eq('match_id', match[1])
        .maybeSingle();
      if (!m) return notFound();

      const [{ data: card }, lookup] = await Promise.all([
        supabase.from('match_scorecard').select('*').eq('match_id', match[1]).order('bout'),
        names([m.shooter_a as string, m.shooter_b as string]),
      ]);

      // match_results carries the discipline code; decimal disciplines print a
      // fraction, whole-ring ones do not.
      const { data: discipline } = await supabase
        .from('disciplines')
        .select('scoring_mode')
        .eq('code', m.discipline)
        .maybeSingle();
      const mode = (discipline?.scoring_mode as string) ?? 'decimal';

      const header: ResultRow = {
        match_id: m.match_id as string,
        discipline: m.discipline as string,
        points_a: m.points_a as number,
        points_b: m.points_b as number,
        name_a: lookup.get(m.shooter_a as string) ?? 'Shooter',
        name_b: lookup.get(m.shooter_b as string) ?? 'Shooter',
        winner_side: m.winner_id === m.shooter_a ? 'a' : m.winner_id === m.shooter_b ? 'b' : null,
        settled_at: m.settled_at as string,
      };

      const rows: ScorecardRow[] = (card ?? []).map((r) => ({
        bout: r.bout as number,
        total_a: scoreText(r.total_a as number | null, mode),
        total_b: scoreText(r.total_b as number | null, mode),
        inner_a: (r.inner_tens_a as number | null) ?? null,
        inner_b: (r.inner_tens_b as number | null) ?? null,
        winner_side:
          r.winner_id === r.shooter_a ? 'a' : r.winner_id === r.shooter_b ? 'b' : null,
      }));

      return html(
        renderMatch(
          meta(
            `${header.name_a} v ${header.name_b} — World Shooting League`,
            `${header.points_a}:${header.points_b} in ${header.discipline}.`,
            `/m/${header.match_id}`,
          ),
          header,
          rows,
        ),
      );
    }

    // -------------------------------------------------------------- club ---
    const club = path.match(/^\/c\/([a-z0-9-]+)$/);
    if (club) {
      const { data: c } = await supabase
        .from('club_profile')
        .select('*')
        .eq('slug', club[1])
        .maybeSingle();
      if (!c) return notFound();

      const { data: roster } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('primary_club_id', c.id)
        .eq('is_public', true)
        .order('display_name');

      return html(
        renderClub(
          meta(
            `${c.name} — World Shooting League`,
            `${c.shooters} shooters, ${c.fixtures_played} fixtures.`,
            `/c/${c.slug}`,
          ),
          c as unknown as ClubRow,
          (roster ?? []).map((r) => r.display_name as string),
        ),
      );
    }

    return notFound();
  } catch (e) {
    console.error('public-pages failed', e);
    return new Response('Temporarily unavailable', { status: 503 });
  }
});
