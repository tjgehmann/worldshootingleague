import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  Card,
  Hint,
  Kicker,
  Label,
  Loading,
  Meta,
  Meter,
  Pill,
  StatRow,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchProfile, fetchRatings, fetchReliability } from '@/lib/queries';
import { TAB_BAR_CLEARANCE, useTheme } from '@/lib/theme';

export default function ProfileScreen() {
  const { userId, signOut } = useAuth();
  const t = useTheme();

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

  const rate = reliability.data?.confirmation_rate_pct ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.ground }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.xl,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space.md,
            marginTop: t.space.lg,
            marginBottom: t.space.xl,
          }}
        >
          <Avatar name={profile.data?.display_name ?? ''} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[t.text.title, { color: t.colors.ink }]} numberOfLines={1}>
              {profile.data?.display_name}
            </Text>
            <Meta>
              {profile.data?.country_code}
              {profile.data?.club ? ` · ${profile.data.club}` : ''}
            </Meta>
          </View>
        </View>

        {(ratings.data ?? []).length === 0 ? (
          <Card>
            <Meta>No rated matches yet.</Meta>
          </Card>
        ) : (
          (ratings.data ?? []).map((r) => (
            <View key={r.discipline_id}>
              <Kicker>{r.code}</Kicker>
              <Card>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    marginBottom: t.space.md,
                  }}
                >
                  <View>
                    <Label>Rating</Label>
                    <Text style={[t.text.scoreSm, { color: t.colors.ink, marginTop: 2 }]}>
                      {Math.round(r.rating)}
                    </Text>
                  </View>
                  {r.rd > 110 ? <Pill tone="wait">Provisional</Pill> : null}
                </View>
                <StatRow
                  items={[
                    { value: String(r.matches_played), label: 'Matches' },
                    { value: `${r.wins}/${r.draws}/${r.losses}`, label: 'W/D/L' },
                    { value: `±${Math.round(r.rd)}`, label: 'Deviation' },
                  ]}
                />
              </Card>
            </View>
          ))
        )}

        <Kicker>Reliability</Kicker>
        <Card>
          {rate === null ? (
            <Meta>Nothing to check yet.</Meta>
          ) : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Meta>Checked yourself</Meta>
                <Text style={[t.text.points, { color: t.colors.positive }]}>{rate}%</Text>
              </View>
              <Meter percent={rate} />
              <Hint>
                You confirmed {reliability.data?.confirmations_given} of{' '}
                {reliability.data?.confirmations_due} opponent results yourself.
              </Hint>
            </>
          )}
        </Card>

        <Button label="Sign out" variant="text" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
