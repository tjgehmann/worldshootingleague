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
  const [innerTens, setInnerTens] = useState('');
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
      if (!photo || !userId) throw new Error('Photo missing');
      await submitResult({
        boutId,
        shooterId: userId,
        total: Number(total.replace(',', '.')),
        innerTens: requiresInnerTens ? Number(innerTens) : null,
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
    onError: (e) => setError(e instanceof Error ? e.message : 'Submission rejected'),
  });

  async function capture(fromCamera: boolean) {
    setError(null);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError('Without camera access there is no way to capture proof.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, base64: true });

    const asset = result.canceled ? undefined : result.assets[0];
    if (asset?.base64) setPhoto({ uri: asset.uri, base64: asset.base64, fromCamera });
  }

  if (detail.isLoading) return <Loading />;
  if (!detail.data || !discipline) return <Empty text="Series not found." />;

  // Inner tens are the ISSF tiebreak for full-ring scores. Disciplines scored
  // in tenths break their own ties, so the field is not shown there at all.
  const requiresInnerTens = discipline.requires_inner_tens;

  const totalValue = Number(total.replace(',', '.'));
  const innerTensValue = Number(innerTens);
  const maxTotal = discipline.shot_count * discipline.max_shot_value;

  const numbersValid =
    Number.isFinite(totalValue) &&
    total.length > 0 &&
    totalValue >= 0 &&
    totalValue <= maxTotal &&
    (!requiresInnerTens ||
      (innerTens.length > 0 &&
        Number.isFinite(innerTensValue) &&
        innerTensValue >= 0 &&
        innerTensValue <= discipline.shot_count));

  // The same floor validate_submission() enforces, checked here so the shooter
  // finds out before the upload rather than after it. Every inner ten is a ten,
  // so it contributes at least 10 to the total. There is no useful ceiling: a
  // shot that is not an inner ten can still score a full ten.
  const reachable =
    !requiresInnerTens || !numbersValid || totalValue >= innerTensValue * 10;

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
          Series {detail.data.bout.index} · {discipline.shot_count} shots
        </Kicker>
        <LargeTitle>Report result</LargeTitle>

        {error ? <Note tone="error">{error}</Note> : null}

        <Card>
          <View style={{ flexDirection: 'row', gap: t.space.md, alignItems: 'flex-start' }}>
            <Field
              label="Total"
              value={total}
              onChangeText={(v) => {
                setTotal(v);
                setWarningAccepted(false);
              }}
              keyboardType="decimal-pad"
              placeholder={discipline.scoring_mode === 'integer' ? '95' : '104.4'}
              big
              style={{ flex: 1, marginBottom: 0 }}
            />
            {requiresInnerTens ? (
              <Field
                label="Inner tens"
                value={innerTens}
                onChangeText={setInnerTens}
                keyboardType="number-pad"
                placeholder="4"
                big
                style={{ width: 112, marginBottom: 0 }}
              />
            ) : null}
          </View>
          <Hint>
            {requiresInnerTens
              ? `At most ${formatScore(maxTotal, discipline.scoring_mode)} · inner tens break a tie`
              : `At most ${formatScore(maxTotal, discipline.scoring_mode)} · decimal scoring breaks its own ties`}
          </Hint>
        </Card>

        {!reachable ? (
          <Note tone="warn">
            {`${innerTens} inner tens cannot add up to only ${total}. Check the display again.`}
          </Note>
        ) : null}

        {farAboveForm && average !== null ? (
          <View>
            <Note tone="warn">
              {`${formatScore(totalValue - average, discipline.scoring_mode)} above your average. Your last ${form.data?.series} series sit at ${formatScore(average, discipline.scoring_mode)}. If that is right, carry on. If not, now is the moment.`}
            </Note>
            {!warningAccepted ? (
              <Button
                label="That is right"
                variant="quiet"
                size="sm"
                onPress={() => setWarningAccepted(true)}
              />
            ) : null}
          </View>
        ) : null}

        <Text style={[t.text.label, { color: t.colors.inkFaint, marginTop: t.space.md, marginBottom: 7 }]}>
          Proof
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
            <Text style={{ color: t.colors.inkFaint, fontSize: 14 }}>No photo yet</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: t.space.sm }}>
          <Button
            label={photo ? 'Retake' : 'Photograph the display'}
            variant="quiet"
            size="sm"
            onPress={() => capture(true)}
            style={{ flex: 1 }}
          />
          <Button
            label="Library"
            variant="quiet"
            size="sm"
            onPress={() => capture(false)}
            style={{ flex: 1 }}
          />
        </View>

        <Button
          label="Submit"
          onPress={() => submit.mutate()}
          disabled={!ready}
          busy={submit.isPending}
          style={{ marginTop: t.space.lg }}
        />
        <Hint center>Cannot be changed afterwards.</Hint>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
