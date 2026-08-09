import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { routeFromNotification } from '@/lib/notifications';
import { flushOutbox, watchConnectivity } from '@/lib/outbox';
import { useTheme } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Kept for a day so a shooter who opened the app at home can still see
      // their open matches in a basement range with no reception.
      gcTime: 24 * 60 * 60 * 1000,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'wsl.query-cache.v1',
});

function AuthGate() {
  const { session, loading, recovering } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();

  useEffect(() => {
    if (loading) return;

    // Seasons, tables and finished matches are readable without an account —
    // results nobody can link to might as well not exist. Only the parts that
    // act on someone's behalf need a session.
    const group = segments[0];
    const isOpen = group === '(auth)' || group === '(public)' || group === 'match' || !group;

    if (!session && !isOpen) {
      router.replace('/(auth)/sign-in');
    } else if (session && group === '(auth)' && !recovering) {
      // A reset link brings a real session with it, so without the exception
      // the shooter would be swept past the screen they came to use.
      router.replace('/(tabs)');
    }
  }, [session, loading, recovering, segments, router]);

  // Anything queued while offline goes out as soon as there is a connection,
  // and once more on launch in case the app was killed in between.
  useEffect(() => {
    if (!session) return;
    flushOutbox().catch(() => {});
    return watchConnectivity();
  }, [session]);

  // Tapping a notification jumps straight to the match it is about.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeFromNotification(response);
      if (route && session) router.push(route as never);
    });
    return () => sub.remove();
  }, [router, session]);

  if (loading) return <Loading />;

  return (
    <Stack
      screenOptions={{
        // No coloured chrome: the header is the same ground as the content and
        // carries only the back control. Each screen renders its own title.
        headerStyle: { backgroundColor: t.colors.ground },
        headerShadowVisible: false,
        headerTintColor: t.colors.accent,
        headerTitle: '',
        headerBackTitleStyle: { fontSize: 15 },
        contentStyle: { backgroundColor: t.colors.ground },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(public)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="match/[id]" options={{ headerBackTitle: 'Matches' }} />
      <Stack.Screen name="bout/[id]/report" options={{ headerBackTitle: 'Cancel' }} />
      <Stack.Screen name="bout/[id]/confirm" options={{ headerBackTitle: 'Match' }} />
      <Stack.Screen name="club/join" options={{ headerBackTitle: 'Profile' }} />
      <Stack.Screen name="club/invite" options={{ headerBackTitle: 'Profile' }} />
      <Stack.Screen name="case/[id]" options={{ headerBackTitle: 'Cases' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <AuthProvider>
          <StatusBar style="auto" />
          <AuthGate />
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
