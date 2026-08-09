import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Field, Hint, Kicker, LargeTitle, Meta, Note } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

/**
 * Forgetting a password.
 *
 * One screen, two states, because they are two halves of the same errand and a
 * shooter arriving from the email should not have to find a second screen.
 *
 *   * No recovery session: ask for the address, send the link.
 *   * Recovery session (the link was followed): set a new password.
 *
 * The link carries a real session, which is why `recovering` exists — without
 * it the auth gate would see somebody signed in and send them to their matches
 * before they could change anything.
 */
export default function ResetScreen() {
  const { recovering, sendPasswordReset, setPassword } = useAuth();
  const router = useRouter();
  const t = useTheme();

  const [email, setEmail] = useState('');
  const [password, setNewPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // On web supabase-js reads the recovery tokens out of the address bar itself.
  // A native build has no address bar: the link arrives as a deep link, and the
  // fragment has to be unpacked by hand.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    Linking.getInitialURL().then((url) => {
      const fragment = url?.split('#')[1];
      if (!fragment) return;

      const params = new URLSearchParams(fragment);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (params.get('type') === 'recovery' && access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token }).catch(() => {});
      }
    });
  }, []);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      await sendPasswordReset(email);
      // Said the same way whether or not the address is known: whether somebody
      // has an account here is not a thing to tell a stranger.
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The email could not be sent');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await setPassword(password);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The password could not be changed');
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
            <Kicker tone={t.colors.accent}>Account</Kicker>
            <LargeTitle>{recovering ? 'Choose a new password' : 'Forgotten password'}</LargeTitle>
          </View>

          {error ? <Note tone="error">{error}</Note> : null}

          {recovering ? (
            <>
              <Field
                label="New password"
                value={password}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="at least 6 characters"
              />
              <Button
                label="Save and sign in"
                onPress={save}
                busy={busy}
                disabled={password.length < 6}
              />
            </>
          ) : sent ? (
            <Card>
              <Meta>
                If there is an account for {email.trim()}, a link is on its way. It is good
                for an hour.
              </Meta>
              <Hint>
                Nothing arrived? Look in the spam folder, and check the address — an
                account you never finished creating has no password to reset.
              </Hint>
              <Button label="Back to sign in" variant="quiet" onPress={() => router.back()} />
            </Card>
          ) : (
            <>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoComplete="email"
                placeholder="you@club.org"
              />
              <Button label="Send me a link" onPress={send} busy={busy} disabled={!email} />
              <Button label="Back" variant="text" onPress={() => router.back()} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
