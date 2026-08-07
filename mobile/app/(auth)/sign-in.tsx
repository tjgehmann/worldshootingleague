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
      setError(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen');
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
              {mode === 'in' ? 'World Shooting League' : 'Konto anlegen'}
            </LargeTitle>
          </View>

          {error ? <Note tone="error">{error}</Note> : null}

          <Field
            label="E-Mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            placeholder="du@verein.de"
          />
          <Field
            label="Passwort"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="mindestens 6 Zeichen"
          />

          {mode === 'up' ? (
            <>
              <Field
                label="Kürzel"
                value={handle}
                onChangeText={setHandle}
                placeholder="thomas"
                hint="Kleinbuchstaben, Ziffern und _, 3–24 Zeichen"
              />
              <Field
                label="Anzeigename"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                placeholder="Thomas Gehmann"
              />
              <Field
                label="Land"
                value={country}
                onChangeText={setCountry}
                autoCapitalize="characters"
                maxLength={2}
                placeholder="DE"
              />
            </>
          ) : null}

          <Button
            label={mode === 'in' ? 'Anmelden' : 'Konto anlegen'}
            onPress={submit}
            busy={busy}
            disabled={!email || !password || (mode === 'up' && !handle)}
          />
          <Button
            label={mode === 'in' ? 'Neu hier? Konto anlegen' : 'Ich habe schon ein Konto'}
            variant="text"
            onPress={() => {
              setMode(mode === 'in' ? 'up' : 'in');
              setError(null);
            }}
          />

          <View style={{ marginTop: t.space.xxl }}>
            <Text style={{ color: t.colors.inkFaint, fontSize: 14, lineHeight: 21 }}>
              Du meldest nach jedem Durchgang Gesamtergebnis und Anzahl Zehner mit einem Foto
              der Anzeige. Das Ergebnis deines Gegners siehst du erst, wenn ihr beide
              abgegeben habt.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
