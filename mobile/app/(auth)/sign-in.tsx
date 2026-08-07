import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Hint, Kicker, LargeTitle, Note } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const t = useTheme();

  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [country, setCountry] = useState('DE');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'in') {
        await signIn(email.trim(), password);
      } else {
        await signUp({
          email: email.trim(),
          password,
          handle,
          displayName: displayName || handle,
          countryCode: country,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.ground }} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginTop: t.space.xxl }}>
            <Kicker tone={t.colors.accent}>Challenging shooters</Kicker>
            <LargeTitle>
              {mode === 'in' ? 'World Shooting League' : 'Create an account'}
            </LargeTitle>
          </View>

          {error ? <Note tone="error">{error}</Note> : null}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@club.org"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="at least 6 characters"
          />

          {mode === 'up' ? (
            <>
              <Field
                label="Handle"
                value={handle}
                onChangeText={setHandle}
                placeholder="thomas"
                hint="Lower case, digits and _, 3–24 characters"
              />
              <Field
                label="Display name"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                placeholder="Thomas Gehmann"
              />
              <Field
                label="Country"
                value={country}
                onChangeText={setCountry}
                autoCapitalize="characters"
                maxLength={2}
                placeholder="DE"
              />
            </>
          ) : null}

          <Button
            label={mode === 'in' ? 'Sign in' : 'Create account'}
            onPress={submit}
            busy={busy}
            disabled={!email || !password || (mode === 'up' && !handle)}
          />
          <Button
            label={mode === 'in' ? 'New here? Create an account' : 'I already have an account'}
            variant="text"
            onPress={() => {
              setMode(mode === 'in' ? 'up' : 'in');
              setError(null);
            }}
          />

          <View style={{ marginTop: t.space.xxl }}>
            <Text style={{ color: t.colors.inkFaint, fontSize: 14, lineHeight: 21 }}>
              After every series you report your score with a photo of the display. Your
              opponent's result stays hidden until you have both submitted.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
