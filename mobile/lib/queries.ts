import { supabase, TARGET_PHOTOS_BUCKET } from './supabase';
import type {
  Bout,
  Club,
  ClubMembership,
  ClubStanding,
  Discipline,
  DisputeCase,
  DisputeOutcome,
  LeaderboardRow,
  Match,
  Profile,
  Rating,
  RecentForm,
  Reliability,
  ClubProfile,
  PublicMatchResult,
  ScorecardRow,
  SeasonStanding,
  SeasonSummary,
  Submission,
  TeamMatch,
} from './types';

/**
 * Every read here goes through RLS. In particular the opponent's submission
 * simply is not in the result set until the bout is revealed — there is no
 * client-side filtering to get wrong.
 */

const CLUB_FIELDS = 'id, slug, name, short_name, country_code, city';

const MATCH_SELECT = `
  *,
  discipline:disciplines(id, code, name, shot_count, scoring_mode, max_shot_value, requires_inner_tens),
  bouts(*),
  profile_a:profiles!matches_shooter_a_fkey(id, handle, display_name, country_code),
  profile_b:profiles!matches_shooter_b_fkey(id, handle, display_name, country_code),
  team_match:team_matches(
    id, season_id, round_id, state, opens_at, closes_at, points_a, points_b, winner_club_id,
    club_a:clubs!team_matches_club_a_fkey(${CLUB_FIELDS}),
    club_b:clubs!team_matches_club_b_fkey(${CLUB_FIELDS})
  )
`;

type ProfileStub = Pick<Profile, 'id' | 'handle' | 'display_name' | 'country_code'>;

export interface MatchDetail extends Match {
  discipline: Discipline;
  bouts: Bout[];
  profile_a: ProfileStub;
  profile_b: ProfileStub;
  /** Present when this match is one board of a club fixture. */
  team_match: TeamMatch | null;
}

function orderBouts(match: MatchDetail): MatchDetail {
  return { ...match, bouts: [...match.bouts].sort((x, y) => x.index - y.index) };
}

export async function fetchMyMatches(userId: string): Promise<MatchDetail[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .or(`shooter_a.eq.${userId},shooter_b.eq.${userId}`)
    .in('state', ['scheduled', 'live', 'awaiting_review', 'settled', 'finalized'])
    .order('closes_at', { ascending: true })
    .returns<MatchDetail[]>();

  if (error) throw error;
  return (data ?? []).map(orderBouts);
}

export async function fetchMatch(matchId: string): Promise<MatchDetail> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('id', matchId)
    .single<MatchDetail>();

  if (error) throw error;
  return orderBouts(data);
}

export async function fetchBoutDetail(
  boutId: string,
): Promise<{ bout: Bout; match: MatchDetail }> {
  const { data, error } = await supabase
    .from('bouts')
    .select('*')
    .eq('id', boutId)
    .single<Bout>();

  if (error) throw error;
  return { bout: data, match: await fetchMatch(data.match_id) };
}

export async function fetchBoutSubmissions(boutIds: string[]): Promise<Submission[]> {
  if (boutIds.length === 0) return [];

  const { data, error } = await supabase
    .from('submissions')
    .select(
      'id, bout_id, shooter_id, total, inner_tens, adjusted_total, adjusted_inner_tens, ' +
        'photo_path, shot_at, submitted_at',
    )
    .in('bout_id', boutIds)
    .returns<Submission[]>();

  if (error) throw error;
  return data ?? [];
}

export async function fetchConfirmedSubmissionIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('bout_confirmations')
    .select('submission_id')
    .eq('confirmed_by', userId)
    .returns<{ submission_id: string }[]>();

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.submission_id));
}

export async function fetchLeaderboard(disciplineCode?: string): Promise<LeaderboardRow[]> {
  let query = supabase
    .from('leaderboard')
    .select('*')
    .order('position', { ascending: true })
    .limit(100);

  if (disciplineCode) query = query.eq('discipline', disciplineCode);

  const { data, error } = await query.returns<LeaderboardRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function fetchDisciplines(): Promise<Discipline[]> {
  const { data, error } = await supabase
    .from('disciplines')
    .select('id, code, name, shot_count, scoring_mode, max_shot_value, requires_inner_tens')
    .eq('is_active', true)
    .order('code')
    .returns<Discipline[]>();

  if (error) throw error;
  return data ?? [];
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      `id, handle, display_name, country_code, bio, equipment, role, primary_club_id,
       notify_push, notify_email, club:clubs(${CLUB_FIELDS})`,
    )
    .eq('id', userId)
    .single<Profile>();

  if (error) throw error;
  return data;
}

export async function fetchRatings(userId: string): Promise<(Rating & { code: string })[]> {
  const { data, error } = await supabase
    .from('ratings')
    .select('discipline_id, rating, rd, matches_played, wins, losses, draws, disciplines(code)')
    .eq('shooter_id', userId)
    .returns<(Rating & { disciplines: { code: string } })[]>();

  if (error) throw error;
  return (data ?? []).map(({ disciplines, ...rest }) => ({ ...rest, code: disciplines.code }));
}

export async function fetchReliability(userId: string): Promise<Reliability | null> {
  const { data, error } = await supabase
    .from('shooter_reliability')
    .select('confirmations_due, confirmations_given, confirmation_rate_pct')
    .eq('shooter_id', userId)
    .maybeSingle<Reliability>();

  if (error) throw error;
  return data;
}

/** Backs the "that is well above your average" warning before submitting. */
export async function fetchRecentForm(
  shooterId: string,
  disciplineId: string,
): Promise<RecentForm | null> {
  // shooter_recent_form() is a set-returning function; without generated types
  // supabase-js cannot infer the row shape, so it is asserted here.
  const { data, error } = await supabase.rpc('shooter_recent_form', {
    p_shooter: shooterId,
    p_discipline: disciplineId,
    p_limit: 10,
  });

  if (error) throw error;
  const rows = (data ?? []) as unknown as RecentForm[];
  return rows[0] ?? null;
}

export async function createSignedPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(TARGET_PHOTOS_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) return null;
  return data.signedUrl;
}

export async function confirmSubmission(
  submissionId: string,
  userId: string,
  accepted: boolean,
  note?: string,
): Promise<void> {
  const { error } = await supabase.from('bout_confirmations').insert({
    submission_id: submissionId,
    confirmed_by: userId,
    accepted,
    note: note ?? null,
  });

  if (error) throw error;
}

export async function raiseDispute(
  boutId: string,
  matchId: string,
  userId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.from('disputes').insert({
    bout_id: boutId,
    match_id: matchId,
    raised_by: userId,
    reason,
  });

  if (error) throw error;
}

// --------------------------------------------------------------- clubs -----

export async function fetchMyClubs(userId: string): Promise<ClubMembership[]> {
  const { data, error } = await supabase
    .from('club_members')
    .select(`club_id, role, club:clubs(${CLUB_FIELDS})`)
    .eq('shooter_id', userId)
    .returns<ClubMembership[]>();

  if (error) throw error;
  return data ?? [];
}

export interface ClubInvite {
  code: string;
  expires_at: string;
  max_uses: number | null;
  uses: number;
}

/**
 * Minting a code is a function, not an insert: it has to be unique, and a code
 * somebody picks is a code somebody can guess. It is the only thing between a
 * stranger and a club's roster.
 */
export async function createClubInvite(
  clubId: string,
  days = 14,
  maxUses?: number,
): Promise<ClubInvite> {
  const { data, error } = await supabase.rpc('create_club_invite', {
    p_club_id: clubId,
    p_days: days,
    p_max_uses: maxUses ?? null,
  });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ClubInvite[];
  return { ...rows[0], uses: 0 };
}

export async function fetchClubInvites(clubId: string): Promise<ClubInvite[]> {
  const { data, error } = await supabase.rpc('club_invites_active', { p_club_id: clubId });
  if (error) throw error;
  return (data ?? []) as unknown as ClubInvite[];
}

export async function revokeClubInvite(code: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_club_invite', { p_code: code });
  if (error) throw error;
}

export async function fetchClub(clubId: string): Promise<Club> {
  const { data, error } = await supabase
    .from('clubs')
    .select(CLUB_FIELDS)
    .eq('id', clubId)
    .single<Club>();

  if (error) throw error;
  return data;
}

export async function fetchClubRoster(clubId: string) {
  const { data, error } = await supabase
    .from('club_members')
    .select('role, shooter:profiles!club_members_shooter_id_fkey(id, display_name, country_code)')
    .eq('club_id', clubId)
    .returns<{ role: string; shooter: { id: string; display_name: string; country_code: string } }[]>();

  if (error) throw error;
  return data ?? [];
}

/** Joining is server-side: the code has to be checked before membership exists. */
export async function redeemClubInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_club_invite', { p_code: code.toUpperCase() });
  if (error) throw error;
  return data as unknown as string;
}

export async function createClub(input: {
  name: string;
  slug: string;
  countryCode: string;
  shortName?: string;
  city?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_club', {
    p_name: input.name,
    p_slug: input.slug,
    p_country_code: input.countryCode,
    p_short_name: input.shortName ?? null,
    p_city: input.city ?? null,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function setPrimaryClub(userId: string, clubId: string | null): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ primary_club_id: clubId })
    .eq('id', userId);
  if (error) throw error;
}

export interface ProfileEdit {
  display_name: string;
  handle: string;
  country_code: string;
  bio: string | null;
  primary_club_id: string | null;
}

/**
 * One update for the whole form. The handle is unique and the club has to be
 * one the shooter belongs to; both are refused by the database rather than by
 * the client, so this surfaces what it says.
 */
export async function updateProfile(userId: string, edit: ProfileEdit): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: edit.display_name.trim(),
      handle: edit.handle.trim().toLowerCase(),
      country_code: edit.country_code.trim().toUpperCase(),
      bio: edit.bio?.trim() || null,
      primary_club_id: edit.primary_club_id,
    })
    .eq('id', userId);

  if (error) throw error;
}

/** Turns what Postgres says into what a shooter can act on. */
export function describeProfileError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';

  if (code === '23505') return 'That handle is taken. Try another.';
  if (message.includes('profiles_handle_check')) {
    return 'A handle is 3–24 characters: lower case, digits and _.';
  }
  if (message.includes('profiles_display_name_check')) {
    return 'A display name is between 2 and 40 characters.';
  }
  if (message.includes('country_code')) return 'A country is two letters, like DE.';
  if (message.includes('club you belong to')) return 'You can only shoot for a club you belong to.';

  return message || 'The profile could not be saved.';
}

// ----------------------------------------------------------- team league ---

export async function fetchTeamMatches(clubId: string): Promise<TeamMatch[]> {
  const { data, error } = await supabase
    .from('team_matches')
    .select(
      `id, season_id, round_id, state, opens_at, closes_at, points_a, points_b, winner_club_id,
       club_a:clubs!team_matches_club_a_fkey(${CLUB_FIELDS}),
       club_b:clubs!team_matches_club_b_fkey(${CLUB_FIELDS})`,
    )
    .or(`club_a.eq.${clubId},club_b.eq.${clubId}`)
    .order('closes_at', { ascending: false })
    .returns<TeamMatch[]>();

  if (error) throw error;
  return data ?? [];
}

export async function fetchClubStandings(seasonId: string): Promise<ClubStanding[]> {
  const { data, error } = await supabase
    .from('club_standings')
    .select('*')
    .eq('season_id', seasonId)
    .order('position', { ascending: true })
    .returns<ClubStanding[]>();

  if (error) throw error;
  return data ?? [];
}

// -------------------------------------------------------- notifications ----

export async function setPushEnabled(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ notify_push: enabled })
    .eq('id', userId);
  if (error) throw error;
}

export async function setEmailEnabled(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ notify_email: enabled })
    .eq('id', userId);
  if (error) throw error;
}

// -------------------------------------------------------------- account ----

/** Everything the service holds about the signed-in shooter, as one object. */
export async function exportMyData(): Promise<unknown> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw error;
  return data;
}

/**
 * Deletion, as far as it goes: the name, handle, date of birth and profile go
 * at once; results stay because they are the opponent's record too. The auth
 * row and the photographs are queued for an operator.
 */
export async function requestAccountDeletion(reason?: string): Promise<void> {
  const { error } = await supabase.rpc('request_account_deletion', {
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

// ------------------------------------------------------------- referee ------
// The queue view runs with the caller's rights, so this returns every open case
// to a referee and only their own to a shooter. The photos come with it: the
// storage policy opens a bout's folder to a referee exactly while a case on it
// is open, and closes it again when the case is decided.

export async function fetchDisputeQueue(includeClosed = false): Promise<DisputeCase[]> {
  let query = supabase.from('dispute_queue').select('*').order('created_at', { ascending: true });
  if (!includeClosed) query = query.in('state', ['open', 'assigned']);

  const { data, error } = await query.returns<DisputeCase[]>();
  if (error) throw error;
  return data ?? [];
}

export async function fetchDisputeCase(disputeId: string): Promise<DisputeCase> {
  const { data, error } = await supabase
    .from('dispute_queue')
    .select('*')
    .eq('dispute_id', disputeId)
    .single<DisputeCase>();

  if (error) throw error;
  return data;
}

/** Taking a case, so two referees do not work the same one. */
export async function claimDispute(disputeId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_dispute', { p_dispute_id: disputeId });
  if (error) throw error;
}

export interface Decision {
  disputeId: string;
  outcome: DisputeOutcome;
  /** Read by both shooters, so it has to say why. */
  note: string;
  /** 'corrected': whose row, and what the photo actually shows. */
  submissionId?: string;
  total?: number;
  innerTens?: number | null;
  /** 'forfeited': who keeps the series. */
  winnerId?: string;
}

export async function decideDispute(d: Decision): Promise<void> {
  const { error } = await supabase.rpc('decide_dispute', {
    p_dispute_id: d.disputeId,
    p_outcome: d.outcome,
    p_note: d.note,
    p_submission_id: d.submissionId ?? null,
    p_total: d.total ?? null,
    p_inner_tens: d.innerTens ?? null,
    p_winner_id: d.winnerId ?? null,
  });
  if (error) throw error;
}

// ----------------------------------------------------------- spectator ------
// Everything below reads views that a signed-out visitor may query. The tables
// underneath stay closed — see supabase/migrations/..._public_views.sql.

export async function fetchSeasons(): Promise<SeasonSummary[]> {
  const { data, error } = await supabase
    .from('season_summary')
    .select('*')
    .in('state', ['registration', 'running', 'finished'])
    .order('starts_at', { ascending: false })
    .returns<SeasonSummary[]>();

  if (error) throw error;
  return data ?? [];
}

export async function fetchSeasonBySlug(slug: string): Promise<SeasonSummary> {
  const { data, error } = await supabase
    .from('season_summary')
    .select('*')
    .eq('slug', slug)
    .single<SeasonSummary>();

  if (error) throw error;
  return data;
}

/**
 * Joining and leaving. Both go through a function rather than an insert: the
 * seed rating has to be read server-side, and joining a season that is already
 * running is deliberately allowed, which the insert policy does not cover.
 */
export async function joinSeason(slug: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_season', { p_slug: slug });
  if (error) throw error;
  return data as unknown as string;
}

export async function leaveSeason(slug: string): Promise<void> {
  const { error } = await supabase.rpc('leave_season', { p_slug: slug });
  if (error) throw error;
}

export interface SeasonEntry {
  joined: boolean;
  joined_at: string | null;
  entrants: number;
}

export async function fetchMySeasonEntry(slug: string): Promise<SeasonEntry> {
  const { data, error } = await supabase.rpc('my_season_entry', { p_slug: slug });
  if (error) throw error;
  const rows = (data ?? []) as unknown as SeasonEntry[];
  return rows[0] ?? { joined: false, joined_at: null, entrants: 0 };
}

// A club is entered by an official, not by its members one at a time. The
// helper returns one row per club the shooter belongs to, so the season page
// can show a button instead of guessing.
export interface ClubSeasonEntry {
  club_id: string;
  club_name: string;
  short_name: string | null;
  is_official: boolean;
  entered: boolean;
  /** Members who compete for this club, i.e. who could be fielded. */
  eligible: number;
  team_size: number | null;
  clubs_entered: number;
}

export async function fetchMyClubSeasonEntries(slug: string): Promise<ClubSeasonEntry[]> {
  const { data, error } = await supabase.rpc('my_club_season_entries', { p_slug: slug });
  if (error) throw error;
  return (data ?? []) as unknown as ClubSeasonEntry[];
}

export async function enterClubInSeason(slug: string, clubId: string): Promise<void> {
  const { error } = await supabase.rpc('enter_club_in_season', {
    p_slug: slug,
    p_club_id: clubId,
  });
  if (error) throw error;
}

export async function withdrawClubFromSeason(slug: string, clubId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_club_from_season', {
    p_slug: slug,
    p_club_id: clubId,
  });
  if (error) throw error;
}

export async function fetchSeasonStandings(seasonId: string): Promise<SeasonStanding[]> {
  const { data, error } = await supabase
    .from('season_standings')
    .select('*')
    .eq('season_id', seasonId)
    .order('position', { ascending: true })
    .returns<SeasonStanding[]>();

  if (error) throw error;
  return data ?? [];
}

export async function fetchClubBySlug(slug: string): Promise<ClubProfile> {
  const { data, error } = await supabase
    .from('club_profile')
    .select('*')
    .eq('slug', slug)
    .single<ClubProfile>();

  if (error) throw error;
  return data;
}

export async function fetchScorecard(matchId: string): Promise<ScorecardRow[]> {
  const { data, error } = await supabase
    .from('match_scorecard')
    .select('*')
    .eq('match_id', matchId)
    .order('bout', { ascending: true })
    .returns<ScorecardRow[]>();

  if (error) throw error;
  return data ?? [];
}

export async function fetchRecentResults(limit = 20): Promise<PublicMatchResult[]> {
  const { data, error } = await supabase
    .from('match_results')
    .select('*')
    .not('settled_at', 'is', null)
    .order('settled_at', { ascending: false })
    .limit(limit)
    .returns<PublicMatchResult[]>();

  if (error) throw error;
  return data ?? [];
}

/** Display names for a set of shooters, for screens that only have their ids. */
export async function fetchShooterNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', [...new Set(ids)])
    .returns<{ id: string; display_name: string }[]>();

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.display_name]));
}
