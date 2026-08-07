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
import { formatPoints, formatScore, timeLeft } from '@/lib/format';
import { fetchBoutSubmissions, fetchConfirmedSubmissionIds, fetchMatch } from '@/lib/queries';
import { useTheme } from '@/lib/theme';
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
  if (!match.data || !userId) return <Empty text="Match nicht gefunden." />;

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
        {m.discipline.name} · Best of {m.bouts.length}
      </Kicker>
      <LargeTitle>gegen {opponent.display_name}</LargeTitle>

      {decided ? (
        <Card tone={won ? 'positive' : undefined}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={[t.text.label, { color: won ? t.colors.positive : t.colors.inkMuted }]}>
                {won ? 'Match gewonnen' : 'Match verloren'}
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
              ? 'Gewertet. Das Rating ist angepasst.'
              : `Wird ${timeLeft(m.dispute_closes_at ?? m.closes_at)} gewertet — bis dahin kann beanstandet werden.`}
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
          <Hint>Du kannst alle Serien in einer Standsitzung schießen.</Hint>
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
                ? `Serie ${dropped[0].index}`
                : `Serie ${dropped[0].index}–${dropped[dropped.length - 1].index}`}
            </Label>
            <Pill tone="wait">Entfallen</Pill>
          </View>
          <Meta style={{ marginTop: t.space.sm }}>
            Nicht mehr nötig — das Match war schon entschieden.
          </Meta>
        </Card>
      ) : null}
    </ScrollView>
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
  const forBout = submissions.filter((s) => s.bout_id === bout.id);
  const mine = forBout.find((s) => s.shooter_id === userId);
  // Before the reveal this is always undefined — RLS does not return the row.
  const theirs = forBout.find((s) => s.shooter_id === opponentId);

  const canReport = !mine && (bout.state === 'open' || bout.state === 'awaiting_opponent');
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
        <Label>Serie {bout.index}</Label>
        <Pill tone={tone}>{label}</Pill>
      </View>

      {canReport && !mine ? (
        <Link href={{ pathname: '/bout/[id]/report', params: { id: bout.id } }} asChild>
          <Button label="Ergebnis melden" onPress={() => {}} />
        </Link>
      ) : (
        <>
          <HeadToHead
            leftLabel="Du"
            leftValue={formatScore(mine?.adjusted_total ?? mine?.total, scoringMode)}
            leftMeta={mine ? `${mine.tens} Zehner` : undefined}
            leftWon={bout.winner_id === userId}
            rightLabel={firstName}
            rightValue={blind ? '···' : formatScore(theirs?.adjusted_total ?? theirs?.total, scoringMode)}
            rightMeta={
              blind ? `verdeckt bis ${firstName} meldet` : theirs ? `${theirs.tens} Zehner` : undefined
            }
            rightWon={!!bout.winner_id && bout.winner_id === opponentId}
            rightBlind={blind}
          />

          {needsCheck ? (
            <Link href={{ pathname: '/bout/[id]/confirm', params: { id: bout.id } }} asChild>
              <Button label={`Foto von ${firstName} prüfen`} variant="quiet" size="sm" onPress={() => {}} />
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
      return { tone: 'turn', label: 'Du bist dran' };
    case 'awaiting_opponent':
      return hasMine
        ? { tone: 'wait', label: `Wartet auf ${opponentFirstName}` }
        : { tone: 'turn', label: 'Du bist dran' };
    case 'revealed':
      return { tone: 'wait', label: 'Wird gewertet' };
    case 'settled':
      if (bout.is_tie) return { tone: 'wait', label: 'Unentschieden' };
      return bout.winner_id === userId
        ? { tone: 'won', label: 'Gewonnen' }
        : { tone: 'lost', label: 'Verloren' };
    case 'disputed':
      return { tone: 'turn', label: 'In Prüfung' };
    case 'forfeited':
      return bout.winner_id === userId
        ? { tone: 'won', label: 'Kampflos' }
        : { tone: 'lost', label: 'Kampflos' };
    default:
      return { tone: 'wait', label: '' };
  }
}
