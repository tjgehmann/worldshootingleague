import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Field, Hint, Kicker, LargeTitle, Meta, Note } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isAdult } from '@/lib/format';
import { useTheme } from '@/lib/theme';

export default function SignInScreen() {
  const { signIn, signUp, resendConfirmation } = useAuth();
  const t = useTheme();

  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [country, setCountry] = useState('DE');
  const [birthDate, setBirthDate] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set once signUp() reports a confirmation link is on its way. The whole
  // form is replaced by a card below rather than showing a note above it —
  // an inline note next to a form that otherwise looks untouched is easy to
  // miss, and leaves it genuinely ambiguous whether anything happened.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resent, setResent] = useState(false);

  // Checked here as well as in the database, so somebody who is too young
  // finds out before they have made an account they cannot use.
  const ageProblem =
    mode === 'up' && birthDate.length === 10 && !isAdult(birthDate)
      ? 'The beta is open to shooters of 18 and over.'
      : null;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'in') {
        await signIn(email.trim(), password);
      } else {
        const { confirmationSent } = await signUp({
          email: email.trim(),
          password,
          handle,
          displayName: displayName || handle,
          countryCode: country,
          dateOfBirth: birthDate.trim(),
        });
        if (confirmationSent) setAwaitingConfirmation(true);
        // No confirmation needed: a session already arrived, and the auth
        // gate takes it from there — nothing to show here.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setBusy(true);
    try {
      await resendConfirmation(email);
      setResent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The email could not be sent');
    } finally {
      setBusy(false);
    }
  }

  function backToSignIn() {
    setMode('in');
    setAwaitingConfirmation(false);
    setResent(false);
    setPassword('');
    setError(null);
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
              {awaitingConfirmation
                ? 'Check your email'
                : mode === 'in'
                  ? 'World Shooting League'
                  : 'Create an account'}
            </LargeTitle>
          </View>

          {error ? <Note tone="error">{error}</Note> : null}

          {awaitingConfirmation ? (
            <Card>
              <Meta>
                Account created for {email.trim()}. Follow the link we sent to confirm it before
                signing in.
              </Meta>
              <Hint>
                {resent
                  ? 'Sent again — give it a minute, and check the spam folder.'
                  : "Nothing arrived after a few minutes? It's easy to miss or get filtered as spam."}
              </Hint>
              <Button
                label={resent ? 'Sent' : 'Resend the email'}
                variant="quiet"
                onPress={resend}
                busy={busy}
                disabled={resent}
              />
              <Button label="Back to sign in" variant="text" onPress={backToSignIn} />
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
                  <Field
                    label="Date of birth"
                    value={birthDate}
                    onChangeText={setBirthDate}
                    placeholder="1990-05-14"
                    maxLength={10}
                    hint={
                      ageProblem ??
                      'The beta is open to shooters of 18 and over. Later it decides your age class.'
                    }
                  />
                  <Consent accepted={accepted} onToggle={() => setAccepted(!accepted)} />
                </>
              ) : null}

              <Button
                label={mode === 'in' ? 'Sign in' : 'Create account'}
                onPress={submit}
                busy={busy}
                disabled={
                  !email ||
                  !password ||
                  (mode === 'up' && (!handle || !accepted || !isAdult(birthDate)))
                }
              />
              <Button
                label={mode === 'in' ? 'New here? Create an account' : 'I already have an account'}
                variant="text"
                onPress={() => {
                  setMode(mode === 'in' ? 'up' : 'in');
                  setError(null);
                }}
              />
              {mode === 'in' ? (
                <Link href="/reset" asChild>
                  <Button
                    label="Forgotten your password?"
                    variant="text"
                    size="sm"
                    onPress={() => {}}
                  />
                </Link>
              ) : null}

              <View style={{ marginTop: t.space.xxl }}>
                <Text style={{ color: t.colors.inkFaint, fontSize: 14, lineHeight: 21 }}>
                  After every series you report your score with a photo of the display. Your
                  opponent's result stays hidden until you have both submitted.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Consent, as a thing you have to reach for. A pre-ticked box is not consent,
 * and a document nobody can open before signing up is not a document — which
 * is why both links go to screens a visitor without an account can read.
 */
function Consent({ accepted, onToggle }: { accepted: boolean; onToggle: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: accepted }}
      onPress={onToggle}
      style={{
        flexDirection: 'row',
        gap: t.space.md,
        alignItems: 'flex-start',
        marginBottom: t.space.md,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: accepted ? t.colors.accent : t.colors.hairline,
          backgroundColor: accepted ? t.colors.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {accepted ? (
          <Text style={{ color: t.colors.onSolid, fontSize: 13, fontWeight: '700' }}>✓</Text>
        ) : null}
      </View>
      <Text style={{ flex: 1, color: t.colors.inkMuted, fontSize: 13.5, lineHeight: 20 }}>
        I accept the{' '}
        <Link href="/legal/terms" style={{ color: t.colors.accent }}>
          terms
        </Link>{' '}
        and have read the{' '}
        <Link href="/legal/privacy" style={{ color: t.colors.accent }}>
          privacy notice
        </Link>
        .
      </Text>
    </Pressable>
  );
}
