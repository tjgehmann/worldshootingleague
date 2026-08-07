import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Empty, Loading } from '@/components/ui';
import { fetchDisciplines, fetchLeaderboard } from '@/lib/queries';
import { colors, radius, space, type } from '@/lib/theme';

export default function LeaderboardScreen() {
  const [code, setCode] = useState<string | undefined>();

  const disciplines = useQuery({ queryKey: ['disciplines'], queryFn: fetchDisciplines });
  const rows = useQuery({
    queryKey: ['leaderboard', code],
    queryFn: () => fetchLeaderboard(code),
  });

  return (
    <View style={styles.flex}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        <View style={styles.filterRow}>
          <Chip label="Alle" active={!code} onPress={() => setCode(undefined)} />
          {(disciplines.data ?? []).map((d) => (
            <Chip
              key={d.id}
              label={d.code}
              active={code === d.code}
              onPress={() => setCode(d.code)}
            />
          ))}
        </View>
      </ScrollView>

      {rows.isLoading ? (
        <Loading />
      ) : !rows.data?.length ? (
        <Empty text="Noch keine gewerteten Matches." />
      ) : (
        <FlatList
          data={rows.data}
          keyExtractor={(r) => `${r.discipline_id}-${r.shooter_id}`}
          contentContainerStyle={styles.list}
          refreshing={rows.isRefetching}
          onRefresh={() => rows.refetch()}
          ListHeaderComponent={
            <View style={[styles.row, styles.head]}>
              <Text style={[styles.pos, type.muted]}>#</Text>
              <Text style={[styles.grow, type.muted]}>Schütze</Text>
              <Text style={[styles.num, type.muted]}>Rating</Text>
              <Text style={[styles.num, type.muted]}>S/N</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.pos}>{item.position}</Text>
              <View style={styles.grow}>
                <Text style={styles.name}>
                  {item.display_name}
                  {item.is_provisional ? ' *' : ''}
                </Text>
                <Text style={type.muted}>
                  {item.country_code} · {item.discipline}
                </Text>
              </View>
              <Text style={[styles.num, styles.rating]}>{Math.round(item.rating)}</Text>
              <Text style={[styles.num, type.muted]}>
                {item.wins}/{item.losses}
              </Text>
            </View>
          )}
          ListFooterComponent={
            <Text style={styles.note}>
              * vorläufig — die Einstufung ist noch unsicher, weil zu wenige Matches
              gewertet wurden.
            </Text>
          }
        />
      )}
    </View>
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
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterRow: { flexDirection: 'row', gap: space.sm, padding: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { ...type.muted, fontWeight: '600' },
  chipTextActive: { color: colors.textInverse },
  list: { padding: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  head: { borderBottomWidth: 2 },
  pos: { width: 34, ...type.body, fontWeight: '700' },
  grow: { flex: 1 },
  name: { ...type.body, fontWeight: '600' },
  num: { width: 60, textAlign: 'right', ...type.body },
  rating: { fontWeight: '700' },
  note: { ...type.muted, marginTop: space.md },
});
