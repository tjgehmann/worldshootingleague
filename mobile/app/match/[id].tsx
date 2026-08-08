import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import {
  Button,
  Card,
  Empty,
  HeadToHead,
  Hint,
  Kicker,
  Label,
  LargeTitle,
  Loading,
  Meta,
  Pill,
  type PillTone,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatPoints, formatScore, timeLeft } from '@/lib/format';
import {
  fetchBoutSubmissions,
  fetchConfirmedSubmissionIds,
  fetchMatch,
  fetchScorecard,
  type MatchDetail,
} from '@/lib/queries';
import { useTheme } from '@/lib/theme';
import { useOutbox } from '@/lib/use-outbox';
import type { Bout, ScoringMode, Submission } from '@/lib/types';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const t = useTheme();

  const match = useQuery({ queryKey: ['match', id], queryFn: () => fetchMatch(id) });
  const boutIds = (match.data?.bouts ?? []).map((b) => b.id);

  const submissions = useQuery({
    queryKey: ['submissions', boutIds],
    queryFn: () => fetchBoutSubmissions(boutIds),
    enabled: boutIds.length > 0,
  });
  const confirmed = useQuery({
    queryKey: ['confirmed', userId],
    queryFn: () => fetchConfirmedSubmissionIds(userId!),
    enabled: !!userId,
  });

  if (match.isLoading) return <Loading />;
  if (!match.data) return <Empty text="Match not found." />;

  // Signed out, or signed in but not a participant: this is a spectator. They
  // get the scorecard of a finished match and nothing else — no photos, and
  // nothing at all while a match is still running.
  if (!userId || (match.data.shooter_a !== userId && match.data.shooter_b !== userId)) {
    return <SpectatorMatch match={match.data} />;
  }

  const m = match.data;
  const isA = m.shooter_a === userId;
  const opponent = isA ? m.profile_b : m.profile_a;
  const opponentId = isA ? m.shooter_b : m.shooter_a;
  const myPoints = isA ? m.points_a : m.points_b;
  const theirPoints = isA ? m.points_b : m.points_a;
  const decided = m.state === 'settled' || m.state === 'finalized';
  const won = m.winner_id === userId;

  // Bouts that never got played because the match was already decided are
  // folded into one line rather than repeated as empty cards.
  const played = m.bouts.filter((b) => b.state !== 'void');
  const dropped = m.bouts.filter((b) => b.state === 'void');

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.ground }}
      contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
    >
      <Kicker>
        {m.team_match
          ? `${m.discipline.name} · Board ${m.board}`
          : `${m.discipline.name} · Best of ${m.bouts.length}`}
      </Kicker>
      <LargeTitle>vs {opponent.display_name}</LargeTitle>

      {m.team_match ? <TeamContext match={m} userId={userId} /> : null}

      {decided ? (
        <Card tone={won ? 'positive' : undefined}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={[t.text.label, { color: won ? t.colors.positive : t.colors.inkMuted }]}>
                {won ? 'Match won' : 'Match lost'}
              </Text>
              <Text
                style={[
                  t.text.scoreSm,
                  { color: won ? t.colors.positive : t.colors.ink, marginTop: 4 },
                ]}
              >
                {formatPoints(myPoints)} : {formatPoints(theirPoints)}
              </Text>
            </View>
          </View>
          <Text
            style={{
              color: won ? t.colors.positive : t.colors.inkMuted,
              fontSize: 12.5,
              marginTop: t.space.md,
              lineHeight: 18,
            }}
          >
            {m.state === 'finalized'
              ? 'Rated. Your rating has been updated.'
              : `Rated once the dispute window closes — ${timeLeft(m.dispute_closes_at ?? m.closes_at)}.`}
          </Text>
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[t.text.points, { color: t.colors.ink }]}>
              {formatPoints(myPoints)} : {formatPoints(theirPoints)}
            </Text>
            <Pill tone="wait">{timeLeft(m.closes_at)}</Pill>
          </View>
          <Hint>You can shoot every series in one range session.</Hint>
        </Card>
      )}

      {played.map((bout) => (
        <BoutCard
          key={bout.id}
          bout={bout}
          userId={userId}
          opponentId={opponentId}
          opponentName={opponent.display_name}
          scoringMode={m.discipline.scoring_mode}
          submissions={submissions.data ?? []}
          confirmedIds={confirmed.data ?? new Set<string>()}
        />
      ))}

      {dropped.length > 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>
              {dropped.length === 1
                ? `Series ${dropped[0].index}`
                : `Series ${dropped[0].index}–${dropped[dropped.length - 1].index}`}
            </Label>
            <Pill tone="wait">Dropped</Pill>
          </View>
          <Meta style={{ marginTop: t.space.sm }}>
            Not needed — the match was already decided.
          </Meta>
        </Card>
      ) : null}
    </ScrollView>
  );
}

/**
 * What anyone with the link sees. Reads public.match_scorecard, which exposes
 * settled matches only, so a match in progress shows nothing to give away.
 */
function SpectatorMatch({ match }: { match: MatchDetail }) {
  const t = useTheme();
  const decided = match.state === 'settled' || match.state === 'finalized';

  const scorecard = useQuery({
    queryKey: ['scorecard', match.id],
    queryFn: () => fetchScorecard(match.id),
    enabled: decided,
  });

  if (!decided) {
    return (
      <Empty text="This match is still being shot. Results appear once both shooters have submitted." />
    );
  }

  const mode = match.discipline.scoring_mode;
  const aWon = match.winner_id === match.shooter_a;
  const bWon = match.winner_id === match.shooter_b;

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.ground }}
      contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
    >
      <Kicker>
        {match.discipline.name}
        {match.settled_at ? ` · ${formatDateTime(match.settled_at)}` : ''}
      </Kicker>
      <LargeTitle>
        {match.profile_a.display_name} v {match.profile_b.display_name}
      </LargeTitle>

      <Card>
        <HeadToHead
          leftLabel={match.profile_a.display_name}
          leftValue={formatPoints(match.points_a)}
          leftWon={aWon}
          rightLabel={match.profile_b.display_name}
          rightValue={formatPoints(match.points_b)}
          rightWon={bWon}
        />
        <Meta style={{ marginTop: t.space.md }}>
          {match.decided_by === 'forfeit'
            ? 'Decided by walkover.'
            : match.decided_by === 'tiebreak'
              ? 'Decided on a tiebreak.'
              : 'Decided on series won.'}
        </Meta>
      </Card>

      <Kicker>Scorecard</Kicker>
      {scorecard.isLoading ? (
        <Loading />
      ) : (
        (scorecard.data ?? []).map((row) => (
          <Card key={row.bout}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: t.space.md,
              }}
            >
              <Label>Series {row.bout}</Label>
              {row.is_tie ? <Pill tone="wait">Tied</Pill> : null}
            </View>
            <HeadToHead
              leftLabel={match.profile_a.display_name.split(' ')[0]}
              leftValue={formatScore(row.total_a, mode)}
              leftMeta={row.inner_tens_a != null ? `${row.inner_tens_a} inner tens` : undefined}
              leftWon={row.winner_id === match.shooter_a}
              rightLabel={match.profile_b.display_name.split(' ')[0]}
              rightValue={formatScore(row.total_b, mode)}
              rightMeta={row.inner_tens_b != null ? `${row.inner_tens_b} inner tens` : undefined}
              rightWon={row.winner_id === match.shooter_b}
            />
          </Card>
        ))
      )}

      <Hint>
        Photos stay with the two shooters and the referee. What you see here is the
        result they both confirmed.
      </Hint>
    </ScrollView>
  );
}

/**
 * A board sits inside a club fixture. Showing the team score here is what makes
 * the individual match feel like it counts for something beyond a rating.
 */
function TeamContext({ match, userId }: { match: MatchDetail; userId: string }) {
  const t = useTheme();
  const team = match.team_match!;
  const mine = match.shooter_a === userId ? team.club_a : team.club_b;
  const theirs = match.shooter_a === userId ? team.club_b : team.club_a;
  const myPoints = match.shooter_a === userId ? team.points_a : team.points_b;
  const theirPoints = match.shooter_a === userId ? team.points_b : team.points_a;
  const decided = team.state === 'settled' || team.state === 'finalized';
  const won = decided && team.winner_club_id === mine.id;

  return (
    <Card tone={won ? 'positive' : undefined}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label>Club fixture</Label>
          <Text style={[t.text.name, { color: t.colors.ink, marginTop: 2 }]} numberOfLines={1}>
            {mine.short_name ?? mine.name} v {theirs.short_name ?? theirs.name}
          </Text>
        </View>
        <Text
          style={[
            t.text.points,
            { color: won ? t.colors.positive : t.colors.ink },
          ]}
        >
          {formatPoints(myPoints)} : {formatPoints(theirPoints)}
        </Text>
      </View>
      <Meta style={{ marginTop: t.space.sm }}>
        {decided
          ? won
            ? 'Your club took the fixture.'
            : team.winner_club_id === null
              ? 'The fixture ended level.'
              : 'Your club lost the fixture.'
          : 'Board points so far. Every board still counts.'}
      </Meta>
    </Card>
  );
}

function BoutCard({
  bout,
  userId,
  opponentId,
  opponentName,
  scoringMode,
  submissions,
  confirmedIds,
}: {
  bout: Bout;
  userId: string;
  opponentId: string;
  opponentName: string;
  scoringMode: ScoringMode;
  submissions: Submission[];
  confirmedIds: Set<string>;
}) {
  const t = useTheme();
  const { queuedBoutIds } = useOutbox();
  const forBout = submissions.filter((s) => s.bout_id === bout.id);
  const mine = forBout.find((s) => s.shooter_id === userId);
  // Before the reveal this is always undefined — RLS does not return the row.
  const theirs = forBout.find((s) => s.shooter_id === opponentId);

  // A queued report has not reached the server, so there is no submission row
  // yet — but offering "report result" again would invite a duplicate.
  const queued = queuedBoutIds.has(bout.id);
  const canReport =
    !mine && !queued && (bout.state === 'open' || bout.state === 'awaiting_opponent');
  const needsCheck = !!theirs && !confirmedIds.has(theirs.id);
  const blind = !theirs && !!mine;
  const firstName = opponentName.split(' ')[0];

  const { tone, label } = boutStatus(bout, userId, !!mine, firstName);

  return (
    <Card>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: t.space.md,
        }}
      >
        <Label>Series {bout.index}</Label>
        <Pill tone={tone}>{label}</Pill>
      </View>

      {queued && !mine ? (
        <Meta>Saved on your phone. It will be sent as soon as you have reception.</Meta>
      ) : canReport ? (
        <Link href={{ pathname: '/bout/[id]/report', params: { id: bout.id } }} asChild>
          <Button label="Report result" onPress={() => {}} />
        </Link>
      ) : (
        <>
          <HeadToHead
            leftLabel="You"
            leftValue={formatScore(mine?.adjusted_total ?? mine?.total, scoringMode)}
            leftMeta={mine?.inner_tens != null ? `${mine.inner_tens} inner tens` : undefined}
            leftWon={bout.winner_id === userId}
            rightLabel={firstName}
            rightValue={blind ? '···' : formatScore(theirs?.adjusted_total ?? theirs?.total, scoringMode)}
            rightMeta={
              blind
                ? `hidden until ${firstName} submits`
                : theirs?.inner_tens != null
                  ? `${theirs.inner_tens} inner tens`
                  : undefined
            }
            rightWon={!!bout.winner_id && bout.winner_id === opponentId}
            rightBlind={blind}
          />

          {needsCheck ? (
            <Link href={{ pathname: '/bout/[id]/confirm', params: { id: bout.id } }} asChild>
              <Button label={`Check ${firstName}'s photo`} variant="quiet" size="sm" onPress={() => {}} />
            </Link>
          ) : null}
        </>
      )}
    </Card>
  );
}

function boutStatus(
  bout: Bout,
  userId: string,
  hasMine: boolean,
  opponentFirstName: string,
): { tone: PillTone; label: string } {
  switch (bout.state) {
    case 'open':
      return { tone: 'turn', label: 'Your turn' };
    case 'awaiting_opponent':
      return hasMine
        ? { tone: 'wait', label: `Waiting for ${opponentFirstName}` }
        : { tone: 'turn', label: 'Your turn' };
    case 'revealed':
      return { tone: 'wait', label: 'Being scored' };
    case 'settled':
      if (bout.is_tie) return { tone: 'wait', label: 'Tied' };
      return bout.winner_id === userId
        ? { tone: 'won', label: 'Won' }
        : { tone: 'lost', label: 'Lost' };
    case 'disputed':
      return { tone: 'turn', label: 'Under review' };
    case 'forfeited':
      return bout.winner_id === userId
        ? { tone: 'won', label: 'Walkover' }
        : { tone: 'lost', label: 'Walkover' };
    default:
      return { tone: 'wait', label: '' };
  }
}
