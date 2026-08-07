import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, Empty, Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatScore } from '@/lib/format';
import {
  confirmSubmission,
  createSignedPhotoUrl,
  fetchBoutDetail,
  fetchBoutSubmissions,
  raiseDispute,
} from '@/lib/queries';
import { colors, radius, space, type } from '@/lib/theme';

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
      if (!theirs || !userId || !detail.data) throw new Error('Nichts zu prüfen');

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
    onError: (e) => setError(e instanceof Error ? e.message : 'Konnte nicht gespeichert werden'),
  });

  if (detail.isLoading || submissions.isLoading) return <Loading />;
  if (!detail.data || !theirs) {
    return <Empty text="Das Ergebnis des Gegners ist noch nicht sichtbar." />;
  }

  const { match } = detail.data;
  const mode = match.discipline.scoring_mode;
  const opponent = match.shooter_a === userId ? match.profile_b : match.profile_a;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={type.heading}>{opponent.display_name} hat gemeldet</Text>

      {error ? <Banner tone="error">{error}</Banner> : null}

      <View style={styles.numbers}>
        <View style={styles.number}>
          <Text style={styles.value}>{formatScore(theirs.total, mode)}</Text>
          <Text style={type.muted}>Gesamt</Text>
        </View>
        <View style={styles.number}>
          <Text style={styles.value}>{theirs.tens}</Text>
          <Text style={type.muted}>Zehner</Text>
        </View>
      </View>

      <Text style={[type.muted, styles.shotAt]}>
        Geschossen am {formatDateTime(theirs.shot_at)}
      </Text>

      {photoUrl.data ? (
        <Image source={{ uri: photoUrl.data }} style={styles.photo} resizeMode="contain" />
      ) : (
        <View style={styles.placeholder}>
          <Text style={type.muted}>Foto konnte nicht geladen werden.</Text>
        </View>
      )}

      <Banner tone="info">
        Stimmen die Zahlen mit dem Foto überein? Wenn nicht, entscheidet ein
        Schiedsrichter — bis dahin wird das Match nicht gewertet.
      </Banner>

      {disputing ? (
        <View>
          <Text style={styles.reasonLabel}>Was stimmt nicht?</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            style={styles.reason}
            placeholder="Auf dem Foto steht 98,4, gemeldet wurden 104,4."
            placeholderTextColor={colors.textMuted}
          />
          <Button
            label="Schiedsrichter rufen"
            variant="danger"
            onPress={() => decide.mutate(false)}
            disabled={reason.trim().length < 10}
            busy={decide.isPending}
          />
          <Button label="Doch nicht" variant="secondary" onPress={() => setDisputing(false)} />
        </View>
      ) : (
        <View>
          <Button label="Passt" onPress={() => decide.mutate(true)} busy={decide.isPending} />
          <Button label="Stimmt nicht" variant="secondary" onPress={() => setDisputing(true)} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, paddingBottom: space.xl },
  numbers: { flexDirection: 'row', marginVertical: space.md },
  number: { flex: 1, alignItems: 'center' },
  value: { fontSize: 32, fontWeight: '700', color: colors.text },
  shotAt: { textAlign: 'center', marginBottom: space.md },
  photo: {
    width: '100%',
    height: 340,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: space.md,
  },
  placeholder: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  reasonLabel: { ...type.muted, fontWeight: '600', marginBottom: space.xs },
  reason: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    minHeight: 96,
    textAlignVertical: 'top',
    color: colors.text,
    fontSize: 15,
  },
});
