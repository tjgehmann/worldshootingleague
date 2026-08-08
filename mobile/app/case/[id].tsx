import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  Button,
  Card,
  Empty,
  Field,
  Hint,
  Kicker,
  Label,
  LargeTitle,
  Loading,
  Meta,
  Note,
  Pill,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatScore } from '@/lib/format';
import {
  claimDispute,
  createSignedPhotoUrl,
  decideDispute,
  fetchBoutSubmissions,
  fetchDisputeCase,
} from '@/lib/queries';
import { useTheme } from '@/lib/theme';
import type { DisputeCase, DisputeOutcome, Submission } from '@/lib/types';

/**
 * One case, and its ending.
 *
 * The screen is built around the comparison a referee actually makes: the two
 * reported numbers, the two photos, and the complaint. The decision comes last
 * and needs a sentence, because both shooters read it.
 */
export default function CaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTheme();

  const [outcome, setOutcome] = useState<DisputeOutcome | null>(null);
  const [note, setNote] = useState('');
  const [correctionFor, setCorrectionFor] = useState<string | null>(null);
  const [total, setTotal] = useState('');
  const [innerTens, setInnerTens] = useState('');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({ queryKey: ['case', id], queryFn: () => fetchDisputeCase(id) });
  const boutId = detail.data?.bout_id;

  const submissions = useQuery({
    queryKey: ['submissions', boutId ? [boutId] : []],
    queryFn: () => fetchBoutSubmissions([boutId!]),
    enabled: !!boutId,
  });

  const claim = useMutation({
    mutationFn: () => claimDispute(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case', id] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not take the case'),
  });

  const decide = useMutation({
    mutationFn: () => {
      const c = detail.data!;
      return decideDispute({
        disputeId: c.dispute_id,
        outcome: outcome!,
        note: note.trim(),
        submissionId: outcome === 'corrected' ? (correctionFor ?? undefined) : undefined,
        total: outcome === 'corrected' ? Number(total.replace(',', '.')) : undefined,
        innerTens:
          outcome === 'corrected' && c.requires_inner_tens && innerTens.length > 0
            ? Number(innerTens)
            : undefined,
        winnerId: outcome === 'forfeited' ? (winnerId ?? undefined) : undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dispute-queue'] });
      await queryClient.invalidateQueries({ queryKey: ['match'] });
      router.back();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'The decision was not accepted'),
  });

  if (detail.isLoading || submissions.isLoading) return <Loading />;
  if (!detail.data) return <Empty text="Case not found." />;

  const c = detail.data;
  const rows = submissions.data ?? [];
  const mine = c.referee_id === userId;
  const closed = c.state === 'resolved' || c.state === 'withdrawn';

  const ready =
    !!outcome &&
    note.trim().length >= 10 &&
    (outcome !== 'corrected' || (!!correctionFor && total.trim().length > 0)) &&
    (outcome !== 'forfeited' || !!winnerId);

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.ground }}
      contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Kicker>
        {c.discipline_name} · series {c.bout_index}
      </Kicker>
      <LargeTitle>
        {c.shooter_a_name} v {c.shooter_b_name}
      </LargeTitle>

      {error ? <Note tone="error">{error}</Note> : null}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label>The complaint</Label>
          <Pill tone={closed ? 'won' : c.state === 'assigned' ? 'wait' : 'turn'}>
            {closed ? (c.outcome ?? 'closed') : c.state === 'assigned' ? 'Taken' : 'Open'}
          </Pill>
        </View>
        <Text style={{ color: t.colors.ink, fontSize: 15, lineHeight: 22, marginTop: t.space.md }}>
          “{c.reason}”
        </Text>
        <Meta>
          {c.raised_by_name} · {formatDateTime(c.created_at)}
        </Meta>
      </Card>

      {closed ? (
        <Card>
          <Label>Decided</Label>
          <Text style={{ color: t.colors.ink, fontSize: 15, lineHeight: 22, marginTop: t.space.sm }}>
            {c.resolution_note}
          </Text>
          <Hint>The photos are no longer readable once a case is closed.</Hint>
        </Card>
      ) : null}

      <Kicker>What was reported</Kicker>
      {rows.length === 0 ? (
        <Card>
          <Meta>
            No submissions are visible. A referee sees the evidence only while the case is
            open.
          </Meta>
        </Card>
      ) : (
        rows.map((s) => (
          <Evidence
            key={s.id}
            submission={s}
            name={s.shooter_id === c.shooter_a ? c.shooter_a_name : c.shooter_b_name}
            case_={c}
            selectable={!closed && outcome === 'corrected'}
            selected={correctionFor === s.id}
            onSelect={() => {
              setCorrectionFor(s.id);
              setTotal(String(s.adjusted_total ?? s.total));
              setInnerTens(s.inner_tens != null ? String(s.adjusted_inner_tens ?? s.inner_tens) : '');
            }}
          />
        ))
      )}

      {closed ? null : (
        <>
          {!mine ? (
            <Button
              label={c.referee_id ? 'Another referee has this case' : 'Take this case'}
              variant="quiet"
              onPress={() => claim.mutate()}
              disabled={!!c.referee_id}
              busy={claim.isPending}
            />
          ) : null}

          <Kicker>Decision</Kicker>
          <Card>
            <Choice
              label="The report stands"
              hint="Photo and number agree. The complaint does not hold."
              active={outcome === 'unchanged'}
              onPress={() => setOutcome('unchanged')}
            />
            <Choice
              label="Correct a score"
              hint="The photo shows a different number. What was typed stays visible next to it."
              active={outcome === 'corrected'}
              onPress={() => setOutcome('corrected')}
            />
            <Choice
              label="Award the series"
              hint="One side cannot be scored — no photo, or a photo of something else."
              active={outcome === 'forfeited'}
              onPress={() => setOutcome('forfeited')}
            />
            <Choice
              label="Void the series"
              hint="It counts for nobody. If that leaves the match level, a decider is added."
              active={outcome === 'voided'}
              onPress={() => setOutcome('voided')}
            />
          </Card>

          {outcome === 'corrected' ? (
            <Card>
              <Label>Correct to what the photo shows</Label>
              {!correctionFor ? (
                <Hint>Pick the report to correct above.</Hint>
              ) : (
                <View style={{ flexDirection: 'row', gap: t.space.md, marginTop: t.space.md }}>
                  <Field
                    label="Total"
                    value={total}
                    onChangeText={setTotal}
                    keyboardType="decimal-pad"
                    big
                    style={{ flex: 1, marginBottom: 0 }}
                  />
                  {c.requires_inner_tens ? (
                    <Field
                      label="Inner tens"
                      value={innerTens}
                      onChangeText={setInnerTens}
                      keyboardType="number-pad"
                      big
                      style={{ width: 112, marginBottom: 0 }}
                    />
                  ) : null}
                </View>
              )}
            </Card>
          ) : null}

          {outcome === 'forfeited' ? (
            <Card>
              <Label>Who keeps the series</Label>
              <View style={{ marginTop: t.space.sm }}>
                <Choice
                  label={c.shooter_a_name}
                  active={winnerId === c.shooter_a}
                  onPress={() => setWinnerId(c.shooter_a)}
                />
                <Choice
                  label={c.shooter_b_name}
                  active={winnerId === c.shooter_b}
                  onPress={() => setWinnerId(c.shooter_b)}
                />
              </View>
            </Card>
          ) : null}

          <Text style={[t.text.label, { color: t.colors.inkFaint, marginTop: t.space.md, marginBottom: 7 }]}>
            Why
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={4}
            placeholder="Both shooters read this. Say what the photo shows and what follows from it."
            placeholderTextColor={t.colors.inkFaint}
            style={{
              backgroundColor: t.colors.surfaceAlt,
              borderRadius: t.radius.lg,
              padding: t.space.lg,
              minHeight: 110,
              textAlignVertical: 'top',
              color: t.colors.ink,
              fontSize: 15,
            }}
          />

          <Button
            label="Decide"
            onPress={() => decide.mutate()}
            disabled={!ready}
            busy={decide.isPending}
            style={{ marginTop: t.space.lg }}
          />
          <Hint center>
            The match is settled again from scratch afterwards, so a correction can change
            who won it.
          </Hint>
        </>
      )}
    </ScrollView>
  );
}

function Evidence({
  submission,
  name,
  case_,
  selectable,
  selected,
  onSelect,
}: {
  submission: Submission;
  name: string;
  case_: DisputeCase;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTheme();
  const photo = useQuery({
    queryKey: ['photo', submission.photo_path],
    queryFn: () => createSignedPhotoUrl(submission.photo_path!),
    enabled: !!submission.photo_path,
  });

  const corrected = submission.adjusted_total != null;

  return (
    <Pressable onPress={selectable ? onSelect : undefined} disabled={!selectable}>
      <Card tone={selected ? 'positive' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[t.text.name, { color: t.colors.ink }]} numberOfLines={1}>
              {name}
            </Text>
            <Meta>
              shot {formatDateTime(submission.shot_at)} · sent{' '}
              {formatDateTime(submission.submitted_at)}
            </Meta>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[t.text.scoreSm, { color: t.colors.ink }]}>
              {formatScore(submission.adjusted_total ?? submission.total, case_.scoring_mode)}
            </Text>
            {submission.inner_tens != null ? (
              <Meta>{submission.adjusted_inner_tens ?? submission.inner_tens} inner tens</Meta>
            ) : null}
          </View>
        </View>

        {corrected ? (
          <Hint>
            Corrected from {formatScore(submission.total, case_.scoring_mode)} as reported.
          </Hint>
        ) : null}

        {photo.data ? (
          <Image
            source={{ uri: photo.data }}
            style={{
              width: '100%',
              height: 240,
              borderRadius: t.radius.xl,
              backgroundColor: t.colors.surfaceAlt,
              marginTop: t.space.md,
            }}
            resizeMode="contain"
          />
        ) : (
          <View
            style={{
              width: '100%',
              height: 120,
              borderRadius: t.radius.xl,
              backgroundColor: t.colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: t.space.md,
            }}
          >
            <Text style={{ color: t.colors.inkFaint, fontSize: 14 }}>
              {photo.isLoading ? 'Loading the photo…' : 'No photo could be loaded.'}
            </Text>
          </View>
        )}

        {selectable ? (
          <Hint>{selected ? 'This report will be corrected.' : 'Tap to correct this report.'}</Hint>
        ) : null}
      </Card>
    </Pressable>
  );
}

function Choice({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        gap: t.space.md,
        alignItems: 'flex-start',
        paddingVertical: t.space.md,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: active ? t.colors.accent : t.colors.hairline,
          backgroundColor: active ? t.colors.accent : 'transparent',
          marginTop: 1,
        }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.colors.ink, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {hint ? (
          <Text style={{ color: t.colors.inkFaint, fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
