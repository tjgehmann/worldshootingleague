import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { routeFromNotification } from '@/lib/notifications';
import { useTheme } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

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
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="match/[id]" options={{ headerBackTitle: 'Matches' }} />
      <Stack.Screen name="bout/[id]/report" options={{ headerBackTitle: 'Abbrechen' }} />
      <Stack.Screen name="bout/[id]/confirm" options={{ headerBackTitle: 'Match' }} />
      <Stack.Screen name="club/join" options={{ headerBackTitle: 'Profile' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="auto" />
          <AuthGate />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
