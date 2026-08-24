import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar, Card, Empty, Form, Hint, Kicker, LargeTitle, Loading, Meta, Pill } from '@/components/ui';
import { formatDateTime, formatPoints } from '@/lib/format';
import {
  fetchPublicProfileByHandle,
  fetchReliability,
  fetchShooterNames,
  fetchShooterRatings,
  fetchShooterRecentMatches,
} from '@/lib/queries';
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
  // Which discipline's recent matches are open — one at a time, since they are
  // there to answer "how has this gone lately", not to be read all at once.
  const [expanded, setExpanded] = useState<string | null>(null);

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
        ratings.data.map((row) => {
          const isOpen = expanded === row.discipline;
          return (
            <View key={row.discipline_id}>
              <Pressable
                onPress={() => setExpanded(isOpen ? null : row.discipline)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.space.md,
                  paddingVertical: 11,
                  borderBottomWidth: isOpen ? 0 : 1,
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
              </Pressable>
              {isOpen ? (
                <RecentMatches shooterId={row.shooter_id} disciplineCode={row.discipline} />
              ) : null}
            </View>
          );
        })
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

/**
 * What tapping a discipline is for: how this has actually gone lately, not
 * just the number it settled on. A round paired by a season and a pairing
 * that came out of declaring a series with nobody in sight are the same kind
 * of row here — both are already just settled matches — round_id is what
 * tells them apart.
 */
function RecentMatches({
  shooterId,
  disciplineCode,
}: {
  shooterId: string;
  disciplineCode: string;
}) {
  const t = useTheme();

  const matches = useQuery({
    queryKey: ['shooter-recent-matches', shooterId, disciplineCode],
    queryFn: () => fetchShooterRecentMatches(shooterId, disciplineCode),
  });

  const opponentIds = (matches.data ?? []).map((m) =>
    m.shooter_a === shooterId ? m.shooter_b : m.shooter_a,
  );
  const names = useQuery({
    queryKey: ['shooter-names', opponentIds],
    queryFn: () => fetchShooterNames(opponentIds),
    enabled: opponentIds.length > 0,
  });

  return (
    <View
      style={{
        paddingLeft: t.space.lg,
        paddingBottom: t.space.md,
        borderBottomWidth: 1,
        borderBottomColor: t.colors.hairline,
      }}
    >
      {matches.isLoading ? (
        <Loading />
      ) : !matches.data?.length ? (
        <Meta>Nothing settled yet in this discipline.</Meta>
      ) : (
        matches.data.map((m) => {
          const isA = m.shooter_a === shooterId;
          const opponentId = isA ? m.shooter_b : m.shooter_a;
          const myPoints = isA ? m.points_a : m.points_b;
          const theirPoints = isA ? m.points_b : m.points_a;
          const won = m.winner_id === shooterId;

          return (
            <Link
              key={m.match_id}
              href={{ pathname: '/match/[id]', params: { id: m.match_id } }}
              asChild
            >
              <Pressable>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.space.sm,
                    paddingVertical: 8,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                      {names.data?.[opponentId] ?? '…'}
                    </Text>
                    <Meta numberOfLines={1}>
                      {m.round_id ? 'Season round' : 'Open series'} ·{' '}
                      {formatDateTime(m.settled_at)}
                    </Meta>
                  </View>
                  <Pill tone={won ? 'won' : 'lost'}>
                    {formatPoints(myPoints)}:{formatPoints(theirPoints)}
                  </Pill>
                </View>
              </Pressable>
            </Link>
          );
        })
      )}
    </View>
  );
}
