import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { BoutStrip, Card, Empty, Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatPoints, timeLeft } from '@/lib/format';
import { fetchBoutSubmissions, fetchMyMatches, type MatchDetail } from '@/lib/queries';
import { colors, space, type } from '@/lib/theme';
import type { Bout } from '@/lib/types';

/** Colour per bout for the strip, from the shooter's point of view. */
function stripStates(
  match: MatchDetail,
  userId: string,
): ('won' | 'lost' | 'tie' | 'open' | 'void')[] {
  return match.bouts.map((b: Bout) => {
    if (b.state === 'void') return 'void';
    if (b.state === 'settled' || b.state === 'forfeited') {
      if (b.is_tie) return 'tie';
      return b.winner_id === userId ? 'won' : 'lost';
    }
    return 'open';
  });
}

function MatchRow({
  match,
  userId,
  needsAction,
}: {
  match: MatchDetail;
  userId: string;
  needsAction: boolean;
}) {
  const isA = match.shooter_a === userId;
  const opponent = isA ? match.profile_b : match.profile_a;
  const myPoints = isA ? match.points_a : match.points_b;
  const theirPoints = isA ? match.points_b : match.points_a;
  const decided = match.state === 'settled' || match.state === 'finalized';

  return (
    <Link href={{ pathname: '/match/[id]', params: { id: match.id } }} asChild>
      <Pressable>
        <Card>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={type.muted}>{match.discipline.code}</Text>
              <Text style={styles.opponent}>{opponent.display_name}</Text>
            </View>
            <Text style={styles.points}>
              {formatPoints(myPoints)} : {formatPoints(theirPoints)}
            </Text>
          </View>

          <View style={[styles.row, styles.footerRow]}>
            <BoutStrip states={stripStates(match, userId)} />
            {decided ? (
              <Text
                style={[
                  type.muted,
                  { color: match.winner_id === userId ? colors.win : colors.loss },
                ]}
              >
                {match.winner_id === userId ? 'gewonnen' : 'verloren'}
              </Text>
            ) : (
              <Text style={[type.muted, needsAction && styles.action]}>
                {needsAction ? 'Du bist dran' : timeLeft(match.closes_at)}
              </Text>
            )}
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

export default function MatchesScreen() {
  const { userId } = useAuth();

  const matches = useQuery({
    queryKey: ['matches', userId],
    queryFn: () => fetchMyMatches(userId!),
    enabled: !!userId,
  });

  const boutIds = (matches.data ?? []).flatMap((m) => m.bouts.map((b) => b.id));

  const submissions = useQuery({
    queryKey: ['submissions', boutIds],
    queryFn: () => fetchBoutSubmissions(boutIds),
    enabled: boutIds.length > 0,
  });

  if (matches.isLoading) return <Loading />;
  if (matches.error) return <Empty text="Matches konnten nicht geladen werden." />;
  if (!matches.data?.length) {
    return <Empty text="Noch keine Matches. Tritt einer Saison bei, dann wird gepaart." />;
  }

  const mine = new Set((submissions.data ?? []).filter((s) => s.shooter_id === userId).map((s) => s.bout_id));

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={matches.data}
      keyExtractor={(m) => m.id}
      refreshing={matches.isRefetching}
      onRefresh={() => matches.refetch()}
      renderItem={({ item }) => (
        <MatchRow
          match={item}
          userId={userId!}
          needsAction={item.bouts.some(
            (b) => (b.state === 'open' || b.state === 'awaiting_opponent') && !mine.has(b.id),
          )}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  footerRow: { marginTop: space.md, justifyContent: 'space-between' },
  grow: { flex: 1 },
  opponent: { ...type.body, fontWeight: '600', fontSize: 17 },
  points: { ...type.body, fontWeight: '700', fontSize: 18 },
  action: { color: colors.pending, fontWeight: '700' },
});
