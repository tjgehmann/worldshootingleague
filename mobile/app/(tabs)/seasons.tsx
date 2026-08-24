import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Empty, Kicker, LargeTitle, Loading, Meta, Rule } from '@/components/ui';
import { fetchSeasons } from '@/lib/queries';
import { TAB_BAR_CLEARANCE, useTheme } from '@/lib/theme';

/**
 * Every official ladder and club competition, open or not.
 *
 * "My matches" only ever shows what you are already in, so it has nothing to
 * offer the shooter looking for a season to join — until now that meant
 * already having the link, from a club chat or the public league page.
 * Joining itself still happens on the season's own screen; this is just the
 * way to find one without the link.
 */
export default function SeasonsScreen() {
  const t = useTheme();
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: fetchSeasons });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.ground }} edges={['top']}>
      <FlatList
        data={seasons.data}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{
          paddingHorizontal: t.space.xl,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        refreshing={seasons.isRefetching}
        onRefresh={() => seasons.refetch()}
        ListHeaderComponent={
          <View style={{ paddingTop: t.space.md, paddingBottom: t.space.sm }}>
            <Kicker>Official ladders and club competitions</Kicker>
            <LargeTitle>Seasons</LargeTitle>
          </View>
        }
        ListEmptyComponent={
          seasons.isLoading ? (
            <Loading />
          ) : (
            <Empty text="No seasons yet. The first one starts as soon as there are enough shooters to pair." />
          )
        }
        ItemSeparatorComponent={() => <Rule />}
        renderItem={({ item: s }) => (
          <Link href={{ pathname: '/season/[slug]', params: { slug: s.slug } }} asChild>
            <Pressable>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.space.md,
                  paddingVertical: 14,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Meta numberOfLines={1}>
                    {s.discipline_name} ·{' '}
                    {s.competition_type === 'team'
                      ? `${s.clubs_entered} clubs`
                      : `${s.shooters_entered} shooters`}
                  </Meta>
                </View>
                <Text
                  style={[
                    t.text.data,
                    {
                      color:
                        s.state === 'running' || s.state === 'registration'
                          ? t.colors.accent
                          : t.colors.inkFaint,
                    },
                  ]}
                >
                  {s.state === 'running'
                    ? `Round ${s.rounds_paired}/${s.round_count}`
                    : s.state === 'registration'
                      ? 'Open to join'
                      : s.state}
                </Text>
              </View>
            </Pressable>
          </Link>
        )}
      />
    </SafeAreaView>
  );
}
