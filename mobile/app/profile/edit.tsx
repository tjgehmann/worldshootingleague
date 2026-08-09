import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  Avatar,
  Button,
  Card,
  Field,
  Hint,
  Kicker,
  Label,
  LargeTitle,
  Loading,
  Meta,
  Note,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  describeProfileError,
  fetchMyClubs,
  fetchProfile,
  updateProfile,
  type ProfileEdit,
} from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/**
 * The things a shooter got wrong in the thirty seconds it took to sign up, plus
 * the one that decides whether they can be fielded in a team match.
 *
 * Which club you shoot for is the important field here. A shooter can belong to
 * several, but only one of them can put them on a board — and until this screen
 * existed, that was whichever club they happened to join first, for ever.
 */
export default function EditProfileScreen() {
  const { userId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTheme();

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

  const [edit, setEdit] = useState<ProfileEdit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => updateProfile(userId!, form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      await queryClient.invalidateQueries({ queryKey: ['my-clubs', userId] });
      router.back();
    },
    onError: (e) => setError(describeProfileError(e)),
  });

  if (profile.isLoading || !profile.data) return <Loading />;

  // Seeded from the loaded profile on first render, then owned by the form.
  const form: ProfileEdit = edit ?? {
    display_name: profile.data.display_name,
    handle: profile.data.handle,
    country_code: profile.data.country_code,
    bio: profile.data.bio,
    primary_club_id: profile.data.primary_club_id,
  };

  const set = (patch: Partial<ProfileEdit>) => {
    setError(null);
    setEdit({ ...form, ...patch });
  };

  const memberships = clubs.data ?? [];
  const handleOk = /^[a-z0-9_]{3,24}$/.test(form.handle.trim().toLowerCase());
  const nameOk = form.display_name.trim().length >= 2 && form.display_name.trim().length <= 40;
  const countryOk = /^[A-Za-z]{2}$/.test(form.country_code.trim());

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.ground }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Kicker>Profile</Kicker>
        <LargeTitle>Edit</LargeTitle>

        {error ? <Note tone="error">{error}</Note> : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space.md,
            marginBottom: t.space.xl,
          }}
        >
          <Avatar name={form.display_name || '?'} size={56} />
          <Meta>
            Initials for now. A photograph is one of the things this beta does without.
          </Meta>
        </View>

        <Field
          label="Display name"
          value={form.display_name}
          onChangeText={(v) => set({ display_name: v })}
          autoCapitalize="words"
          placeholder="Thomas Gehmann"
          hint="What appears on every table and every match."
        />

        <Field
          label="Handle"
          value={form.handle}
          onChangeText={(v) => set({ handle: v })}
          placeholder="thomas"
          hint="Lower case, digits and _, 3–24 characters. Has to be unique."
        />

        <Field
          label="Country"
          value={form.country_code}
          onChangeText={(v) => set({ country_code: v })}
          autoCapitalize="characters"
          maxLength={2}
          placeholder="DE"
          hint="Two letters. Some seasons are open to one country only."
        />

        <Text style={[t.text.label, { color: t.colors.inkFaint, marginBottom: 7 }]}>About you</Text>
        <TextInput
          value={form.bio ?? ''}
          onChangeText={(v) => set({ bio: v })}
          multiline
          numberOfLines={3}
          maxLength={500}
          placeholder="Optional. Discipline, club, how long you have been shooting."
          placeholderTextColor={t.colors.inkFaint}
          style={{
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.lg,
            padding: t.space.lg,
            minHeight: 90,
            textAlignVertical: 'top',
            color: t.colors.ink,
            fontSize: 15,
            marginBottom: t.space.md,
          }}
        />

        <Kicker>Shooting for</Kicker>
        <Card>
          {memberships.length === 0 ? (
            <Meta>
              You are not in a club yet. Join one and it can field you in team matches.
            </Meta>
          ) : (
            <>
              {memberships.map((membership) => (
                <ClubChoice
                  key={membership.club_id}
                  label={membership.club.name}
                  meta={`${membership.club.country_code}${
                    membership.club.city ? ` · ${membership.club.city}` : ''
                  } · ${membership.role}`}
                  active={form.primary_club_id === membership.club_id}
                  onPress={() => set({ primary_club_id: membership.club_id })}
                />
              ))}
              <ClubChoice
                label="No club"
                meta="You shoot as an individual and cannot be fielded in a team match."
                active={form.primary_club_id === null}
                onPress={() => set({ primary_club_id: null })}
              />
              <Hint>
                {memberships.length > 1
                  ? 'You belong to several. Only the one picked here can put you on a board.'
                  : 'This is the club that can put you on a board in a team match.'}
              </Hint>
            </>
          )}
        </Card>

        <Button
          label="Save"
          onPress={() => save.mutate()}
          busy={save.isPending}
          disabled={!handleOk || !nameOk || !countryOk}
          style={{ marginTop: t.space.lg }}
        />
        <Button label="Cancel" variant="text" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ClubChoice({
  label,
  meta,
  active,
  onPress,
}: {
  label: string;
  meta: string;
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
        <Text style={{ color: t.colors.inkFaint, fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}
