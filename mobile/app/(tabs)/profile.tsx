import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, Share, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  Card,
  Hairline,
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
import { LEGAL_LIST } from '@/lib/legal';
import {
  exportMyData,
  fetchMyClubs,
  fetchMyForm,
  fetchProfile,
  fetchRatings,
  fetchReliability,
  requestAccountDeletion,
  setEmailEnabled,
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
  const form = useQuery({
    queryKey: ['form', userId],
    queryFn: fetchMyForm,
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

  const toggleEmail = useMutation({
    mutationFn: (enabled: boolean) => setEmailEnabled(userId!, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
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
          <Link href="/profile/edit" asChild>
            <Button label="Edit" variant="quiet" size="sm" onPress={() => {}} style={{ marginTop: 0 }} />
          </Link>
        </View>

        <Kicker>Club</Kicker>
        <Card>
          {club ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
                <Avatar name={club.short_name ?? club.name} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* Club names are long and the last word is usually the year
                      that distinguishes two clubs in the same town, so this
                      wraps rather than truncating. */}
                  <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={2}>
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
              {/* Shown to everyone: the screen itself says whether you may use
                  it, because club_invites_active() returns nothing to a member
                  who is not an official. Hiding it would leave a new owner
                  hunting for the one thing they need. */}
              <Link href={{ pathname: '/club/invite', params: { club: club.id } }} asChild>
                <Button label="Invite people" variant="quiet" size="sm" onPress={() => {}} />
              </Link>
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

        {(form.data ?? []).length > 0 ? (
          <>
            <Kicker>Your shooting</Kicker>
            <Card>
              {(form.data ?? []).map((row, i) => (
                <View key={row.discipline_id}>
                  {i > 0 ? <Hairline /> : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-end',
                    }}
                  >
                    <View>
                      <Label>{row.discipline_code}</Label>
                      <Text style={[t.text.scoreSm, { color: t.colors.ink, marginTop: 2 }]}>
                        {row.average ?? '–'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Meta>
                        {row.series} series · best {row.best ?? '–'}
                      </Meta>
                      <Meta>
                        {row.compared} compared
                        {row.practice > 0 ? ` · ${row.practice} practice` : ''}
                      </Meta>
                    </View>
                  </View>
                </View>
              ))}
              <Hint>
                Every series you report counts here, whether or not somebody was there to
                compare with. The rating below only moves when one was.
              </Hint>
            </Card>
          </>
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
          <Hairline />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: t.space.md }}>
              <Text style={[t.text.name, { color: t.colors.ink }]}>Email</Text>
              <Meta>The same messages, to the address you signed up with.</Meta>
            </View>
            <Switch
              value={profile.data?.notify_email ?? true}
              onValueChange={(v) => toggleEmail.mutate(v)}
              disabled={toggleEmail.isPending}
              trackColor={{ true: t.colors.accentSolid, false: t.colors.surfaceAlt }}
            />
          </View>
          <Hint>
            With both off, a match can quietly run out of time. Deadlines are not
            extended. On a phone that has not added the app to its home screen, email is
            the only one that arrives.
          </Hint>
        </Card>

        <Kicker>Your data</Kicker>
        <AccountData onDeleted={signOut} />

        <Kicker>The small print</Kicker>
        <Card>
          {LEGAL_LIST.map((doc) => (
            <Link key={doc.slug} href={{ pathname: '/legal/[doc]', params: { doc: doc.slug } }} asChild>
              <Button label={doc.title} variant="text" size="sm" onPress={() => {}} />
            </Link>
          ))}
        </Card>

        {/* The tabs have no route back to the public league page — signing in
            trades it for "my matches" and nothing here otherwise leads back
            to seasons running, entries, recent results across the league. */}
        <Link href="/(public)" asChild>
          <Button label="View the public league page" variant="quiet" onPress={() => {}} />
        </Link>

        <Button label="Sign out" variant="text" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The two rights that are buttons rather than an email address: a copy of
 * everything, and deletion. Deleting asks twice, because it cannot be undone
 * and because the second tap is where the consequence is spelled out.
 */
function AccountData({ onDeleted }: { onDeleted: () => void }) {
  const t = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const exporting = useMutation({
    mutationFn: exportMyData,
    onSuccess: async (data) => {
      const text = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        // Share is not available in every browser; the clipboard always is.
        await navigator.clipboard?.writeText(text).catch(() => {});
        setNote('Your data is on the clipboard as JSON.');
      } else {
        await Share.share({ message: text });
      }
    },
    onError: () => setNote('The export could not be built. Try again later.'),
  });

  const deleting = useMutation({
    mutationFn: () => requestAccountDeletion(),
    onSuccess: onDeleted,
    onError: () => setNote('The deletion could not be recorded. Try again later.'),
  });

  return (
    <Card>
      {note ? <Meta>{note}</Meta> : null}

      <Button
        label="Download my data"
        variant="quiet"
        size="sm"
        busy={exporting.isPending}
        onPress={() => exporting.mutate()}
      />

      {confirming ? (
        <>
          <Hint>
            Your name, handle, date of birth and profile go immediately. Results you have
            already shot stay, because a match is your opponent's record too — they will
            no longer carry your name. This cannot be undone.
          </Hint>
          <Button
            label="Yes, delete my account"
            variant="quiet"
            size="sm"
            busy={deleting.isPending}
            onPress={() => deleting.mutate()}
            style={{ backgroundColor: t.colors.negativeTint }}
          />
          <Button
            label="Keep it"
            variant="text"
            size="sm"
            onPress={() => setConfirming(false)}
          />
        </>
      ) : (
        <Button
          label="Delete my account"
          variant="text"
          size="sm"
          onPress={() => setConfirming(true)}
        />
      )}
    </Card>
  );
}
