import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  ColLabel,
  Hint,
  Kicker,
  Loading,
  Meta,
  RingMark,
  Rule,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatPoints } from '@/lib/format';
import { fetchRecentResults, fetchSeasons, fetchShooterNames } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/**
 * The front door for anyone without an account.
 *
 * This is the only page a shooter ever arrives at cold — from a club chat
 * group, a forum post, a link a captain sent round — so it has three jobs the
 * old card list did none of: say what the format is in one line, prove the
 * league has people in it, and offer a way in that is not a sign-in wall.
 *
 * Everything here comes from views that expose settled results only; a match in
 * progress is exactly what the blind reveal protects.
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

  const nameOf = (id: string) => names.data?.[id] ?? '…';

  // Liquidity, stated rather than implied. An empty ladder is the thing that
  // kills a league, so the page says out loud how many people are in it — and
  // when the answer is nobody, it asks rather than pretending.
  const running = (seasons.data ?? []).filter((s) => s.state === 'running');
  const shooters = running.reduce((n, s) => n + (s.shooters_entered ?? 0), 0);
  const clubs = running.reduce((n, s) => n + (s.clubs_entered ?? 0), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.ground }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.xl,
          // Web and Android report no top inset, so the wordmark would
          // otherwise sit on the very edge of the screen.
          paddingTop: t.space.md,
          paddingBottom: t.space.xxl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space.sm,
            marginBottom: t.space.xxl,
          }}
        >
          <RingMark size={18} color={t.colors.ink} />
          <Text
            style={{
              color: t.colors.ink,
              fontFamily: t.fonts.display,
              fontSize: 12,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            World Shooting League
          </Text>
        </View>

        <Text style={[t.text.data, { color: t.colors.inkFaint, marginBottom: t.space.sm }]}>
          AIR RIFLE · AIR PISTOL · SMALLBORE
        </Text>
        <Text
          style={{
            color: t.colors.ink,
            fontFamily: t.fonts.displayHeavy,
            fontSize: 34,
            lineHeight: 36,
            letterSpacing: -1,
          }}
        >
          Shoot at your own club. Get compared to someone who did the same.
        </Text>
        <Text
          style={{
            color: t.colors.inkMuted,
            fontFamily: t.fonts.body,
            fontSize: 16,
            lineHeight: 24,
            marginTop: t.space.lg,
          }}
        >
          You declare, you shoot your ten, you report the score with a photo of the display.
          Neither number is visible until both are in — so there is nothing to aim at but the
          target.
        </Text>

        {!session ? (
          <Link href="/(auth)/sign-in" asChild>
            <Button label="Find a match tonight" onPress={() => {}} style={{ marginTop: t.space.xl }} />
          </Link>
        ) : (
          <Link href="/(tabs)" asChild>
            <Button label="Go to my matches" onPress={() => {}} style={{ marginTop: t.space.xl }} />
          </Link>
        )}

        {/* Proof, before anything is asked of the reader. */}
        <View style={{ marginTop: t.space.xxl }}>
          <Rule heavy />
          <View style={{ flexDirection: 'row', paddingTop: t.space.md }}>
            <Figure value={String(running.length)} label={running.length === 1 ? 'Season running' : 'Seasons running'} />
            {/* Entries, not people: a shooter in two seasons is two entries, and
                calling that "shooters" would be a number the page cannot stand
                behind. */}
            <Figure value={String(shooters)} label="Season entries" divider />
            <Figure value={String(clubs)} label="Club entries" divider />
          </View>
        </View>

        {/* How it works: this genuinely is a sequence, so it is numbered. */}
        <View style={{ marginTop: t.space.xxl }}>
          <Kicker>An evening at the range, end to end</Kicker>
          <Step n="01" title="Declare">
            One tap before you step up to the firing point. That starts a two-hour window on our
            clock, not your phone's.
          </Step>
          <Step n="02" title="Shoot your ten">
            Your normal session, your own club, your own lane. Nobody is waiting on the other end.
          </Step>
          <Step n="03" title="Report">
            One number and a photo of the display. Works with no reception — it queues on the phone
            and sends itself.
          </Step>
          <Step n="04" title="Get compared">
            The moment somebody near your rating reports, both numbers are revealed at once and the
            match is scored.
          </Step>
        </View>

        <View style={{ marginTop: t.space.xxl }}>
          <Kicker>Open now</Kicker>
          {seasons.isLoading ? (
            <Loading />
          ) : seasons.error ? (
            <Meta>Could not reach the league right now. Pull down to try again.</Meta>
          ) : !seasons.data?.length ? (
            <Meta>
              No seasons are open yet. The first one starts as soon as there are enough shooters to
              pair.
            </Meta>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: t.space.md, paddingBottom: 7 }}>
                <View style={{ flex: 1 }}>
                  <ColLabel>Season</ColLabel>
                </View>
                <View style={{ width: 92 }}>
                  <ColLabel align="right">Progress</ColLabel>
                </View>
              </View>
              <Rule heavy />
              {seasons.data.map((s) => (
                <Link
                  key={s.id}
                  href={{ pathname: '/season/[slug]', params: { slug: s.slug } }}
                  asChild
                >
                  <Pressable>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.space.md,
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: t.colors.hairline,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                          {s.name}
                        </Text>
                        <Text
                          style={[t.text.data, { color: t.colors.inkFaint, marginTop: 2 }]}
                          numberOfLines={1}
                        >
                          {s.discipline_name} ·{' '}
                          {s.competition_type === 'team'
                            ? `${s.clubs_entered} clubs`
                            : `${s.shooters_entered} shooters`}
                        </Text>
                      </View>
                      <Text
                        style={[
                          t.text.data,
                          {
                            width: 92,
                            textAlign: 'right',
                            color: s.state === 'running' ? t.colors.accent : t.colors.inkFaint,
                          },
                        ]}
                      >
                        {s.state === 'running'
                          ? `Round ${s.rounds_paired}/${s.round_count}`
                          : s.state}
                      </Text>
                    </View>
                  </Pressable>
                </Link>
              ))}
            </>
          )}
        </View>

        <View style={{ marginTop: t.space.xxl }}>
          <Kicker>Recent results</Kicker>
          {results.isLoading ? (
            <Loading />
          ) : results.error ? (
            <Meta>Could not reach the league right now.</Meta>
          ) : !results.data?.length ? (
            <Meta>No matches have been decided yet. Be the first to report a series tonight.</Meta>
          ) : (
            <>
              <Rule heavy />
              {results.data.map((r) => (
                <Link
                  key={r.match_id}
                  href={{ pathname: '/match/[id]', params: { id: r.match_id } }}
                  asChild
                >
                  <Pressable>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.space.md,
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: t.colors.hairline,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
                          {nameOf(r.shooter_a)} v {nameOf(r.shooter_b)}
                        </Text>
                        <Text
                          style={[t.text.data, { color: t.colors.inkFaint, marginTop: 2 }]}
                          numberOfLines={1}
                        >
                          {r.discipline} · {formatDateTime(r.settled_at)}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: t.colors.ink,
                          fontFamily: t.fonts.display,
                          fontSize: 20,
                          letterSpacing: -0.4,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {formatPoints(r.points_a)} : {formatPoints(r.points_b)}
                      </Text>
                    </View>
                  </Pressable>
                </Link>
              ))}
            </>
          )}
        </View>

        <Hint>
          Anyone can read seasons, tables and finished matches. Photos and matches in progress stay
          with the two shooters.
        </Hint>
      </ScrollView>
    </SafeAreaView>
  );
}

function Figure({ value, label, divider }: { value: string; label: string; divider?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        paddingLeft: divider ? t.space.md : 0,
        borderLeftWidth: divider ? 1 : 0,
        borderLeftColor: t.colors.hairline,
      }}
    >
      <Text
        style={{
          color: t.colors.ink,
          fontFamily: t.fonts.displayHeavy,
          fontSize: 26,
          letterSpacing: -0.8,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Text style={[t.text.label, { color: t.colors.inkFaint, marginTop: 5 }]}>{label}</Text>
    </View>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingVertical: t.space.md,
        borderTopWidth: 1,
        borderTopColor: t.colors.hairline,
      }}
    >
      <Text style={[t.text.data, { color: t.colors.accent }]}>{n}</Text>
      <Text
        style={{
          color: t.colors.ink,
          fontFamily: t.fonts.display,
          fontSize: 17,
          letterSpacing: -0.2,
          marginTop: 5,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: t.colors.inkMuted,
          fontFamily: t.fonts.body,
          fontSize: 14.5,
          lineHeight: 21,
          marginTop: 3,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
