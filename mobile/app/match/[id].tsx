import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Empty, Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { boutLabel, formatPoints, formatScore, timeLeft } from '@/lib/format';
import {
  fetchBoutSubmissions,
  fetchConfirmedSubmissionIds,
  fetchMatch,
} from '@/lib/queries';
import { colors, space, type } from '@/lib/theme';
import type { Bout, ScoringMode, Submission } from '@/lib/types';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();

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
  const decided = m.state === 'settled' || m.state === 'finalized';

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.discipline}>{m.discipline.name}</Text>

      <View style={styles.scoreline}>
        <Text style={styles.side}>Du</Text>
        <Text style={styles.score}>
          {formatPoints(isA ? m.points_a : m.points_b)} :{' '}
          {formatPoints(isA ? m.points_b : m.points_a)}
        </Text>
        <Text style={styles.side}>{opponent.display_name}</Text>
      </View>

      {decided ? (
        <Banner tone="info">
          {m.winner_id === userId ? 'Match gewonnen.' : 'Match verloren.'}
          {m.state === 'settled'
            ? ' Das Ergebnis kann noch beanstandet werden, danach wird es gewertet.'
            : ' Gewertet.'}
        </Banner>
      ) : (
        <Banner tone="info">
          {`Fenster läuft ${timeLeft(m.closes_at)}. Du kannst alle Serien in einer Standsitzung schießen.`}
        </Banner>
      )}

      {m.bouts.map((bout) => (
        <BoutCard
          key={bout.id}
          bout={bout}
          totalBouts={m.bouts.length}
          userId={userId}
          opponentId={opponentId}
          opponentName={opponent.display_name}
          scoringMode={m.discipline.scoring_mode}
          submissions={submissions.data ?? []}
          confirmedIds={confirmed.data ?? new Set<string>()}
        />
      ))}
    </ScrollView>
  );
}

function BoutCard({
  bout,
  totalBouts,
  userId,
  opponentId,
  opponentName,
  scoringMode,
  submissions,
  confirmedIds,
}: {
  bout: Bout;
  totalBouts: number;
  userId: string;
  opponentId: string;
  opponentName: string;
  scoringMode: ScoringMode;
  submissions: Submission[];
  confirmedIds: Set<string>;
}) {
  const forBout = submissions.filter((s) => s.bout_id === bout.id);
  const mine = forBout.find((s) => s.shooter_id === userId);
  // Before the reveal this is always undefined — RLS does not return the row.
  const theirs = forBout.find((s) => s.shooter_id === opponentId);

  const canReport =
    !mine && (bout.state === 'open' || bout.state === 'awaiting_opponent');
  const needsCheck = !!theirs && !confirmedIds.has(theirs.id) && bout.state !== 'void';

  return (
    <Card>
      <View style={styles.boutHead}>
        <Text style={styles.boutTitle}>{boutLabel(bout, totalBouts)}</Text>
        <Text style={type.muted}>{statusText(bout, !!mine, opponentName)}</Text>
      </View>

      {bout.state === 'void' ? (
        <Text style={type.muted}>Nicht mehr nötig — das Match war schon entschieden.</Text>
      ) : (
        <View style={styles.compare}>
          <ScoreBlock
            caption="Du"
            submission={mine}
            mode={scoringMode}
            highlight={bout.winner_id === userId}
          />
          <ScoreBlock
            caption={opponentName}
            submission={theirs}
            mode={scoringMode}
            hidden={!theirs && !!mine && bout.state === 'awaiting_opponent'}
            highlight={!!bout.winner_id && bout.winner_id !== userId}
          />
        </View>
      )}

      {canReport ? (
        <Link href={{ pathname: '/bout/[id]/report', params: { id: bout.id } }} asChild>
          <Button label="Ergebnis melden" onPress={() => {}} />
        </Link>
      ) : null}

      {needsCheck ? (
        <Link href={{ pathname: '/bout/[id]/confirm', params: { id: bout.id } }} asChild>
          <Button label={`Foto von ${opponentName} prüfen`} variant="secondary" onPress={() => {}} />
        </Link>
      ) : null}
    </Card>
  );
}

function ScoreBlock({
  caption,
  submission,
  mode,
  hidden,
  highlight,
}: {
  caption: string;
  submission?: Submission;
  mode: ScoringMode;
  hidden?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={styles.block}>
      <Text style={type.muted} numberOfLines={1}>
        {caption}
      </Text>
      <Text style={[styles.blockScore, highlight && { color: colors.win }]}>
        {hidden ? '···' : formatScore(submission?.adjusted_total ?? submission?.total, mode)}
      </Text>
      <Text style={type.muted}>
        {submission && !hidden ? `${submission.tens} Zehner` : hidden ? 'verdeckt' : '–'}
      </Text>
    </View>
  );
}

function statusText(bout: Bout, hasMine: boolean, opponentName: string): string {
  switch (bout.state) {
    case 'open':
      return 'offen';
    case 'awaiting_opponent':
      return hasMine ? `wartet auf ${opponentName}` : 'du bist dran';
    case 'revealed':
      return 'aufgedeckt';
    case 'settled':
      return bout.is_tie ? 'unentschieden' : 'gewertet';
    case 'disputed':
      return 'in Prüfung';
    case 'forfeited':
      return 'kampflos';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  body: { padding: space.md, paddingBottom: space.xl },
  discipline: { ...type.heading, marginBottom: space.md },
  scoreline: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  side: { ...type.muted, flex: 1, textAlign: 'center' },
  score: { ...type.score },
  boutHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  boutTitle: { ...type.body, fontWeight: '700' },
  compare: { flexDirection: 'row', gap: space.md },
  block: { flex: 1, alignItems: 'center', paddingVertical: space.sm },
  blockScore: { fontSize: 26, fontWeight: '700', color: colors.text, marginVertical: 2 },
});
