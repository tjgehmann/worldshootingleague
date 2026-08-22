import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ColLabel, Empty, Hint, Kicker, LargeTitle, Loading, Rule } from '@/components/ui';
import { fetchDisciplines, fetchLeaderboard } from '@/lib/queries';
import { TAB_BAR_CLEARANCE, useTheme } from '@/lib/theme';

/**
 * The ladder, set as a table rather than as a list of cards.
 *
 * Two rules do the separating — heavy under the header, hairline between rows —
 * which is what a printed results sheet does and what a shooter already knows
 * how to read. The initials tiles are gone: "MF" in a coloured square stood in
 * for an identity nobody has uploaded, while the club and country underneath
 * are the things a captain actually looks for.
 */
export default function LeaderboardScreen() {
  const [code, setCode] = useState<string | undefined>();
  const t = useTheme();

  const disciplines = useQuery({ queryKey: ['disciplines'], queryFn: fetchDisciplines });
  const rows = useQuery({
    queryKey: ['leaderboard', code],
    queryFn: () => fetchLeaderboard(code),
  });

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
          ListEmptyComponent={<Empty text="No rated matches yet. The first rated series starts this table." />}
          ListHeaderComponent={
            rows.data?.length ? (
              <View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    gap: t.space.md,
                    paddingBottom: 7,
                  }}
                >
                  <ColLabel width={22}>#</ColLabel>
                  <View style={{ flex: 1 }}>
                    <ColLabel>Shooter</ColLabel>
                  </View>
                  <View style={{ width: 58 }}>
                    <ColLabel align="right">Rating</ColLabel>
                  </View>
                  <View style={{ width: 46 }}>
                    <ColLabel align="right">W/L</ColLabel>
                  </View>
                </View>
                <Rule heavy />
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <Rule />}
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space.md,
                paddingVertical: 13,
              }}
            >
              <Text
                style={{
                  width: 22,
                  fontFamily: t.fonts.monoMedium,
                  fontSize: 13,
                  color: item.position <= 3 ? t.colors.accent : t.colors.inkFaint,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {item.position}
              </Text>

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
                  <Text
                    style={[t.text.name, { color: t.colors.ink, flexShrink: 1 }]}
                    numberOfLines={1}
                  >
                    {item.display_name}
                  </Text>
                  {item.is_provisional ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: t.colors.hairline,
                        borderRadius: t.radius.sm,
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                      }}
                    >
                      <Text
                        style={{
                          color: t.colors.inkFaint,
                          fontFamily: t.fonts.monoMedium,
                          fontSize: 9,
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        provisional
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[t.text.data, { color: t.colors.inkFaint, marginTop: 2 }]}
                  numberOfLines={1}
                >
                  {/* The code rather than the full name: this line is mono data
                      sitting in a narrow column, and "Air Rifle 10 m" pushed the
                      match count off the end of it. */}
                  {item.country_code} · {item.discipline} · {item.matches_played}{' '}
                  {item.matches_played === 1 ? 'match' : 'matches'}
                </Text>
              </View>

              <Text
                style={{
                  width: 58,
                  textAlign: 'right',
                  fontFamily: t.fonts.display,
                  fontSize: 21,
                  letterSpacing: -0.5,
                  color: t.colors.ink,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {Math.round(item.rating)}
              </Text>

              <Text
                style={[
                  t.text.data,
                  { width: 46, textAlign: 'right', color: t.colors.inkFaint },
                ]}
              >
                {item.wins}/{item.losses}
              </Text>
            </View>
          )}
          ListFooterComponent={
            rows.data?.length ? (
              <Hint>"Provisional" means too few matches so far for a settled rating.</Hint>
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
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: t.radius.sm,
        borderWidth: 1,
        borderColor: active ? t.colors.ink : t.colors.hairline,
        backgroundColor: active ? t.colors.ink : 'transparent',
      }}
    >
      <Text
        style={{
          fontFamily: t.fonts.monoMedium,
          fontSize: 10.5,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          color: active ? t.colors.ground : t.colors.inkMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
