/**
 * Sample league data for the screenshot run.
 *
 * The shapes here are the shapes the app reads — every key matches a column in
 * supabase/migrations or a field of the public views. Nothing is invented that
 * the database could not return, so a screenshot cannot show a screen the real
 * backend would never produce. Only the values are made up.
 */

const hours = (n) => new Date(Date.now() + n * 3_600_000).toISOString();
const daysAgo = (n, atHour = 19) => {
  const d = new Date(Date.now() - n * 86_400_000);
  d.setHours(atHour, (n * 7) % 60, 0, 0);
  return d.toISOString();
};

export const ME = '11111111-1111-4111-8111-111111111111';
const STEFAN = '22222222-2222-4222-8222-222222222222';
const MANUEL = '33333333-3333-4333-8333-333333333333';
const ALINA = '44444444-4444-4444-8444-444444444444';
const JONAS = '55555555-5555-4555-8555-555555555555';
const PAULA = '66666666-6666-4666-8666-666666666666';
const LARS = '77777777-7777-4777-8777-777777777777';

const AR = 'daaaaaaa-0001-4000-8000-000000000001';
const AP = 'daaaaaaa-0002-4000-8000-000000000002';
const SBR = 'daaaaaaa-0003-4000-8000-000000000003';

export const MATCH_LIVE = 'aaaa0001-0000-4000-8000-000000000001';
export const MATCH_BOARD = 'aaaa0002-0000-4000-8000-000000000002';
export const MATCH_DONE = 'aaaa0003-0000-4000-8000-000000000003';

/** Air rifle, series 4 of the running match — nothing reported yet. */
export const BOUT_TO_REPORT = 'bbbb0002-0000-4000-8000-000000000004';
/** Air pistol board, so the report screen shows the inner tens field. */
export const BOUT_PISTOL = 'bbbb0003-0000-4000-8000-000000000001';
/** Revealed: Stefan's result is visible and still unchecked. */
export const BOUT_TO_CONFIRM = 'bbbb0001-0000-4000-8000-000000000003';

/** The disputed series, on a match nobody else in these screenshots is in. */
export const CASE_BOUT = 'bbbb0005-0000-4000-8000-000000000001';
const CASE_MATCH = 'aaaa0009-0000-4000-8000-000000000009';

export const SEASON_SLUG = 'air-rifle-spring-2026';

const disciplines = {
  [AR]: {
    id: AR,
    code: 'AR10ET',
    name: 'Air Rifle 10 m',
    shot_count: 10,
    scoring_mode: 'decimal',
    max_shot_value: 10.9,
    requires_inner_tens: false,
  },
  [AP]: {
    id: AP,
    code: 'AP10ET',
    name: 'Air Pistol 10 m',
    shot_count: 10,
    scoring_mode: 'integer',
    max_shot_value: 10,
    requires_inner_tens: true,
  },
  [SBR]: {
    id: SBR,
    code: 'SBR10ET',
    name: 'Smallbore Rifle 50 m prone',
    shot_count: 10,
    scoring_mode: 'decimal',
    max_shot_value: 10.9,
    requires_inner_tens: false,
  },
};

const people = {
  [ME]: { id: ME, handle: 'tgehmann', display_name: 'Thomas Gehmann', country_code: 'DE' },
  [STEFAN]: { id: STEFAN, handle: 'sbraeuer', display_name: 'Stefan Bräuer', country_code: 'DE' },
  [MANUEL]: { id: MANUEL, handle: 'mfrei', display_name: 'Manuel Frei', country_code: 'CH' },
  [ALINA]: { id: ALINA, handle: 'aweber', display_name: 'Alina Weber', country_code: 'AT' },
  [JONAS]: { id: JONAS, handle: 'jkeller', display_name: 'Jonas Keller', country_code: 'DE' },
  [PAULA]: { id: PAULA, handle: 'pnovak', display_name: 'Paula Novák', country_code: 'CZ' },
  [LARS]: { id: LARS, handle: 'lmadsen', display_name: 'Lars Madsen', country_code: 'DK' },
};

const KARLSRUHE = {
  id: 'cccc0001-0000-4000-8000-000000000001',
  slug: 'sv-karlsruhe',
  name: 'SV Karlsruhe 1861',
  short_name: 'SVK',
  country_code: 'DE',
  city: 'Karlsruhe',
};

const ZURICH = {
  id: 'cccc0002-0000-4000-8000-000000000002',
  slug: 'sg-zuerich',
  name: 'SG Zürich Albisgütli',
  short_name: 'SGZ',
  country_code: 'CH',
  city: 'Zürich',
};

function bout(id, matchId, index, state, extra = {}) {
  return {
    id,
    match_id: matchId,
    index,
    state,
    opens_at: daysAgo(3),
    closes_at: hours(74),
    revealed_at: null,
    confirm_closes_at: null,
    winner_id: null,
    is_tie: false,
    ...extra,
  };
}

const liveBouts = [
  // Settled: both reported, both confirmed, the point is on the board.
  bout('bbbb0001-0000-4000-8000-000000000001', MATCH_LIVE, 1, 'settled', {
    revealed_at: daysAgo(3),
    winner_id: ME,
  }),
  // Reported by me, not yet by Stefan — this is the blind reveal on screen.
  bout('bbbb0001-0000-4000-8000-000000000002', MATCH_LIVE, 2, 'awaiting_opponent'),
  // Both in, Stefan's photo still unchecked.
  bout(BOUT_TO_CONFIRM, MATCH_LIVE, 3, 'settled', {
    revealed_at: daysAgo(1),
    winner_id: STEFAN,
    confirm_closes_at: hours(41),
  }),
  bout(BOUT_TO_REPORT, MATCH_LIVE, 4, 'open'),
  bout('bbbb0002-0000-4000-8000-000000000005', MATCH_LIVE, 5, 'open'),
];

const boardBouts = [bout(BOUT_PISTOL, MATCH_BOARD, 1, 'open', { closes_at: hours(50) })];

const doneBouts = [1, 2, 3, 4, 5].map((i) =>
  bout(`bbbb0004-0000-4000-8000-00000000000${i}`, MATCH_DONE, i, i <= 4 ? 'settled' : 'void', {
    revealed_at: daysAgo(9),
    winner_id: i === 5 ? null : i === 2 ? ALINA : ME,
    is_tie: false,
    closes_at: daysAgo(8),
  }),
);

const teamMatch = {
  id: 'tttt0001-0000-4000-8000-000000000001',
  season_id: 'ssss0002-0000-4000-8000-000000000002',
  round_id: 'rrrr0002-0000-4000-8000-000000000002',
  state: 'live',
  opens_at: daysAgo(2),
  closes_at: hours(50),
  points_a: 1.5,
  points_b: 1,
  winner_club_id: null,
  club_a: KARLSRUHE,
  club_b: ZURICH,
};

function match(id, opponent, disciplineId, state, extra = {}) {
  return {
    id,
    season_id: 'ssss0001-0000-4000-8000-000000000001',
    round_id: 'rrrr0001-0000-4000-8000-000000000001',
    team_match_id: null,
    board: null,
    discipline_id: disciplineId,
    format_id: 'ffff0001-0000-4000-8000-000000000001',
    shooter_a: ME,
    shooter_b: opponent,
    state,
    opens_at: daysAgo(3),
    closes_at: hours(74),
    points_a: 0,
    points_b: 0,
    winner_id: null,
    decided_by: null,
    settled_at: null,
    dispute_closes_at: null,
    finalized_at: null,
    discipline: disciplines[disciplineId],
    profile_a: people[ME],
    profile_b: people[opponent],
    team_match: null,
    ...extra,
  };
}

const matches = [
  match(MATCH_LIVE, STEFAN, AR, 'live', { points_a: 1, points_b: 1, bouts: liveBouts }),
  match(MATCH_BOARD, MANUEL, AP, 'live', {
    team_match_id: teamMatch.id,
    board: 2,
    season_id: teamMatch.season_id,
    round_id: teamMatch.round_id,
    closes_at: hours(50),
    team_match: teamMatch,
    bouts: boardBouts,
  }),
  match(MATCH_DONE, ALINA, AR, 'finalized', {
    points_a: 3,
    points_b: 1,
    winner_id: ME,
    decided_by: 'bouts',
    settled_at: daysAgo(8),
    dispute_closes_at: daysAgo(7),
    finalized_at: daysAgo(7),
    closes_at: daysAgo(8),
    bouts: doneBouts,
  }),
];

const submissions = [
  // Series 1, settled and open to both.
  {
    id: 'eeee0001-0000-4000-8000-000000000001',
    bout_id: liveBouts[0].id,
    shooter_id: ME,
    total: 103.7,
    inner_tens: null,
    adjusted_total: null,
    photo_path: `${liveBouts[0].id}/${ME}/target.jpg`,
    shot_at: daysAgo(3),
    submitted_at: daysAgo(3),
  },
  {
    id: 'eeee0001-0000-4000-8000-000000000002',
    bout_id: liveBouts[0].id,
    shooter_id: STEFAN,
    total: 101.2,
    inner_tens: null,
    adjusted_total: null,
    photo_path: `${liveBouts[0].id}/${STEFAN}/target.jpg`,
    shot_at: daysAgo(3),
    submitted_at: daysAgo(3),
  },
  // Series 2: mine only. RLS returns no row for Stefan until he submits — the
  // absence here is the blind reveal, not a filter in the client.
  {
    id: 'eeee0002-0000-4000-8000-000000000001',
    bout_id: liveBouts[1].id,
    shooter_id: ME,
    total: 102.9,
    inner_tens: null,
    adjusted_total: null,
    photo_path: `${liveBouts[1].id}/${ME}/target.jpg`,
    shot_at: daysAgo(1),
    submitted_at: daysAgo(1),
  },
  // Series 3: both in, Stefan's still unchecked.
  {
    id: 'eeee0003-0000-4000-8000-000000000001',
    bout_id: BOUT_TO_CONFIRM,
    shooter_id: ME,
    total: 100.8,
    inner_tens: null,
    adjusted_total: null,
    photo_path: `${BOUT_TO_CONFIRM}/${ME}/target.jpg`,
    shot_at: daysAgo(1),
    submitted_at: daysAgo(1),
  },
  {
    id: 'eeee0003-0000-4000-8000-000000000002',
    bout_id: BOUT_TO_CONFIRM,
    shooter_id: STEFAN,
    total: 104.4,
    inner_tens: null,
    adjusted_total: null,
    photo_path: `${BOUT_TO_CONFIRM}/${STEFAN}/target.jpg`,
    shot_at: daysAgo(1),
    submitted_at: daysAgo(1),
  },
];

const leaderboard = [
  [1, MANUEL, AR, 1712, 48, 41, 26, 12, 3, false],
  [2, ME, AR, 1684, 62, 24, 14, 8, 2, false],
  [3, ALINA, AR, 1651, 55, 33, 19, 11, 3, false],
  [4, STEFAN, AR, 1622, 71, 18, 10, 7, 1, false],
  [5, PAULA, AR, 1590, 96, 11, 6, 4, 1, false],
  [6, LARS, AR, 1548, 132, 7, 3, 3, 1, false],
  [7, JONAS, AR, 1502, 189, 4, 2, 2, 0, true],
].map(([position, id, disciplineId, rating, rd, played, wins, losses, draws, provisional]) => ({
  discipline_id: disciplineId,
  discipline: disciplines[disciplineId].code,
  shooter_id: id,
  handle: people[id].handle,
  display_name: people[id].display_name,
  country_code: people[id].country_code,
  rating,
  rd,
  matches_played: played,
  wins,
  losses,
  draws,
  is_provisional: provisional,
  position,
}));

const seasons = [
  {
    id: 'ssss0001-0000-4000-8000-000000000001',
    slug: SEASON_SLUG,
    name: 'Air Rifle Spring 2026',
    state: 'running',
    competition_type: 'individual',
    team_size: null,
    country_code: null,
    starts_at: daysAgo(24),
    ends_at: hours(24 * 30),
    round_count: 7,
    discipline_code: 'AR10ET',
    discipline_name: 'Air Rifle 10 m',
    format_code: 'best_of_five',
    format_name: 'Best of five, 10 shots each',
    shooters_entered: 148,
    clubs_entered: 0,
    rounds_paired: 3,
  },
  {
    id: teamMatch.season_id,
    slug: 'club-cup-2026',
    name: 'Club Cup 2026',
    state: 'running',
    competition_type: 'team',
    team_size: 4,
    country_code: null,
    starts_at: daysAgo(17),
    ends_at: hours(24 * 44),
    round_count: 5,
    discipline_code: 'AP10ET',
    discipline_name: 'Air Pistol 10 m',
    format_code: 'best_of_five',
    format_name: 'Best of five, 10 shots each',
    shooters_entered: 96,
    clubs_entered: 24,
    rounds_paired: 2,
  },
  {
    id: 'ssss0003-0000-4000-8000-000000000003',
    slug: 'air-pistol-winter-2025',
    name: 'Air Pistol Winter 2025',
    state: 'finished',
    competition_type: 'individual',
    team_size: null,
    country_code: null,
    starts_at: daysAgo(160),
    ends_at: daysAgo(30),
    round_count: 7,
    discipline_code: 'AP10ET',
    discipline_name: 'Air Pistol 10 m',
    format_code: 'single_10',
    format_name: 'Single series, 10 shots',
    shooters_entered: 112,
    clubs_entered: 0,
    rounds_paired: 7,
  },
];

const seasonStandings = [
  [1, MANUEL, 'SG Zürich Albisgütli', 3, 3, 0, 0, 3],
  [2, ME, 'SV Karlsruhe 1861', 3, 2, 1, 0, 2.5],
  [3, ALINA, 'HSV Innsbruck', 3, 2, 0, 1, 2],
  [4, STEFAN, 'SV Karlsruhe 1861', 3, 1, 1, 1, 1.5],
  [5, PAULA, 'SSK Brno', 3, 1, 0, 2, 1],
  [6, LARS, 'Aarhus SK', 3, 0, 1, 2, 0.5],
  [7, JONAS, null, 2, 0, 0, 2, 0],
].map(([position, id, club, played, wins, draws, losses, points]) => ({
  season_id: seasons[0].id,
  shooter_id: id,
  handle: people[id].handle,
  display_name: people[id].display_name,
  country_code: people[id].country_code,
  club_name: club,
  matches_played: played,
  wins,
  draws,
  losses,
  points,
  position,
}));

const results = [
  [MATCH_DONE, ME, ALINA, 3, 1, ME, 'bouts', 8],
  ['aaaa0004-0000-4000-8000-000000000004', MANUEL, STEFAN, 3, 0, MANUEL, 'bouts', 9],
  ['aaaa0005-0000-4000-8000-000000000005', PAULA, LARS, 2.5, 2.5, null, 'tiebreak', 10],
  ['aaaa0006-0000-4000-8000-000000000006', JONAS, MANUEL, 1, 3, MANUEL, 'bouts', 11],
  ['aaaa0007-0000-4000-8000-000000000007', ALINA, PAULA, 3, 2, ALINA, 'bouts', 12],
  ['aaaa0008-0000-4000-8000-000000000008', STEFAN, JONAS, 3, 0, STEFAN, 'forfeit', 13],
].map(([id, a, b, pa, pb, winner, decided, ago]) => ({
  match_id: id,
  season_id: seasons[0].id,
  discipline: 'AR10ET',
  format: 'best_of_five',
  shooter_a: a,
  shooter_b: b,
  points_a: pa,
  points_b: pb,
  winner_id: winner,
  decided_by: decided,
  settled_at: daysAgo(ago),
}));

/** The finished match a spectator can open: four series, one dropped. */
const scorecard = [
  { bout: 1, total_a: 104.1, total_b: 101.6, winner_id: ME },
  { bout: 2, total_a: 99.8, total_b: 103.2, winner_id: ALINA },
  { bout: 3, total_a: 103.5, total_b: 102.7, winner_id: ME },
  { bout: 4, total_a: 105.2, total_b: 100.9, winner_id: ME },
].map((row) => ({
  match_id: MATCH_DONE,
  bout: row.bout,
  bout_state: 'settled',
  is_tie: false,
  winner_id: row.winner_id,
  shooter_a: ME,
  shooter_b: ALINA,
  total_a: row.total_a,
  inner_tens_a: null,
  total_b: row.total_b,
  inner_tens_b: null,
}));

/**
 * A report shot in a basement range and saved on the phone. Written into the
 * same AsyncStorage key lib/outbox.ts uses, so the banner that renders from it
 * is the real one.
 */
export const outboxEntry = [
  {
    id: `${BOUT_TO_REPORT}-queued`,
    boutId: BOUT_TO_REPORT,
    matchId: MATCH_LIVE,
    shooterId: ME,
    total: 101.4,
    innerTens: null,
    photoUri: 'file:///outbox/queued.jpg',
    fromCamera: true,
    shotAt: new Date(Date.now() - 2_400_000).toISOString(),
    queuedAt: new Date(Date.now() - 2_340_000).toISOString(),
    attempts: 3,
    state: 'pending',
  },
];

/**
 * The referee's queue. Two cases: one plausible, one that reads like a typo —
 * which is what most of them will be.
 */
export const DISPUTE = 'dddd0001-0000-4000-8000-000000000001';

const disputes = [
  {
    dispute_id: DISPUTE,
    state: 'open',
    reason:
      'Reported 94 with 11 inner tens. There are ten shots in a series, so eleven of them '
      + 'cannot be inner tens — and the display in the photo says four.',
    created_at: new Date(Date.now() - 19 * 3_600_000).toISOString(),
    referee_id: null,
    assigned_at: null,
    outcome: null,
    resolution_note: null,
    resolved_at: null,
    bout_id: CASE_BOUT,
    bout_index: 1,
    bout_state: 'disputed',
    match_id: CASE_MATCH,
    match_state: 'awaiting_review',
    shooter_a: MANUEL,
    shooter_b: JONAS,
    shooter_a_name: 'Manuel Frei',
    shooter_b_name: 'Jonas Keller',
    raised_by: MANUEL,
    raised_by_name: 'Manuel Frei',
    discipline_code: 'AP10ET',
    discipline_name: 'Air Pistol 10 m',
    scoring_mode: 'integer',
    requires_inner_tens: true,
    waiting_hours: 19,
  },
  {
    dispute_id: 'dddd0002-0000-4000-8000-000000000002',
    state: 'assigned',
    reason:
      'The photo is of a different lane. The number on it does not belong to my opponent\u2019s '
      + 'series at all.',
    created_at: new Date(Date.now() - 50 * 3_600_000).toISOString(),
    referee_id: null,
    assigned_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    outcome: null,
    resolution_note: null,
    resolved_at: null,
    bout_id: BOUT_PISTOL,
    bout_index: 2,
    bout_state: 'disputed',
    match_id: MATCH_BOARD,
    match_state: 'awaiting_review',
    shooter_a: PAULA,
    shooter_b: LARS,
    shooter_a_name: 'Paula Nov\u00e1k',
    shooter_b_name: 'Lars Madsen',
    raised_by: LARS,
    raised_by_name: 'Lars Madsen',
    discipline_code: 'SBR10ET',
    discipline_name: 'Smallbore Rifle 50 m prone',
    scoring_mode: 'decimal',
    requires_inner_tens: false,
    waiting_hours: 50,
  },
];

/** The two reports the open case is about. */
const caseSubmissions = [
  {
    id: 'eeee0009-0000-4000-8000-000000000001',
    bout_id: CASE_BOUT,
    shooter_id: MANUEL,
    total: 92,
    inner_tens: 3,
    adjusted_total: null,
    adjusted_inner_tens: null,
    photo_path: `${CASE_BOUT}/${MANUEL}/target.jpg`,
    shot_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    submitted_at: new Date(Date.now() - 25 * 3_600_000).toISOString(),
  },
  {
    id: 'eeee0009-0000-4000-8000-000000000002',
    bout_id: CASE_BOUT,
    shooter_id: JONAS,
    total: 94,
    inner_tens: 11,
    adjusted_total: null,
    adjusted_inner_tens: null,
    photo_path: `${CASE_BOUT}/${JONAS}/target.jpg`,
    shot_at: new Date(Date.now() - 22 * 3_600_000).toISOString(),
    submitted_at: new Date(Date.now() - 21 * 3_600_000).toISOString(),
  },
];

/** Series 1 has been checked; series 3 is what the app still asks about. */
const confirmations = [{ submission_id: 'eeee0001-0000-4000-8000-000000000002' }];

export const fixtures = {
  people,
  /** One row per club the viewer belongs to, as my_club_season_entries() returns. */
  clubSeasonEntries: [
    {
      club_id: KARLSRUHE.id,
      club_name: KARLSRUHE.name,
      short_name: KARLSRUHE.short_name,
      is_official: true,
      entered: false,
      eligible: 6,
      team_size: 4,
      clubs_entered: 24,
    },
  ],
  confirmations,
  disputes,
  caseSubmissions,
  JONAS,
  MANUEL,
  disciplines: Object.values(disciplines),
  matches,
  submissions,
  leaderboard,
  seasons,
  seasonStandings,
  results,
  scorecard,
  clubs: [KARLSRUHE, ZURICH],
  profile: {
    ...people[ME],
    bio: null,
    equipment: {},
    role: 'shooter',
    primary_club_id: KARLSRUHE.id,
    notify_push: true,
    club: KARLSRUHE,
  },
  clubMembers: [{ club_id: KARLSRUHE.id, role: 'member', club: KARLSRUHE }],
  ratings: [
    {
      discipline_id: AR,
      rating: 1684.2,
      rd: 62.4,
      matches_played: 24,
      wins: 14,
      losses: 8,
      draws: 2,
      disciplines: { code: 'AR10ET' },
    },
    {
      discipline_id: AP,
      rating: 1523.6,
      rd: 176.1,
      matches_played: 3,
      wins: 1,
      losses: 2,
      draws: 0,
      disciplines: { code: 'AP10ET' },
    },
  ],
  reliability: [{ confirmations_due: 18, confirmations_given: 17, confirmation_rate_pct: 94 }],
  /** Backs the "well above your average" check on the report screen. */
  recentForm: [{ series: 10, average: 92.4, best: 97, worst: 88 }],
  clubProfile: {
    ...KARLSRUHE,
    shooters: 34,
    fixtures_played: 6,
    fixtures_won: 4,
  },
};
