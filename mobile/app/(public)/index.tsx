import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Hint, Kicker, LargeTitle, Loading, Meta, Pill } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatPoints } from '@/lib/format';
import { fetchRecentResults, fetchSeasons, fetchShooterNames } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/**
 * The front door for anyone without an account.
 *
 * Results nobody can link to might as well not exist, so seasons, tables and
 * finished matches are readable signed out. Everything here comes from views
 * that expose settled results only — a match in progress is exactly what the
 * blind reveal protects.
 */
export default function PublicHomeScreen() {
  const t = useTheme();
  const { session } = useAuth();

  const seasons = useQuery({ queryKey: ['public-seasons'], queryFn: fetchSeasons });
  const results = useQuery({ queryKey: ['public-results'], queryFn: () => fetchRecentResults(12) });

  const names = useQuery({
    queryKey: ['shooter-names', results.data?.map((r) => r.match_id)],
    queryFn: () =>
      fetchShooterNames((results.data ?? []).flatMap((r) => [r.shooter_a, r.shooter_b])),
    enabled: !!results.data?.length,
  });

  const nameOf = (id: string) => names.data?.get(id) ?? '…';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.ground }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
      >
        <Kicker tone={t.colors.accent}>Challenging shooters</Kicker>
        <LargeTitle>World Shooting League</LargeTitle>
        <Meta>
          Shooters compete independently of time and place. Each shoots at their own club
          and reports the score; neither result is visible until both have submitted.
        </Meta>

        {!session ? (
          <Link href="/(auth)/sign-in" asChild>
            <Button label="Sign in to compete" onPress={() => {}} style={{ marginTop: t.space.lg }} />
          </Link>
        ) : (
          <Link href="/(tabs)" asChild>
            <Button label="Go to my matches" onPress={() => {}} style={{ marginTop: t.space.lg }} />
          </Link>
        )}

        <View style={{ height: t.space.xl }} />

        <Kicker>Seasons</Kicker>
        {seasons.isLoading ? (
          <Loading />
        ) : seasons.error ? (
          <Card>
            <Meta>Could not reach the league right now.</Meta>
          </Card>
        ) : !seasons.data?.length ? (
          <Card>
            <Meta>No seasons yet.</Meta>
          </Card>
        ) : (
          seasons.data.map((s) => (
            <Link key={s.id} href={{ pathname: '/season/[slug]', params: { slug: s.slug } }} asChild>
              <Pressable>
                <Card>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Meta>
                        {s.discipline_name} ·{' '}
                        {s.competition_type === 'team'
                          ? `${s.clubs_entered} clubs`
                          : `${s.shooters_entered} shooters`}
                      </Meta>
                    </View>
                    <Pill tone={s.state === 'running' ? 'turn' : s.state === 'finished' ? 'won' : 'wait'}>
                      {s.state === 'running'
                        ? `Round ${s.rounds_paired}/${s.round_count}`
                        : s.state}
                    </Pill>
                  </View>
                </Card>
              </Pressable>
            </Link>
          ))
        )}

        <Kicker>Recent results</Kicker>
        {results.isLoading ? (
          <Loading />
        ) : results.error ? (
          <Card>
            <Meta>Could not reach the league right now.</Meta>
          </Card>
        ) : !results.data?.length ? (
          <Card>
            <Meta>No matches have been decided yet.</Meta>
          </Card>
        ) : (
          results.data.map((r) => (
            <Link
              key={r.match_id}
              href={{ pathname: '/match/[id]', params: { id: r.match_id } }}
              asChild
            >
              <Pressable>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                        {nameOf(r.shooter_a)} v {nameOf(r.shooter_b)}
                      </Text>
                      <Meta>
                        {r.discipline} · {formatDateTime(r.settled_at)}
                      </Meta>
                    </View>
                    <Text style={[t.text.points, { color: t.colors.ink }]}>
                      {formatPoints(r.points_a)} : {formatPoints(r.points_b)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            </Link>
          ))
        )}

        <Hint>
          Anyone can read seasons, tables and finished matches. Photos and matches in
          progress stay with the two shooters.
        </Hint>
      </ScrollView>
    </SafeAreaView>
  );
}
