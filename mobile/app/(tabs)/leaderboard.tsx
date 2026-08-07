import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Empty, Hint, Kicker, LargeTitle, Loading, Meta } from '@/components/ui';
import { fetchDisciplines, fetchLeaderboard } from '@/lib/queries';
import { TAB_BAR_CLEARANCE, useTheme } from '@/lib/theme';

export default function LeaderboardScreen() {
  const [code, setCode] = useState<string | undefined>();
  const t = useTheme();

  const disciplines = useQuery({ queryKey: ['disciplines'], queryFn: fetchDisciplines });
  const rows = useQuery({
    queryKey: ['leaderboard', code],
    queryFn: () => fetchLeaderboard(code),
  });

  const nameFor = (c: string) =>
    disciplines.data?.find((d) => d.code === c)?.name ?? c;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.ground }} edges={['top']}>
      <View style={{ paddingHorizontal: t.space.xl, paddingTop: t.space.md }}>
        <Kicker>Current season</Kicker>
        <LargeTitle>Rankings</LargeTitle>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginBottom: t.space.md }}
        contentContainerStyle={{ paddingHorizontal: t.space.xl, gap: t.space.sm }}
      >
        <Chip label="All" active={!code} onPress={() => setCode(undefined)} />
        {(disciplines.data ?? []).map((d) => (
          <Chip
            key={d.id}
            label={d.name}
            active={code === d.code}
            onPress={() => setCode(d.code)}
          />
        ))}
      </ScrollView>

      {rows.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={rows.data}
          keyExtractor={(r) => `${r.discipline_id}-${r.shooter_id}`}
          contentContainerStyle={{
            paddingHorizontal: t.space.xl,
            paddingBottom: TAB_BAR_CLEARANCE,
          }}
          refreshing={rows.isRefetching}
          onRefresh={() => rows.refetch()}
          ListEmptyComponent={<Empty text="No rated matches yet." />}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: t.colors.hairline }} />
          )}
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space.md,
                paddingVertical: 11,
              }}
            >
              <Text
                style={{
                  width: 24,
                  fontSize: 14,
                  fontWeight: '700',
                  color: item.position === 1 ? t.colors.accent : t.colors.inkFaint,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {item.position}
              </Text>
              <Avatar name={item.display_name} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
                  <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  {item.is_provisional ? (
                    <View
                      style={{
                        backgroundColor: t.colors.surfaceAlt,
                        borderRadius: t.radius.sm,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Text
                        style={{
                          color: t.colors.inkFaint,
                          fontSize: 9.5,
                          fontWeight: '700',
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                        }}
                      >
                        provisional
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Meta>
                  {item.country_code} · {nameFor(item.discipline)}
                </Meta>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: '700',
                    letterSpacing: -0.4,
                    color: t.colors.ink,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {Math.round(item.rating)}
                </Text>
                <Meta>
                  {item.wins} / {item.losses}
                </Meta>
              </View>
            </View>
          )}
          ListFooterComponent={
            rows.data?.length ? (
              <Hint>
                "Provisional" means too few matches so far for a settled rating.
              </Hint>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: t.radius.pill,
        backgroundColor: active ? t.colors.accentSolid : t.colors.surface,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: active ? t.colors.onSolid : t.colors.inkMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
