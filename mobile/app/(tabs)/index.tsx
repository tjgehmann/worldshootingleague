import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Card,
  Empty,
  Hairline,
  Kicker,
  LargeTitle,
  Loading,
  Meta,
  Pill,
  Segments,
  type PillTone,
  type SegmentState,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatPoints, timeLeft } from '@/lib/format';
import { fetchBoutSubmissions, fetchMyMatches, type MatchDetail } from '@/lib/queries';
import { TAB_BAR_CLEARANCE, useTheme } from '@/lib/theme';
import type { Bout } from '@/lib/types';

function segmentStates(match: MatchDetail, userId: string): SegmentState[] {
  return match.bouts.map((b: Bout) => {
    if (b.state === 'void') return 'void';
    if (b.state === 'settled' || b.state === 'forfeited') {
      if (b.is_tie) return 'tie';
      return b.winner_id === userId ? 'won' : 'lost';
    }
    return 'open';
  });
}

function status(
  match: MatchDetail,
  userId: string,
  needsAction: boolean,
): { tone: PillTone; label: string } {
  if (match.state === 'settled' || match.state === 'finalized') {
    return match.winner_id === userId
      ? { tone: 'won', label: 'Gewonnen' }
      : { tone: 'lost', label: 'Verloren' };
  }
  return needsAction ? { tone: 'turn', label: 'Du bist dran' } : { tone: 'wait', label: 'Wartet' };
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
  const t = useTheme();
  const isA = match.shooter_a === userId;
  const opponent = isA ? match.profile_b : match.profile_a;
  const myPoints = isA ? match.points_a : match.points_b;
  const theirPoints = isA ? match.points_b : match.points_a;
  const decided = match.state === 'settled' || match.state === 'finalized';
  const { tone, label } = status(match, userId, needsAction);

  const done = match.bouts.filter((b) => b.state === 'settled' || b.state === 'forfeited').length;

  return (
    <Link href={{ pathname: '/match/[id]', params: { id: match.id } }} asChild>
      <Pressable>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
            <Avatar name={opponent.display_name} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                {opponent.display_name}
              </Text>
              <Meta>
                {match.discipline.name}
                {decided ? '' : ` · ${timeLeft(match.closes_at)}`}
              </Meta>
            </View>
            <Pill tone={tone}>{label}</Pill>
          </View>

          <Hairline />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[t.text.points, { color: t.colors.ink }]}>
              {formatPoints(myPoints)} : {formatPoints(theirPoints)}
            </Text>
            <Meta>
              {decided
                ? `${done} von ${match.bouts.length} Serien`
                : `Serie ${Math.min(done + 1, match.bouts.length)} von ${match.bouts.length}`}
            </Meta>
          </View>

          <View style={{ marginTop: t.space.md }}>
            <Segments states={segmentStates(match, userId)} />
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

export default function MatchesScreen() {
  const { userId } = useAuth();
  const t = useTheme();

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

  const mine = new Set(
    (submissions.data ?? []).filter((s) => s.shooter_id === userId).map((s) => s.bout_id),
  );

  const openRound = (matches.data ?? []).find((m) => m.round_id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.ground }} edges={['top']}>
      <FlatList
        contentContainerStyle={{
          paddingHorizontal: t.space.xl,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        data={matches.data}
        keyExtractor={(m) => m.id}
        refreshing={matches.isRefetching}
        onRefresh={() => matches.refetch()}
        ListHeaderComponent={
          <View style={{ paddingTop: t.space.md }}>
            {openRound ? <Kicker>Laufende Saison</Kicker> : null}
            <LargeTitle>Meine Matches</LargeTitle>
          </View>
        }
        ListEmptyComponent={
          <Empty text="Noch keine Matches. Tritt einer Saison bei, dann wird gepaart." />
        }
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
    </SafeAreaView>
  );
}
