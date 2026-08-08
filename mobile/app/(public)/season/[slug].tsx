import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  Avatar,
  Button,
  Card,
  Empty,
  Hint,
  Kicker,
  LargeTitle,
  Loading,
  Meta,
  Note,
  Pill,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  fetchClubStandings,
  fetchMySeasonEntry,
  fetchSeasonBySlug,
  fetchSeasonStandings,
  joinSeason,
  leaveSeason,
} from '@/lib/queries';
import { useTheme } from '@/lib/theme';

const POSITION = {
  width: 24,
  fontSize: 14,
  fontWeight: '700' as const,
  fontVariant: ['tabular-nums' as const],
};

/** A season table, readable by anyone with the link. */
export default function PublicSeasonScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();

  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const season = useQuery({ queryKey: ['season', slug], queryFn: () => fetchSeasonBySlug(slug) });
  const isTeam = season.data?.competition_type === 'team';

  const entry = useQuery({
    queryKey: ['season-entry', slug, session?.user.id],
    queryFn: () => fetchMySeasonEntry(slug),
    enabled: !!session,
  });

  const join = useMutation({
    mutationFn: async (leaving: boolean) => {
      if (leaving) await leaveSeason(slug);
      else await joinSeason(slug);
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['season-entry', slug] });
      await queryClient.invalidateQueries({ queryKey: ['season', slug] });
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'That did not work'),
  });

  const individual = useQuery({
    queryKey: ['season-standings', season.data?.id],
    queryFn: () => fetchSeasonStandings(season.data!.id),
    enabled: !!season.data && !isTeam,
  });
  const teams = useQuery({
    queryKey: ['club-standings', season.data?.id],
    queryFn: () => fetchClubStandings(season.data!.id),
    enabled: !!season.data && isTeam,
  });

  if (season.isLoading) return <Loading />;
  if (!season.data) return <Empty text="Season not found." />;

  const s = season.data;
  const rows = isTeam ? teams.data : individual.data;
  const loading = isTeam ? teams.isLoading : individual.isLoading;

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.ground }}
      contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
    >
      <Kicker>
        {s.discipline_name} · {s.format_name}
      </Kicker>
      <LargeTitle>{s.name}</LargeTitle>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Meta>{isTeam ? 'Clubs entered' : 'Shooters entered'}</Meta>
            <Text style={[t.text.scoreSm, { color: t.colors.ink, marginTop: 2 }]}>
              {isTeam ? s.clubs_entered : s.shooters_entered}
            </Text>
          </View>
          <Pill tone={s.state === 'running' ? 'turn' : s.state === 'finished' ? 'won' : 'wait'}>
            {s.state === 'running' ? `Round ${s.rounds_paired} of ${s.round_count}` : s.state}
          </Pill>
        </View>
        {isTeam && s.team_size ? (
          <Hint>Teams of {s.team_size}, board against board.</Hint>
        ) : null}
      </Card>

      {error ? <Note tone="error">{error}</Note> : null}

      <Entry
        state={s.state}
        isTeam={isTeam}
        signedIn={!!session}
        joined={entry.data?.joined ?? false}
        pending={join.isPending}
        onPress={(leaving) => join.mutate(leaving)}
      />

      <Kicker>Table</Kicker>
      {loading ? (
        <Loading />
      ) : !rows?.length ? (
        <Card>
          <Meta>Nothing decided yet.</Meta>
        </Card>
      ) : isTeam ? (
        (teams.data ?? []).map((row) => (
          <View
            key={row.club_id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space.md,
              paddingVertical: 11,
              borderBottomWidth: 1,
              borderBottomColor: t.colors.hairline,
            }}
          >
            <Text style={[POSITION, { color: row.position === 1 ? t.colors.accent : t.colors.inkFaint }]}>
              {row.position}
            </Text>
            <Avatar name={row.short_name ?? row.club_name} size={34} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                {row.club_name}
              </Text>
              <Meta>
                {row.wins}/{row.draws}/{row.losses} · boards {row.board_points_for}:
                {row.board_points_against}
              </Meta>
            </View>
            <Text style={[t.text.points, { color: t.colors.ink }]}>{row.table_points}</Text>
          </View>
        ))
      ) : (
        (individual.data ?? []).map((row) => (
          <View
            key={row.shooter_id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space.md,
              paddingVertical: 11,
              borderBottomWidth: 1,
              borderBottomColor: t.colors.hairline,
            }}
          >
            <Text style={[POSITION, { color: row.position === 1 ? t.colors.accent : t.colors.inkFaint }]}>
              {row.position}
            </Text>
            <Avatar name={row.display_name} size={34} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                {row.display_name}
              </Text>
              <Meta>
                {row.country_code}
                {row.club_name ? ` · ${row.club_name}` : ''} · {row.wins}/{row.draws}/
                {row.losses}
              </Meta>
            </View>
            <Text style={[t.text.points, { color: t.colors.ink }]}>{row.points}</Text>
          </View>
        ))
      )}

      <Hint>
        {isTeam
          ? 'Two points for a fixture won, one for a draw. Level on points is broken by board difference.'
          : 'One point for a match won, half for a draw.'}
      </Hint>
    </ScrollView>
  );
}

/**
 * The one thing a season page is for, if you are not just reading it.
 *
 * Joining a season that is already running is allowed: a ladder that turns
 * people away between rounds has no answer for whoever hears about it in week
 * three. They are paired from the next round.
 */
function Entry({
  state,
  isTeam,
  signedIn,
  joined,
  pending,
  onPress,
}: {
  state: string;
  isTeam: boolean;
  signedIn: boolean;
  joined: boolean;
  pending: boolean;
  onPress: (leaving: boolean) => void;
}) {
  const open = state === 'registration' || state === 'running';

  if (isTeam) {
    return (
      <Card>
        <Meta>
          This is a club competition. A club official enters the club, and picks the lineup
          for each fixture.
        </Meta>
      </Card>
    );
  }

  if (!open) return null;

  if (!signedIn) {
    return (
      <Link href="/(auth)/sign-in" asChild>
        <Button label="Sign in to enter" onPress={() => {}} />
      </Link>
    );
  }

  if (joined) {
    return (
      <Card>
        <Meta>You are entered. The next round will pair you.</Meta>
        <Button
          label="Withdraw"
          variant="text"
          size="sm"
          busy={pending}
          onPress={() => onPress(true)}
        />
      </Card>
    );
  }

  return (
    <View>
      <Button label="Enter this season" busy={pending} onPress={() => onPress(false)} />
      <Hint center>
        {state === 'running'
          ? 'The season is already running — you are paired from the next round.'
          : 'Pairing starts when the season does.'}
      </Hint>
    </View>
  );
}


