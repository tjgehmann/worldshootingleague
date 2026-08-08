import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { Button, Card, Field, Hint, Kicker, LargeTitle, Note } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createClub, redeemClubInvite } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/** Slugs are derived rather than asked for; nobody wants to invent one. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export default function JoinClubScreen() {
  const { userId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTheme();

  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [country, setCountry] = useState('DE');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    await queryClient.invalidateQueries({ queryKey: ['my-clubs', userId] });
    router.back();
  };

  const join = useMutation({
    mutationFn: () => redeemClubInvite(code.trim()),
    onSuccess: done,
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not join'),
  });

  const create = useMutation({
    mutationFn: () =>
      createClub({
        name: name.trim(),
        slug: slugify(name),
        countryCode: country.trim().toUpperCase(),
        shortName: shortName.trim() || undefined,
        city: city.trim() || undefined,
      }),
    onSuccess: done,
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create the club'),
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.ground }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Kicker>{mode === 'join' ? 'You were given a code' : 'Nobody has one yet'}</Kicker>
        <LargeTitle>{mode === 'join' ? 'Join a club' : 'Start a club'}</LargeTitle>

        {error ? <Note tone="error">{error}</Note> : null}

        {mode === 'join' ? (
          <>
            <Card>
              <Field
                label="Invite code"
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase())}
                autoCapitalize="characters"
                placeholder="SVK2026"
                big
                style={{ marginBottom: 0 }}
              />
            </Card>
            <Button
              label="Join"
              onPress={() => join.mutate()}
              disabled={code.trim().length < 6}
              busy={join.isPending}
            />
            <Button
              label="No code? Start a club instead"
              variant="text"
              onPress={() => {
                setMode('create');
                setError(null);
              }}
            />
            <Hint>
              An official of the club hands out the code. Joining makes it the club you
              shoot for, if you do not have one yet.
            </Hint>
          </>
        ) : (
          <>
            <Card>
              <Field
                label="Club name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                placeholder="SV Karlsruhe"
              />
              <Field
                label="Short name"
                value={shortName}
                onChangeText={setShortName}
                autoCapitalize="characters"
                maxLength={12}
                placeholder="SVK"
                hint="Shown in tables and team fixtures"
              />
              <Field
                label="Country"
                value={country}
                onChangeText={setCountry}
                autoCapitalize="characters"
                maxLength={2}
                placeholder="DE"
              />
              <Field
                label="City"
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
                placeholder="Karlsruhe"
                style={{ marginBottom: 0 }}
              />
            </Card>
            <Button
              label="Create club"
              onPress={() => create.mutate()}
              disabled={name.trim().length < 2 || country.trim().length !== 2}
              busy={create.isPending}
            />
            <Button
              label="I have a code after all"
              variant="text"
              onPress={() => {
                setMode('join');
                setError(null);
              }}
            />
            <Hint>
              You become its owner and can invite the rest. A club can enter a team
              season once it can field a full lineup.
            </Hint>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
