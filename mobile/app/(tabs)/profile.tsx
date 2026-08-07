import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Loading, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchProfile, fetchRatings, fetchReliability } from '@/lib/queries';
import { colors, space, type } from '@/lib/theme';

export default function ProfileScreen() {
  const { userId, signOut } = useAuth();

  const profile = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  });
  const ratings = useQuery({
    queryKey: ['ratings', userId],
    queryFn: () => fetchRatings(userId!),
    enabled: !!userId,
  });
  const reliability = useQuery({
    queryKey: ['reliability', userId],
    queryFn: () => fetchReliability(userId!),
    enabled: !!userId,
  });

  if (profile.isLoading) return <Loading />;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.name}>{profile.data?.display_name}</Text>
      <Text style={styles.sub}>
        {profile.data?.country_code}
        {profile.data?.club ? ` · ${profile.data.club}` : ''}
      </Text>

      <SectionTitle>Ligen</SectionTitle>
      {(ratings.data ?? []).length === 0 ? (
        <Text style={type.muted}>Noch keine gewerteten Matches.</Text>
      ) : (
        (ratings.data ?? []).map((r) => (
          <Card key={r.discipline_id}>
            <Text style={styles.code}>{r.code}</Text>
            <View style={styles.stats}>
              <Stat label="Rating" value={String(Math.round(r.rating))} />
              <Stat label="±" value={String(Math.round(r.rd))} />
              <Stat label="Matches" value={String(r.matches_played)} />
              <Stat label="S/U/N" value={`${r.wins}/${r.draws}/${r.losses}`} />
            </View>
          </Card>
        ))
      )}

      <SectionTitle>Zuverlässigkeit</SectionTitle>
      <Card>
        <Text style={type.body}>
          {reliability.data?.confirmation_rate_pct === null ||
          reliability.data?.confirmation_rate_pct === undefined
            ? 'Noch nichts zu bestätigen gewesen.'
            : `${reliability.data.confirmation_rate_pct}% der Ergebnisse deiner Gegner hast du selbst geprüft (${reliability.data.confirmations_given} von ${reliability.data.confirmations_due}).`}
        </Text>
        <Text style={[type.muted, { marginTop: space.sm }]}>
          Wer nicht prüft, blockiert nichts — die Bestätigung wird nach Ablauf automatisch
          gesetzt. Sie zählt dann aber nicht als deine.
        </Text>
      </Card>

      <Button label="Abmelden" variant="secondary" onPress={signOut} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, paddingBottom: space.xl },
  name: { ...type.title, marginTop: space.md },
  sub: { ...type.muted, marginTop: space.xs },
  code: { ...type.heading, marginBottom: space.sm },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text },
});
