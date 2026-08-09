/**
 * Row shapes for the tables and views this client reads. Hand-written to match
 * supabase/migrations; regenerate with `supabase gen types typescript` once a
 * project is linked.
 *
 * Only the columns the app actually uses are listed.
 */

export type BoutState =
  | 'pending'
  | 'open'
  | 'awaiting_opponent'
  | 'revealed'
  | 'settled'
  | 'disputed'
  | 'forfeited'
  | 'void';

export type MatchState =
  | 'scheduled'
  | 'live'
  | 'awaiting_review'
  | 'settled'
  | 'finalized'
  | 'void';

export type ScoringMode = 'decimal' | 'integer';

export interface Profile {
  id: string;
  handle: string;
  display_name: string;
  country_code: string;
  bio: string | null;
  equipment: Record<string, string>;
  role: 'shooter' | 'referee' | 'admin';
  primary_club_id: string | null;
  notify_push: boolean;
  notify_email: boolean;
  club: Club | null;
}

export interface Club {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  country_code: string;
  city: string | null;
}

export type ClubRole = 'member' | 'official' | 'owner';

export interface ClubMembership {
  club_id: string;
  role: ClubRole;
  club: Club;
}

/** A club-vs-club fixture. Its boards are ordinary matches. */
export interface TeamMatch {
  id: string;
  season_id: string;
  round_id: string;
  state: MatchState;
  opens_at: string;
  closes_at: string;
  points_a: number;
  points_b: number;
  winner_club_id: string | null;
  club_a: Club;
  club_b: Club;
}

export interface ClubStanding {
  season_id: string;
  club_id: string;
  club_name: string;
  short_name: string | null;
  country_code: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  board_points_for: number;
  board_points_against: number;
  table_points: number;
  position: number;
}

export interface Discipline {
  id: string;
  code: string;
  name: string;
  shot_count: number;
  scoring_mode: ScoringMode;
  max_shot_value: number;
  /** Whether the shooter must report inner tens. Set for full-ring scoring. */
  requires_inner_tens: boolean;
}

export interface Bout {
  id: string;
  match_id: string;
  index: number;
  state: BoutState;
  opens_at: string;
  closes_at: string;
  revealed_at: string | null;
  confirm_closes_at: string | null;
  winner_id: string | null;
  is_tie: boolean;
}

export interface Submission {
  id: string;
  bout_id: string;
  shooter_id: string;
  total: number;
  /** ISSF tiebreak for full-ring scores; null where scoring is decimal. */
  inner_tens: number | null;
  adjusted_total: number | null;
  /** Set when a referee corrected the inner ten count. */
  adjusted_inner_tens: number | null;
  photo_path: string | null;
  shot_at: string;
  submitted_at: string;
}

export interface Match {
  id: string;
  season_id: string | null;
  round_id: string | null;
  /** Set when this match is one board of a club fixture. */
  team_match_id: string | null;
  board: number | null;
  discipline_id: string;
  format_id: string;
  shooter_a: string;
  shooter_b: string;
  state: MatchState;
  opens_at: string;
  closes_at: string;
  points_a: number;
  points_b: number;
  winner_id: string | null;
  decided_by: string | null;
  settled_at: string | null;
  dispute_closes_at: string | null;
  finalized_at: string | null;
}

/** matches joined with the bits the list and detail screens need. */
export interface MatchWithContext extends Match {
  discipline: Pick<Discipline, 'code' | 'name' | 'shot_count' | 'scoring_mode' | 'max_shot_value'>;
  bouts: Bout[];
}

export interface LeaderboardRow {
  discipline_id: string;
  discipline: string;
  shooter_id: string;
  handle: string;
  display_name: string;
  country_code: string;
  rating: number;
  rd: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  is_provisional: boolean;
  position: number;
}

export interface Rating {
  discipline_id: string;
  rating: number;
  rd: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface RecentForm {
  series: number;
  average: number | null;
  best: number | null;
  worst: number | null;
}

export interface Reliability {
  confirmations_due: number;
  confirmations_given: number;
  confirmation_rate_pct: number | null;
}

// --------------------------------------------------------------- referee ---

export type DisputeState = 'open' | 'assigned' | 'resolved' | 'withdrawn';

/**
 * The four endings a case can have. Anything beyond these is a sanction on a
 * person rather than a decision on one series, and has no home yet.
 */
export type DisputeOutcome = 'unchanged' | 'corrected' | 'forfeited' | 'voided';

/** One row of public.dispute_queue. */
export interface DisputeCase {
  dispute_id: string;
  state: DisputeState;
  reason: string;
  created_at: string;
  referee_id: string | null;
  assigned_at: string | null;
  outcome: DisputeOutcome | null;
  resolution_note: string | null;
  resolved_at: string | null;
  bout_id: string;
  bout_index: number;
  bout_state: BoutState;
  match_id: string;
  match_state: MatchState;
  shooter_a: string;
  shooter_b: string;
  shooter_a_name: string;
  shooter_b_name: string;
  raised_by: string;
  raised_by_name: string;
  discipline_code: string;
  discipline_name: string;
  scoring_mode: ScoringMode;
  requires_inner_tens: boolean;
  waiting_hours: number;
}

// -------------------------------------------------- public spectator views --

export interface SeasonSummary {
  id: string;
  slug: string;
  name: string;
  state: SeasonState;
  competition_type: 'individual' | 'team';
  team_size: number | null;
  country_code: string | null;
  starts_at: string;
  ends_at: string;
  round_count: number;
  discipline_code: string;
  discipline_name: string;
  format_code: string;
  format_name: string;
  shooters_entered: number;
  clubs_entered: number;
  rounds_paired: number;
}

export type SeasonState = 'registration' | 'running' | 'finished' | 'archived';

export interface SeasonStanding {
  season_id: string;
  shooter_id: string;
  handle: string;
  display_name: string;
  country_code: string;
  club_name: string | null;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  position: number;
}

export interface ClubProfile {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  country_code: string;
  city: string | null;
  shooters: number;
  fixtures_played: number;
  fixtures_won: number;
}

/** One line of a finished match, visible to anyone. */
export interface ScorecardRow {
  match_id: string;
  bout: number;
  bout_state: BoutState;
  is_tie: boolean;
  winner_id: string | null;
  shooter_a: string;
  shooter_b: string;
  total_a: number | null;
  inner_tens_a: number | null;
  total_b: number | null;
  inner_tens_b: number | null;
}

export interface PublicMatchResult {
  match_id: string;
  season_id: string | null;
  discipline: string;
  format: string;
  shooter_a: string;
  shooter_b: string;
  points_a: number;
  points_b: number;
  winner_id: string | null;
  decided_by: string | null;
  settled_at: string;
}
