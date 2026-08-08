import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

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
import { seasonUrl } from '@/lib/links';
import {
  enterClubInSeason,
  fetchClubStandings,
  fetchMyClubSeasonEntries,
  fetchMySeasonEntry,
  fetchSeasonBySlug,
  fetchSeasonStandings,
  joinSeason,
  leaveSeason,
  withdrawClubFromSeason,
  type ClubSeasonEntry,
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
    enabled: !!session && !isTeam,
  });

  const clubEntries = useQuery({
    queryKey: ['club-season-entries', slug, session?.user.id],
    queryFn: () => fetchMyClubSeasonEntries(slug),
    enabled: !!session && isTeam,
  });

  const clubEntry = useMutation({
    mutationFn: ({ clubId, leaving }: { clubId: string; leaving: boolean }) =>
      leaving ? withdrawClubFromSeason(slug, clubId) : enterClubInSeason(slug, clubId),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['club-season-entries', slug] });
      await queryClient.invalidateQueries({ queryKey: ['season', slug] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'That did not work'),
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

      {isTeam ? (
        <ClubEntry
          state={s.state}
          signedIn={!!session}
          clubs={clubEntries.data ?? []}
          pending={clubEntry.isPending}
          onPress={(clubId, leaving) => clubEntry.mutate({ clubId, leaving })}
        />
      ) : (
        <Entry
          state={s.state}
          signedIn={!!session}
          joined={entry.data?.joined ?? false}
          pending={join.isPending}
          onPress={(leaving) => join.mutate(leaving)}
        />
      )}

      <ShareLink slug={slug} name={s.name} />

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
  signedIn,
  joined,
  pending,
  onPress,
}: {
  state: string;
  signedIn: boolean;
  joined: boolean;
  pending: boolean;
  onPress: (leaving: boolean) => void;
}) {
  const open = state === 'registration' || state === 'running';
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



/**
 * A club is entered by an official, not by its members one at a time.
 *
 * The eligible count is shown because pair_team_round() skips a club that
 * cannot field a full team, and it skips it silently — a club that entered and
 * is then never paired would have no way of knowing why.
 */
function ClubEntry({
  state,
  signedIn,
  clubs,
  pending,
  onPress,
}: {
  state: string;
  signedIn: boolean;
  clubs: ClubSeasonEntry[];
  pending: boolean;
  onPress: (clubId: string, leaving: boolean) => void;
}) {
  const open = state === 'registration' || state === 'running';

  if (!signedIn) {
    return (
      <Card>
        <Meta>
          A club competition: an official enters the club and its lineup is picked by
          rating.
        </Meta>
        <Link href="/(auth)/sign-in" asChild>
          <Button label="Sign in" onPress={() => {}} />
        </Link>
      </Card>
    );
  }

  if (!open) return null;

  if (clubs.length === 0) {
    return (
      <Card>
        <Meta>
          Club against club. You are not in a club yet — join one, or start one, and an
          official can enter it here.
        </Meta>
        <Link href="/club/join" asChild>
          <Button label="Join or start a club" onPress={() => {}} />
        </Link>
      </Card>
    );
  }

  return (
    <View>
      {clubs.map((club) => (
        <ClubRow key={club.club_id} club={club} pending={pending} onPress={onPress} state={state} />
      ))}
    </View>
  );
}

function ClubRow({
  club,
  pending,
  onPress,
  state,
}: {
  club: ClubSeasonEntry;
  pending: boolean;
  onPress: (clubId: string, leaving: boolean) => void;
  state: string;
}) {
  const t = useTheme();
  const size = club.team_size ?? 0;
  const short = club.eligible < size;

  return (
    <Card tone={club.entered ? 'positive' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
        <Avatar name={club.short_name ?? club.club_name} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
            {club.club_name}
          </Text>
          <Meta>
            {club.eligible} shooting for the club
            {size ? ` · ${size} to a team` : ''}
          </Meta>
        </View>
        {club.entered ? <Pill tone="won">Entered</Pill> : null}
      </View>

      {short ? (
        <Hint>
          {`Only ${club.eligible} of the ${size} a team needs compete for this club. Until that
            changes the club is skipped when rounds are paired — members have to pick it as
            the club they shoot for in their profile.`}
        </Hint>
      ) : null}

      {!club.is_official ? (
        <Hint>An official of the club enters it. Ask one of them.</Hint>
      ) : club.entered ? (
        <Button
          label="Withdraw the club"
          variant="text"
          size="sm"
          busy={pending}
          onPress={() => onPress(club.club_id, true)}
        />
      ) : (
        <>
          <Button
            label={`Enter ${club.short_name ?? club.club_name}`}
            busy={pending}
            onPress={() => onPress(club.club_id, false)}
          />
          {state === 'running' ? (
            <Hint center>Already running — your club is paired from the next round.</Hint>
          ) : null}
        </>
      )}
    </Card>
  );
}

/**
 * The link a club captain pastes into a chat group.
 *
 * Recruiting happens in WhatsApp, not in an app store, so this has to be one
 * tap. Where the link points is decided in lib/links.ts; the important part is
 * that it always points at something a person without the app can read.
 */
function ShareLink({ slug, name }: { slug: string; name: string }) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);
  const url = seasonUrl(slug);

  async function share() {
    const message = `${name} — ${url}`;

    if (Platform.OS === 'web') {
      const nav = typeof navigator === 'undefined' ? undefined : navigator;
      if (nav?.share) {
        await nav.share({ title: name, url }).catch(() => {});
        return;
      }
      await nav?.clipboard?.writeText(url).catch(() => {});
      setCopied(true);
      return;
    }

    await Share.share({ message }).catch(() => {});
  }

  return (
    <Pressable onPress={share} accessibilityRole="button">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[t.text.name, { color: t.colors.ink }]}>
              {copied ? 'Link copied' : 'Invite shooters'}
            </Text>
            <Meta numberOfLines={1}>{url}</Meta>
          </View>
          <Text style={{ color: t.colors.accent, fontSize: 15, fontWeight: '600' }}>
            {copied ? 'Copied' : 'Share'}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}
