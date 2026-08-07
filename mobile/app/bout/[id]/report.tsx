import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import {
  Button,
  Card,
  Empty,
  Field,
  Hint,
  Kicker,
  LargeTitle,
  Loading,
  Note,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatScore } from '@/lib/format';
import { fetchBoutDetail, fetchRecentForm, submitResult } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/** Above this gap to the shooter's own average, ask once more before sending. */
const SUSPICIOUS_MARGIN = 5;

export default function ReportScreen() {
  const { id: boutId } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTheme();

  const [total, setTotal] = useState('');
  const [tens, setTens] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string; fromCamera: boolean } | null>(null);
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

  // The same bounds validate_submission() enforces, checked here so the shooter
  // finds out before the upload rather than after it.
  const subTen = discipline.scoring_mode === 'integer' ? 9 : 9.9;
  const reachable =
    !numbersEntered ||
    (totalValue >= tensValue * 10 &&
      totalValue <=
        tensValue * discipline.max_shot_value + (discipline.shot_count - tensValue) * subTen);

  const average = form.data?.average ?? null;
  const farAboveForm = numbersValid && average !== null && totalValue - average > SUSPICIOUS_MARGIN;

  const ready = numbersValid && reachable && !!photo && (!farAboveForm || warningAccepted);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.ground }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Kicker>
          Serie {detail.data.bout.index} · {discipline.shot_count} Schuss
        </Kicker>
        <LargeTitle>Ergebnis melden</LargeTitle>

        {error ? <Note tone="error">{error}</Note> : null}

        <Card>
          <View style={{ flexDirection: 'row', gap: t.space.md, alignItems: 'flex-start' }}>
            <Field
              label="Gesamt"
              value={total}
              onChangeText={(v) => {
                setTotal(v);
                setWarningAccepted(false);
              }}
              keyboardType="decimal-pad"
              placeholder={discipline.scoring_mode === 'integer' ? '95' : '104,4'}
              big
              style={{ flex: 1, marginBottom: 0 }}
            />
            <Field
              label="Zehner"
              value={tens}
              onChangeText={(v) => {
                setTens(v);
                setWarningAccepted(false);
              }}
              keyboardType="number-pad"
              placeholder="8"
              big
              style={{ width: 104, marginBottom: 0 }}
            />
          </View>
          <Hint>
            Höchstens {formatScore(maxTotal, discipline.scoring_mode)} · Zehner entscheiden bei
            Gleichstand
          </Hint>
        </Card>

        {numbersEntered && !reachable ? (
          <Note tone="warn">
            {`${total} lässt sich mit ${tens} Zehnern nicht schießen. Sieh nochmal auf die Anzeige.`}
          </Note>
        ) : null}

        {farAboveForm && average !== null ? (
          <View>
            <Note tone="warn">
              {`${formatScore(totalValue - average, discipline.scoring_mode)} über deinem Schnitt. Deine letzten ${form.data?.series} Serien liegen bei ${formatScore(average, discipline.scoring_mode)}. Falls das stimmt: weiter. Falls nicht, ist jetzt der Moment.`}
            </Note>
            {!warningAccepted ? (
              <Button
                label="Stimmt so"
                variant="quiet"
                size="sm"
                onPress={() => setWarningAccepted(true)}
              />
            ) : null}
          </View>
        ) : null}

        <Text style={[t.text.label, { color: t.colors.inkFaint, marginTop: t.space.md, marginBottom: 7 }]}>
          Nachweis
        </Text>
        {photo ? (
          <Image
            source={{ uri: photo.uri }}
            style={{ width: '100%', height: 200, borderRadius: t.radius.xl, backgroundColor: t.colors.surfaceAlt }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: '100%',
              height: 200,
              borderRadius: t.radius.xl,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: t.colors.hairline,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: t.colors.inkFaint, fontSize: 14 }}>Noch kein Foto</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: t.space.sm }}>
          <Button
            label={photo ? 'Neu aufnehmen' : 'Anzeige fotografieren'}
            variant="quiet"
            size="sm"
            onPress={() => capture(true)}
            style={{ flex: 1 }}
          />
          <Button
            label="Galerie"
            variant="quiet"
            size="sm"
            onPress={() => capture(false)}
            style={{ flex: 1 }}
          />
        </View>

        <Button
          label="Melden"
          onPress={() => submit.mutate()}
          disabled={!ready}
          busy={submit.isPending}
          style={{ marginTop: t.space.lg }}
        />
        <Hint center>Danach nicht mehr änderbar.</Hint>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
