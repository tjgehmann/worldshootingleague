import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, Text, TextInput, View } from 'react-native';

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
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatScore } from '@/lib/format';
import {
  confirmSubmission,
  createSignedPhotoUrl,
  fetchBoutDetail,
  fetchBoutSubmissions,
  raiseDispute,
} from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/**
 * The step that replaces automated scoring: look at the opponent's photo, say
 * whether the numbers match it. Disputing opens a referee case and stops the
 * result from being rated until it is closed.
 */
export default function ConfirmScreen() {
  const { id: boutId } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTheme();

  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({ queryKey: ['bout', boutId], queryFn: () => fetchBoutDetail(boutId) });
  const submissions = useQuery({
    queryKey: ['submissions', [boutId]],
    queryFn: () => fetchBoutSubmissions([boutId]),
  });

  const theirs = (submissions.data ?? []).find((s) => s.shooter_id !== userId);

  const photoUrl = useQuery({
    queryKey: ['photo', theirs?.photo_path],
    queryFn: () => createSignedPhotoUrl(theirs!.photo_path!),
    enabled: !!theirs?.photo_path,
  });

  const decide = useMutation({
    mutationFn: async (accepted: boolean) => {
      if (!theirs || !userId || !detail.data) throw new Error('Nothing to check');

      if (accepted) {
        await confirmSubmission(theirs.id, userId, true);
      } else {
        await confirmSubmission(theirs.id, userId, false, reason);
        await raiseDispute(boutId, detail.data.match.id, userId, reason);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['confirmed'] });
      await queryClient.invalidateQueries({ queryKey: ['match'] });
      await queryClient.invalidateQueries({ queryKey: ['reliability'] });
      router.back();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not be saved'),
  });

  if (detail.isLoading || submissions.isLoading) return <Loading />;
  if (!detail.data || !theirs) {
    return <Empty text="Your opponent's result is not visible yet." />;
  }

  const { match, bout } = detail.data;
  const mode = match.discipline.scoring_mode;
  const opponent = match.shooter_a === userId ? match.profile_b : match.profile_a;

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.ground }}
      contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
    >
      <Kicker>
        Series {bout.index} · reported {formatDateTime(theirs.shot_at)}
      </Kicker>
      <LargeTitle>Does this match?</LargeTitle>

      {error ? <Note tone="error">{error}</Note> : null}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
          <Avatar name={opponent.display_name} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
              {opponent.display_name}
            </Text>
            <Meta>reported</Meta>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[t.text.scoreSm, { color: t.colors.ink }]}>
              {formatScore(theirs.total, mode)}
            </Text>
            {theirs.inner_tens != null ? <Meta>{theirs.inner_tens} inner tens</Meta> : null}
          </View>
        </View>
      </Card>

      {photoUrl.data ? (
        <Image
          source={{ uri: photoUrl.data }}
          style={{
            width: '100%',
            height: 280,
            borderRadius: t.radius.xl,
            backgroundColor: t.colors.surfaceAlt,
            marginBottom: t.space.md,
          }}
          resizeMode="contain"
        />
      ) : (
        <View
          style={{
            width: '100%',
            height: 200,
            borderRadius: t.radius.xl,
            backgroundColor: t.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: t.space.md,
          }}
        >
          <Text style={{ color: t.colors.inkFaint, fontSize: 14 }}>
            Photo could not be loaded.
          </Text>
        </View>
      )}

      {disputing ? (
        <View>
          <Text style={[t.text.label, { color: t.colors.inkFaint, marginBottom: 7 }]}>
            What is wrong?
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            placeholder="The photo shows 98.4 but 104.4 was reported."
            placeholderTextColor={t.colors.inkFaint}
            style={{
              backgroundColor: t.colors.surfaceAlt,
              borderRadius: t.radius.lg,
              padding: t.space.lg,
              minHeight: 100,
              textAlignVertical: 'top',
              color: t.colors.ink,
              fontSize: 15,
            }}
          />
          <Button
            label="Call a referee"
            onPress={() => decide.mutate(false)}
            disabled={reason.trim().length < 10}
            busy={decide.isPending}
          />
          <Button label="Never mind" variant="text" onPress={() => setDisputing(false)} />
        </View>
      ) : (
        <View>
          <Button
            label="Looks right"
            variant="positive"
            onPress={() => decide.mutate(true)}
            busy={decide.isPending}
          />
          <Button
            label="Does not match — call a referee"
            variant="quiet"
            onPress={() => setDisputing(true)}
          />
          <Hint center>
            Without a reply it counts as confirmed after 48 hours, but not as your check.
          </Hint>
        </View>
      )}
    </ScrollView>
  );
}
