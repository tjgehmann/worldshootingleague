import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { Button, Card, Empty, Hint, Kicker, LargeTitle, Loading, Meta, Note } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import {
  createClubInvite,
  fetchClub,
  fetchClubInvites,
  fetchClubRoster,
  revokeClubInvite,
  type ClubInvite,
} from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/**
 * Getting the rest of the club in.
 *
 * A club that cannot invite anybody is a club of one, and until this screen
 * existed the only way to make a code was for an operator to write SQL. The
 * code is deliberately short and speakable — this gets read out at a range, not
 * copied from a screen — and it is minted server-side so nobody can pick a
 * guessable one.
 */
export default function ClubInviteScreen() {
  const { club: clubId } = useLocalSearchParams<{ club: string }>();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const t = useTheme();

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const club = useQuery({ queryKey: ['club', clubId], queryFn: () => fetchClub(clubId) });
  const roster = useQuery({
    queryKey: ['club-roster', clubId],
    queryFn: () => fetchClubRoster(clubId),
  });
  const invites = useQuery({
    queryKey: ['club-invites', clubId],
    queryFn: () => fetchClubInvites(clubId),
    enabled: !!userId,
  });

  const mint = useMutation({
    mutationFn: () => createClubInvite(clubId),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['club-invites', clubId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'The code could not be made'),
  });

  const revoke = useMutation({
    mutationFn: (code: string) => revokeClubInvite(code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['club-invites', clubId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'That did not work'),
  });

  if (club.isLoading || invites.isLoading) return <Loading />;
  if (!club.data) return <Empty text="Club not found." />;

  // club_invites_active() returns nothing to anyone who is not an official, so
  // an empty list is either "none yet" or "not yours". The button tells them
  // which: the server refuses it with a readable reason.
  const codes = invites.data ?? [];
  const members = roster.data?.length ?? 0;

  async function share(invite: ClubInvite) {
    const message =
      `Join ${club.data!.name} in the World Shooting League.\n` +
      `Open the app, tap "Join or start a club" and enter the code ${invite.code}.`;

    if (Platform.OS === 'web') {
      const nav = typeof navigator === 'undefined' ? undefined : navigator;
      if (nav?.share) {
        await nav.share({ text: message }).catch(() => {});
        return;
      }
      await nav?.clipboard?.writeText(invite.code).catch(() => {});
      setCopied(invite.code);
      return;
    }

    await Share.share({ message }).catch(() => {});
  }

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.ground }}
      contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
    >
      <Kicker>{members === 1 ? '1 member' : `${members} members`}</Kicker>
      <LargeTitle>Invite to {club.data.short_name ?? club.data.name}</LargeTitle>

      {error ? <Note tone="error">{error}</Note> : null}

      {codes.length === 0 ? (
        <Card>
          <Meta>
            No code is out at the moment. Make one, read it out at the range, and it works
            for the next fortnight.
          </Meta>
        </Card>
      ) : (
        codes.map((invite) => (
          <Card key={invite.code}>
            <Pressable onPress={() => share(invite)} accessibilityRole="button">
              <Text
                style={{
                  color: t.colors.ink,
                  fontSize: 34,
                  fontWeight: '700',
                  letterSpacing: 6,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {invite.code}
              </Text>
              <Meta>
                {copied === invite.code ? 'Copied. ' : ''}
                Good until {formatDateTime(invite.expires_at)}
                {invite.max_uses ? ` · used ${invite.uses} of ${invite.max_uses}` : ''}
              </Meta>
            </Pressable>

            <View style={{ flexDirection: 'row', gap: t.space.sm }}>
              <Button
                label="Share"
                variant="quiet"
                size="sm"
                onPress={() => share(invite)}
                style={{ flex: 1 }}
              />
              <Button
                label="Withdraw"
                variant="text"
                size="sm"
                busy={revoke.isPending}
                onPress={() => revoke.mutate(invite.code)}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ))
      )}

      <Button
        label={codes.length === 0 ? 'Make an invite code' : 'Make another'}
        variant={codes.length === 0 ? 'primary' : 'quiet'}
        busy={mint.isPending}
        onPress={() => mint.mutate()}
      />
      <Hint>
        Anyone with the code joins the club, so it is worth withdrawing one that has been
        passed around further than you meant. Only an official can make or withdraw a code.
      </Hint>

      <View style={{ height: t.space.lg }} />
      <Kicker>Who is in</Kicker>
      {roster.isLoading ? (
        <Loading />
      ) : (
        <Card>
          {(roster.data ?? []).map((member) => (
            <View
              key={member.shooter.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: t.colors.ink, fontSize: 15 }} numberOfLines={1}>
                {member.shooter.display_name}
              </Text>
              <Meta>{member.role === 'member' ? member.shooter.country_code : member.role}</Meta>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
