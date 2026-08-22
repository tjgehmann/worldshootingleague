import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  Card,
  Empty,
  Hairline,
  Hint,
  Kicker,
  LargeTitle,
  Loading,
  Meta,
  Note,
  Pill,
  Segments,
  type PillTone,
  type SegmentState,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatPoints, timeLeft } from '@/lib/format';
import { dismissEntry, flushOutbox, retryEntry } from '@/lib/outbox';
import { useOutbox } from '@/lib/use-outbox';
import {
  fetchBoutSubmissions,
  fetchLiveOpenSeries,
  fetchMyMatches,
  type MatchDetail,
} from '@/lib/queries';
import { TAB_BAR_CLEARANCE, useTheme } from '@/lib/theme';
import type { Bout, OpenSeries } from '@/lib/types';

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
      ? { tone: 'won', label: 'Won' }
      : { tone: 'lost', label: 'Lost' };
  }
  return needsAction ? { tone: 'turn', label: 'Your turn' } : { tone: 'wait', label: 'Waiting' };
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
              <Meta numberOfLines={1}>
                {match.team_match
                  ? `Board ${match.board} · ${match.team_match.club_a.short_name ?? match.team_match.club_a.name} v ${match.team_match.club_b.short_name ?? match.team_match.club_b.name}`
                  : match.discipline.name}
              </Meta>
            </View>
            <Pill tone={tone}>{label}</Pill>
          </View>

          <Hairline />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[t.text.points, { color: t.colors.ink }]}>
              {formatPoints(myPoints)} : {formatPoints(theirPoints)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.space.sm }}>
              <Meta>
                {decided
                  ? `${done} of ${match.bouts.length} series`
                  : `Series ${Math.min(done + 1, match.bouts.length)} of ${match.bouts.length}`}
              </Meta>
              {/* Urgency belongs next to the action, not crammed into the
                  fixture line, where a club-vs-club board truncated it. */}
              {decided ? null : (
                <Text style={[t.text.data, { color: t.colors.accent }]}>
                  {timeLeft(match.closes_at)}
                </Text>
              )}
            </View>
          </View>

          <View style={{ marginTop: t.space.md }}>
            <Segments states={segmentStates(match, userId)} />
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

/**
 * Reports that have not reached the server yet. Anything sitting here is safe on
 * the device; the point of showing it is so nobody wonders whether their result
 * went through.
 */
function OutboxBanner() {
  const t = useTheme();
  const { pending, rejected } = useOutbox();

  if (pending.length === 0 && rejected.length === 0) return null;

  return (
    <View style={{ marginBottom: t.space.md }}>
      {pending.length > 0 ? (
        <Note tone="warn">
          {pending.length === 1
            ? '1 report is waiting for a connection. It will send itself.'
            : `${pending.length} reports are waiting for a connection. They will send themselves.`}
        </Note>
      ) : null}

      {rejected.map((entry) => (
        <Card key={entry.id}>
          <Text style={[t.text.name, { color: t.colors.negative }]}>Report not accepted</Text>
          <Hint>{entry.lastError ?? 'The server refused this report.'}</Hint>
          <View style={{ flexDirection: 'row', gap: t.space.sm }}>
            <Button
              label="Try again"
              variant="quiet"
              size="sm"
              onPress={() => retryEntry(entry.id)}
              style={{ flex: 1 }}
            />
            <Button
              label="Discard"
              variant="text"
              size="sm"
              onPress={() => dismissEntry(entry.id)}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      ))}
    </View>
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

  const openSeries = useQuery({
    queryKey: ['open-series', userId],
    queryFn: () => fetchLiveOpenSeries(userId!),
    enabled: !!userId,
  });

  if (matches.isLoading) return <Loading />;
  if (matches.error) return <Empty text="Could not load your matches." />;

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
        onRefresh={() => {
          // Pulling to refresh is also the natural moment to retry the queue.
          flushOutbox().catch(() => {});
          matches.refetch();
        }}
        ListHeaderComponent={
          <View style={{ paddingTop: t.space.md }}>
            {openRound ? <Kicker>Current season</Kicker> : null}
            <LargeTitle>My matches</LargeTitle>
            <OutboxBanner />
            <OpenSeriesCard series={openSeries.data ?? null} />
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Text style={[t.text.name, { color: t.colors.ink }]}>Nothing to shoot yet</Text>
            <Hint>
              If you are at a range right now, shoot a series and it will be compared with
              whoever reports one next — no waiting for a round. Or enter a season and be
              paired every week.
            </Hint>
            <Link href="/series/new" asChild>
              <Button label="Shoot a series now" onPress={() => {}} />
            </Link>
            <Link href="/(public)" asChild>
              <Button label="Find a season" variant="quiet" onPress={() => {}} />
            </Link>
          </Card>
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

/**
 * The way in that does not need a round, and the state of the one in flight.
 *
 * It sits above the matches because it is the answer to the only question a new
 * account has: I am at the range now, what can I do?
 */
function OpenSeriesCard({ series }: { series: OpenSeries | null }) {
  const t = useTheme();

  if (!series) {
    return (
      <Link href="/series/new" asChild>
        <Pressable>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[t.text.name, { color: t.colors.ink }]}>At a range now?</Text>
                <Meta numberOfLines={2}>
                  Shoot a series and it is compared with whoever reports one next.
                </Meta>
              </View>
              <Text style={{ color: t.colors.accent, fontSize: 15, fontWeight: '600' }}>Start</Text>
            </View>
          </Card>
        </Pressable>
      </Link>
    );
  }

  return (
    <Link href="/series/new" asChild>
      <Pressable>
        <Card tone={series.state === 'open' ? 'positive' : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.text.name, { color: t.colors.ink }]}>
                {series.state === 'open' ? 'Series in progress' : 'Series waiting'}
              </Text>
              <Meta numberOfLines={2}>
                {series.state === 'open'
                  ? `Report it within ${timeLeft(series.report_by)}`
                  : 'Waiting for somebody at your level to report one'}
              </Meta>
            </View>
            <Pill tone={series.state === 'open' ? 'turn' : 'wait'}>
              {series.state === 'open' ? 'Report' : 'Waiting'}
            </Pill>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
