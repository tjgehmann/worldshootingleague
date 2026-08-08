import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { ScrollView, Switch, Text, View } from 'react-native';
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
import { registerForPush } from '@/lib/notifications';
import {
  fetchMyClubs,
  fetchProfile,
  fetchRatings,
  fetchReliability,
  setPushEnabled,
} from '@/lib/queries';
import { TAB_BAR_CLEARANCE, useTheme } from '@/lib/theme';

export default function ProfileScreen() {
  const { userId, signOut } = useAuth();
  const t = useTheme();
  const queryClient = useQueryClient();

  const profile = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  });
  const clubs = useQuery({
    queryKey: ['my-clubs', userId],
    queryFn: () => fetchMyClubs(userId!),
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

  const togglePush = useMutation({
    mutationFn: async (enabled: boolean) => {
      await setPushEnabled(userId!, enabled);
      // Turning it back on is also the moment to (re)claim a device token.
      if (enabled) await registerForPush(userId!).catch(() => {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  });

  if (profile.isLoading) return <Loading />;

  const rate = reliability.data?.confirmation_rate_pct ?? null;
  const club = profile.data?.club ?? null;
  const memberships = clubs.data ?? [];

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
              {club ? ` · ${club.name}` : ''}
            </Meta>
          </View>
        </View>

        <Kicker>Club</Kicker>
        <Card>
          {club ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
                <Avatar name={club.short_name ?? club.name} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                    {club.name}
                  </Text>
                  <Meta>
                    {club.country_code}
                    {club.city ? ` · ${club.city}` : ''}
                  </Meta>
                </View>
                <Pill tone="won">Competing for</Pill>
              </View>
              <Hint>
                Team matches are shot for this club. Its officials pick the lineup by
                rating.
              </Hint>
            </>
          ) : (
            <>
              <Meta>
                You are not shooting for a club yet. A club is how twenty people join at
                once instead of one at a time — and it is what team matches are built on.
              </Meta>
              <Link href="/club/join" asChild>
                <Button label="Join or start a club" onPress={() => {}} />
              </Link>
            </>
          )}
        </Card>

        {memberships.length > 1 ? (
          <Hint>
            You are a member of {memberships.length} clubs. Only the one above fields you
            in team matches.
          </Hint>
        ) : null}

        {(ratings.data ?? []).length === 0 ? (
          <>
            <Kicker>Ratings</Kicker>
            <Card>
              <Meta>No rated matches yet.</Meta>
            </Card>
          </>
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

        <Kicker>Notifications</Kicker>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: t.space.md }}>
              <Text style={[t.text.name, { color: t.colors.ink }]}>Push</Text>
              <Meta>When it is your turn, when results are in, before a deadline.</Meta>
            </View>
            <Switch
              value={profile.data?.notify_push ?? true}
              onValueChange={(v) => togglePush.mutate(v)}
              disabled={togglePush.isPending}
              trackColor={{ true: t.colors.accentSolid, false: t.colors.surfaceAlt }}
            />
          </View>
          <Hint>
            With push off, a match can quietly run out of time. Deadlines are not
            extended.
          </Hint>
        </Card>

        <Button label="Sign out" variant="text" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
