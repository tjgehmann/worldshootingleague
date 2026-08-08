import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Empty, Hint, Kicker, LargeTitle, Loading, Meta, Pill } from '@/components/ui';
import { fetchDisputeQueue } from '@/lib/queries';
import { TAB_BAR_CLEARANCE, useTheme } from '@/lib/theme';
import type { DisputeCase } from '@/lib/types';

/**
 * The referee's queue.
 *
 * Peer confirmation decides almost everything; this is what is left when two
 * shooters disagree. A case here is holding up a rating, so the queue is
 * ordered oldest first and says how long each one has been waiting rather than
 * when it arrived — the number that should embarrass someone is the age.
 */
export default function CasesScreen() {
  const t = useTheme();
  const cases = useQuery({ queryKey: ['dispute-queue'], queryFn: () => fetchDisputeQueue() });

  if (cases.isLoading) return <Loading />;
  if (cases.error) return <Empty text="Could not load the queue." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.ground }} edges={['top']}>
      <FlatList
        contentContainerStyle={{
          paddingHorizontal: t.space.xl,
          paddingTop: t.space.md,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        data={cases.data}
        keyExtractor={(c) => c.dispute_id}
        refreshing={cases.isRefetching}
        onRefresh={() => cases.refetch()}
        ListHeaderComponent={
          <View>
            <Kicker>Referee</Kicker>
            <LargeTitle>Open cases</LargeTitle>
          </View>
        }
        ListEmptyComponent={<Empty text="Nothing waiting. Every result stands as reported." />}
        ListFooterComponent={
          cases.data?.length ? (
            <Hint>
              A case holds the whole match out of the ratings until it is decided.
            </Hint>
          ) : null
        }
        renderItem={({ item }) => <CaseRow item={item} />}
      />
    </SafeAreaView>
  );
}

function CaseRow({ item }: { item: DisputeCase }) {
  const t = useTheme();
  const hours = Math.floor(item.waiting_hours);
  const age = hours < 1 ? 'just now' : hours < 48 ? `${hours} hrs waiting` : `${Math.floor(hours / 24)} days waiting`;

  return (
    <Link href={{ pathname: '/case/[id]', params: { id: item.dispute_id } }} asChild>
      <Pressable>
        <Card>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: t.space.sm,
            }}
          >
            <Text style={[t.text.name, { color: t.colors.ink, flex: 1 }]} numberOfLines={1}>
              {item.shooter_a_name} v {item.shooter_b_name}
            </Text>
            <Pill tone={item.state === 'assigned' ? 'wait' : 'turn'}>
              {item.state === 'assigned' ? 'Taken' : 'Open'}
            </Pill>
          </View>

          <Meta numberOfLines={1}>
            {item.discipline_name} · series {item.bout_index} · {age}
          </Meta>

          <Text
            style={{
              color: t.colors.inkMuted,
              fontSize: 13.5,
              lineHeight: 19,
              marginTop: t.space.md,
            }}
            numberOfLines={3}
          >
            “{item.reason}”
          </Text>
          <Meta>raised by {item.raised_by_name}</Meta>
        </Card>
      </Pressable>
    </Link>
  );
}
