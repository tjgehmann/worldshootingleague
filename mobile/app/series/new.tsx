import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { Button, Card, Field, Hint, Kicker, LargeTitle, Loading, Meta, Note, Pill } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatScore, timeLeft } from '@/lib/format';
import { uploadSeriesPhoto } from '@/lib/photos';
import {
  declareOpenSeries,
  fetchDisciplines,
  fetchLiveOpenSeries,
  reportOpenSeries,
  withdrawOpenSeries,
} from '@/lib/queries';
import { useTheme } from '@/lib/theme';
import type { Discipline } from '@/lib/types';

/**
 * Shooting something that counts, right now, with nobody to wait for.
 *
 * Three states on one screen, because they are one errand: pick a discipline,
 * shoot it, report it.
 *
 * The declaration is not ceremony. It opens the window the series has to be
 * fired in, and the database refuses anything shot before it. That is what
 * stops the obvious move — shoot ten, report the best — and it is the reason
 * the number next to your name means anything.
 */
export default function NewSeriesScreen() {
  const { userId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTheme();

  const [total, setTotal] = useState('');
  const [innerTens, setInnerTens] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; fromCamera: boolean; at: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disciplines = useQuery({ queryKey: ['disciplines'], queryFn: fetchDisciplines });
  const live = useQuery({
    queryKey: ['open-series', userId],
    queryFn: () => fetchLiveOpenSeries(userId!),
    enabled: !!userId,
    // So the waiting card notices when somebody takes the series.
    refetchInterval: 20_000,
  });

  const series = live.data ?? null;
  const discipline = disciplines.data?.find((d) => d.id === series?.discipline_id);
  const requiresInnerTens = discipline?.requires_inner_tens ?? false;

  const declare = useMutation({
    mutationFn: (disciplineId: string) => declareOpenSeries(disciplineId),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['open-series', userId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not start a series'),
  });

  const report = useMutation({
    mutationFn: async () => {
      const path = await uploadSeriesPhoto(series!.id, userId!, photo!.uri);

      await reportOpenSeries({
        id: series!.id,
        total: Number(total.replace(',', '.')),
        innerTens: requiresInnerTens ? Number(innerTens) : null,
        photoPath: path,
        shotAt: photo!.at,
        fromCamera: photo!.fromCamera,
      });
    },
    onSuccess: async () => {
      setTotal('');
      setInnerTens('');
      setPhoto(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['open-series', userId] });
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not report the series'),
  });

  const abandon = useMutation({
    mutationFn: () => withdrawOpenSeries(series!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['open-series', userId] });
    },
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
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });

    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) setPhoto({ uri: asset.uri, fromCamera, at: new Date() });
  }

  if (live.isLoading || disciplines.isLoading) return <Loading />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.ground }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Kicker tone={t.colors.accent}>No opponent needed</Kicker>
        <LargeTitle>
          {!series ? 'Shoot a series' : series.state === 'open' ? 'Shoot it now' : 'Waiting'}
        </LargeTitle>

        {error ? <Note tone="error">{error}</Note> : null}

        {!series ? (
          <Pick
            disciplines={disciplines.data ?? []}
            busy={declare.isPending}
            onPick={(d) => declare.mutate(d.id)}
          />
        ) : series.state === 'open' ? (
          <>
            <Card tone="positive">
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Text style={[t.text.name, { color: t.colors.ink }]}>
                  {discipline?.name ?? 'Series'}
                </Text>
                <Pill tone="turn">{timeLeft(series.report_by)}</Pill>
              </View>
              <Hint>
                Shoot your {discipline?.shot_count ?? 10} shots and report them before the
                window closes. A series fired before you started this one is refused — that
                is what keeps the ranking worth having.
              </Hint>
            </Card>

            <Card>
              <View style={{ flexDirection: 'row', gap: t.space.md, alignItems: 'flex-start' }}>
                <Field
                  label="Total"
                  value={total}
                  onChangeText={setTotal}
                  keyboardType="decimal-pad"
                  placeholder={discipline?.scoring_mode === 'integer' ? '95' : '104.4'}
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
              {discipline ? (
                <Hint>
                  At most{' '}
                  {formatScore(
                    discipline.shot_count * discipline.max_shot_value,
                    discipline.scoring_mode,
                  )}
                </Hint>
              ) : null}
            </Card>

            {photo ? (
              <Image
                source={{ uri: photo.uri }}
                style={{
                  width: '100%',
                  height: 200,
                  borderRadius: t.radius.xl,
                  backgroundColor: t.colors.surfaceAlt,
                }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  width: '100%',
                  height: 160,
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
              label="Report it"
              onPress={() => report.mutate()}
              busy={report.isPending}
              disabled={!photo || total.trim().length === 0 || (requiresInnerTens && !innerTens)}
              style={{ marginTop: t.space.lg }}
            />
            <Hint center>
              This one needs a connection: the window is 45 minutes, so a report that waited
              for a signal would arrive too late to count. A season match does not — that one
              waits on your phone.
            </Hint>
            <Button
              label="Never mind"
              variant="text"
              onPress={() => abandon.mutate()}
              busy={abandon.isPending}
            />
          </>
        ) : (
          <>
            <Card>
              <Meta>Your series</Meta>
              <Text style={[t.text.score, { color: t.colors.ink }]}>
                {formatScore(series.total, discipline?.scoring_mode ?? 'decimal')}
              </Text>
              {series.inner_tens != null ? <Meta>{series.inner_tens} inner tens</Meta> : null}
              <Hint>
                Locked in, and nobody can see it. The moment somebody at a similar rating
                reports one, both numbers are revealed at once and the match is scored.
              </Hint>
            </Card>

            <Button label="Back to my matches" onPress={() => router.replace('/(tabs)')} />
            <Button
              label="Withdraw the series"
              variant="text"
              onPress={() => abandon.mutate()}
              busy={abandon.isPending}
            />
            <Hint center>
              If nobody turns up within three days it is let go and counts as practice.
            </Hint>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Pick({
  disciplines,
  busy,
  onPick,
}: {
  disciplines: Discipline[];
  busy: boolean;
  onPick: (d: Discipline) => void;
}) {
  const t = useTheme();
  return (
    <View>
      <Meta>
        Pick what you are about to shoot. The clock starts now, so do this at the firing
        point rather than in the car park.
      </Meta>
      {disciplines.map((d) => (
        <Card key={d.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.text.name, { color: t.colors.ink }]}>{d.name}</Text>
              <Meta>
                {d.shot_count} shots · {d.scoring_mode === 'integer' ? 'whole rings' : 'tenths'}
              </Meta>
            </View>
            <Button
              label="Start"
              size="sm"
              busy={busy}
              onPress={() => onPick(d)}
              // The row squeezes it otherwise, and "Start" ends up clipped.
              style={{ marginTop: 0, minWidth: 96, paddingHorizontal: 16 }}
            />
          </View>
        </Card>
      ))}
    </View>
  );
}
