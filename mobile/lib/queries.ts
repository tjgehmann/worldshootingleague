import { decode } from 'base64-arraybuffer';

import { supabase, TARGET_PHOTOS_BUCKET, targetPhotoPath } from './supabase';
import type {
  Bout,
  Club,
  ClubMembership,
  ClubStanding,
  Discipline,
  LeaderboardRow,
  Match,
  Profile,
  Rating,
  RecentForm,
  Reliability,
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
      'id, bout_id, shooter_id, total, inner_tens, adjusted_total, photo_path, shot_at, submitted_at',
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
       notify_push, club:clubs(${CLUB_FIELDS})`,
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

export interface SubmitResultInput {
  boutId: string;
  shooterId: string;
  total: number;
  /** Omitted for disciplines scored in tenths. */
  innerTens: number | null;
  photoBase64: string;
  fromCamera: boolean;
}

/**
 * Upload first, then insert. Both go through the same can_submit_to_bout()
 * check, so a closed bout fails on the upload before a row is written. An
 * orphaned photo is harmless; a row pointing at a missing photo would not be.
 */
export async function submitResult(input: SubmitResultInput): Promise<void> {
  const path = targetPhotoPath(input.boutId, input.shooterId);

  const { error: uploadError } = await supabase.storage
    .from(TARGET_PHOTOS_BUCKET)
    .upload(path, decode(input.photoBase64), {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { error } = await supabase.from('submissions').insert({
    bout_id: input.boutId,
    shooter_id: input.shooterId,
    total: input.total,
    inner_tens: input.innerTens,
    photo_path: path,
    capture_method: input.fromCamera ? 'in_app_camera' : 'gallery',
    source: 'manual',
    shot_at: new Date().toISOString(),
  });

  if (error) throw error;
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
