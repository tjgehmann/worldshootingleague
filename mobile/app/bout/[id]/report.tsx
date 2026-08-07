import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Banner, Button, Empty, Field, Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatScore } from '@/lib/format';
import { fetchBoutDetail, fetchRecentForm, submitResult } from '@/lib/queries';
import { colors, radius, space, type } from '@/lib/theme';

/** Above this gap to the shooter's own average, ask twice before submitting. */
const SUSPICIOUS_MARGIN = 5;

export default function ReportScreen() {
  const { id: boutId } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [total, setTotal] = useState('');
  const [tens, setTens] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string; fromCamera: boolean } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [warningAccepted, setWarningAccepted] = useState(false);

  const detail = useQuery({ queryKey: ['bout', boutId], queryFn: () => fetchBoutDetail(boutId) });
  const discipline = detail.data?.match.discipline;

  const form = useQuery({
    queryKey: ['form', userId, discipline?.id],
    queryFn: () => fetchRecentForm(userId!, discipline!.id),
    enabled: !!userId && !!discipline,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!photo || !userId) throw new Error('Foto fehlt');
      await submitResult({
        boutId,
        shooterId: userId,
        total: Number(total.replace(',', '.')),
        tens: Number(tens),
        photoBase64: photo.base64,
        fromCamera: photo.fromCamera,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['match'] });
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
      await queryClient.invalidateQueries({ queryKey: ['submissions'] });
      router.back();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Meldung abgelehnt'),
  });

  async function capture(fromCamera: boolean) {
    setError(null);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError('Ohne Zugriff auf die Kamera lässt sich kein Nachweis aufnehmen.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, base64: true });

    const asset = result.canceled ? undefined : result.assets[0];
    if (asset?.base64) setPhoto({ uri: asset.uri, base64: asset.base64, fromCamera });
  }

  if (detail.isLoading) return <Loading />;
  if (!detail.data || !discipline) return <Empty text="Serie nicht gefunden." />;

  const totalValue = Number(total.replace(',', '.'));
  const tensValue = Number(tens);
  const maxTotal = discipline.shot_count * discipline.max_shot_value;

  const numbersEntered = total.length > 0 && tens.length > 0;
  const numbersValid =
    Number.isFinite(totalValue) &&
    Number.isFinite(tensValue) &&
    totalValue >= 0 &&
    totalValue <= maxTotal &&
    tensValue >= 0 &&
    tensValue <= discipline.shot_count;

  // Same bounds the database enforces, checked here so the shooter finds out
  // before the upload rather than after it.
  const subTen = discipline.scoring_mode === 'integer' ? 9 : 9.9;
  const reachable =
    !numbersEntered ||
    (totalValue >= tensValue * 10 &&
      totalValue <= tensValue * discipline.max_shot_value +
        (discipline.shot_count - tensValue) * subTen);

  const average = form.data?.average ?? null;
  const farAboveForm =
    numbersValid && average !== null && totalValue - average > SUSPICIOUS_MARGIN;

  const ready = numbersValid && reachable && !!photo && (!farAboveForm || warningAccepted);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={type.heading}>
          {discipline.code} · Serie {detail.data.bout.index}
        </Text>
        <Text style={[type.muted, styles.intro]}>
          {discipline.shot_count} Schuss. Trag ein, was auf der Anzeige steht, und
          fotografiere sie.
        </Text>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Field
          label="Gesamtergebnis"
          value={total}
          onChangeText={(v) => {
            setTotal(v);
            setWarningAccepted(false);
          }}
          keyboardType="decimal-pad"
          placeholder={discipline.scoring_mode === 'integer' ? '95' : '104,4'}
          hint={`höchstens ${formatScore(maxTotal, discipline.scoring_mode)}`}
        />

        <Field
          label="Anzahl Zehner"
          value={tens}
          onChangeText={(v) => {
            setTens(v);
            setWarningAccepted(false);
          }}
          keyboardType="number-pad"
          placeholder="8"
          hint="Schüsse mit 10 oder besser — entscheidet bei Gleichstand"
        />

        {numbersEntered && !reachable ? (
          <Banner tone="warn">
            {`${total} lässt sich mit ${tens} Zehnern nicht schießen. Sieh nochmal auf die Anzeige.`}
          </Banner>
        ) : null}

        {farAboveForm && average !== null ? (
          <View>
            <Banner tone="warn">
              {`Das liegt ${formatScore(totalValue - average, discipline.scoring_mode)} über deinem Schnitt aus den letzten ${form.data?.series} Serien (${formatScore(average, discipline.scoring_mode)}). Vertippt?`}
            </Banner>
            {!warningAccepted ? (
              <Button
                label="Stimmt so"
                variant="secondary"
                onPress={() => setWarningAccepted(true)}
              />
            ) : null}
          </View>
        ) : null}

        <Text style={styles.photoLabel}>Nachweis</Text>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={type.muted}>Noch kein Foto</Text>
          </View>
        )}

        <Button label={photo ? 'Neu aufnehmen' : 'Anzeige fotografieren'} onPress={() => capture(true)} />
        <Button label="Aus der Galerie wählen" variant="secondary" onPress={() => capture(false)} />

        <View style={styles.submit}>
          <Button
            label="Melden"
            onPress={() => submit.mutate()}
            disabled={!ready}
            busy={submit.isPending}
          />
          <Text style={[type.muted, styles.note]}>
            Nach dem Absenden lässt sich die Meldung nicht mehr ändern. Das Ergebnis
            deines Gegners wird erst sichtbar, wenn er ebenfalls gemeldet hat.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.md, paddingBottom: space.xl },
  intro: { marginTop: space.xs, marginBottom: space.lg },
  photoLabel: { ...type.muted, fontWeight: '600', marginTop: space.md, marginBottom: space.xs },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  placeholder: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: { marginTop: space.lg },
  note: { marginTop: space.sm, lineHeight: 19 },
});
