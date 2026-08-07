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
  club: string | null;
  bio: string | null;
  equipment: Record<string, string>;
  role: 'shooter' | 'referee' | 'admin';
}

export interface Discipline {
  id: string;
  code: string;
  name: string;
  shot_count: number;
  scoring_mode: ScoringMode;
  max_shot_value: number;
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
  tens: number;
  adjusted_total: number | null;
  photo_path: string | null;
  shot_at: string;
  submitted_at: string;
}

export interface Match {
  id: string;
  season_id: string | null;
  round_id: string | null;
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
