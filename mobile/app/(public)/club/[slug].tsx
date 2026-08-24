import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar, Card, Empty, Hint, Kicker, LargeTitle, Loading, Meta, StatRow } from '@/components/ui';
import { fetchClubBySlug, fetchClubRoster } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/** A club's public page: who shoots for it, and how its fixtures went. */
export default function PublicClubScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();

  const club = useQuery({ queryKey: ['club', slug], queryFn: () => fetchClubBySlug(slug) });
  const roster = useQuery({
    queryKey: ['club-roster', club.data?.id],
    queryFn: () => fetchClubRoster(club.data!.id),
    enabled: !!club.data,
  });

  if (club.isLoading) return <Loading />;
  if (!club.data) return <Empty text="Club not found." />;

  const c = club.data;

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.ground }}
      contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md, marginBottom: t.space.xl }}>
        <Avatar name={c.short_name ?? c.name} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[t.text.title, { color: t.colors.ink }]} numberOfLines={2}>
            {c.name}
          </Text>
          <Meta>
            {c.country_code}
            {c.city ? ` · ${c.city}` : ''}
          </Meta>
        </View>
      </View>

      <Card>
        <StatRow
          items={[
            { value: String(c.shooters), label: 'Shooters' },
            { value: String(c.fixtures_played), label: 'Fixtures' },
            { value: String(c.fixtures_won), label: 'Won' },
          ]}
        />
      </Card>

      <Kicker>Roster</Kicker>
      {roster.isLoading ? (
        <Loading />
      ) : !roster.data?.length ? (
        <Card>
          <Meta>Nobody has joined yet.</Meta>
        </Card>
      ) : (
        (roster.data ?? []).map((member) => (
          <Link
            key={member.shooter.id}
            href={{ pathname: '/shooter/[handle]', params: { handle: member.shooter.handle } }}
            asChild
          >
            <Pressable>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.space.md,
                  paddingVertical: 11,
                  borderBottomWidth: 1,
                  borderBottomColor: t.colors.hairline,
                }}
              >
                <Avatar name={member.shooter.display_name} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                    {member.shooter.display_name}
                  </Text>
                  <Meta>{member.shooter.country_code}</Meta>
                </View>
                {member.role !== 'member' ? <Meta>{member.role}</Meta> : null}
              </View>
            </Pressable>
          </Link>
        ))
      )}

      <Hint>
        Lineups for team fixtures are drawn from the members who compete for this club,
        strongest first.
      </Hint>
    </ScrollView>
  );
}
