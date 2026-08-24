import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar, Card, Empty, Form, Hint, Kicker, LargeTitle, Loading, Meta } from '@/components/ui';
import { fetchPublicProfileByHandle, fetchReliability, fetchShooterRatings } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/**
 * A shooter's public page: who they are, and how they are rated.
 *
 * Reachable from anywhere a name appears — a season table, a club roster, the
 * leaderboard — which is also why it asks nothing of read_profiles beyond what
 * those screens already show: this is the same is_public gate, just read on
 * its own rather than joined into a list.
 */
export default function PublicShooterScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const t = useTheme();

  const profile = useQuery({
    queryKey: ['public-profile', handle],
    queryFn: () => fetchPublicProfileByHandle(handle),
  });

  const ratings = useQuery({
    queryKey: ['shooter-ratings', profile.data?.id],
    queryFn: () => fetchShooterRatings(profile.data!.id),
    enabled: !!profile.data,
  });

  const reliability = useQuery({
    queryKey: ['shooter-reliability', profile.data?.id],
    queryFn: () => fetchReliability(profile.data!.id),
    enabled: !!profile.data,
  });

  if (profile.isLoading) return <Loading />;
  if (!profile.data) return <Empty text="This shooter's profile is not public, or does not exist." />;

  const p = profile.data;

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.ground }}
      contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space.md,
          marginTop: t.space.md,
          marginBottom: t.space.xl,
        }}
      >
        <Avatar name={p.display_name} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[t.text.title, { color: t.colors.ink }]} numberOfLines={2}>
            {p.display_name}
          </Text>
          {p.club ? (
            <Link href={{ pathname: '/club/[slug]', params: { slug: p.club.slug } }} asChild>
              <Pressable>
                <Meta>
                  {p.country_code} · {p.club.name}
                </Meta>
              </Pressable>
            </Link>
          ) : (
            <Meta>{p.country_code}</Meta>
          )}
        </View>
      </View>

      {p.bio ? (
        <Card>
          <Meta>{p.bio}</Meta>
        </Card>
      ) : null}

      <Kicker>Ratings</Kicker>
      {ratings.isLoading ? (
        <Loading />
      ) : !ratings.data?.length ? (
        <Card>
          <Meta>No rated matches yet — nobody has been compared with this shooter.</Meta>
        </Card>
      ) : (
        ratings.data.map((row) => (
          <View
            key={row.discipline_id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space.md,
              paddingVertical: 11,
              borderBottomWidth: 1,
              borderBottomColor: t.colors.hairline,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
                <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                  {row.discipline}
                </Text>
                {row.is_provisional ? (
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
              <Meta>
                #{row.position} · {row.wins}W {row.losses}L
                {row.draws > 0 ? ` ${row.draws}D` : ''}
              </Meta>
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
              {Math.round(row.rating)}
            </Text>
            <View style={{ width: 46 }}>
              <Form events={row.recent_form} />
            </View>
          </View>
        ))
      )}

      {reliability.data && reliability.data.confirmations_due > 0 ? (
        <Hint>
          Checked {reliability.data.confirmation_rate_pct}% of opponents' photos (
          {reliability.data.confirmations_given} of {reliability.data.confirmations_due}).
        </Hint>
      ) : null}
    </ScrollView>
  );
}
