import { Stack } from 'expo-router';

import { useTheme } from '@/lib/theme';

/**
 * Everything a signed-out visitor can reach. Kept as its own group so the auth
 * gate has one obvious thing to let through.
 */
export default function PublicLayout() {
  const t = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.colors.ground },
        headerShadowVisible: false,
        headerTintColor: t.colors.accent,
        headerTitle: '',
        contentStyle: { backgroundColor: t.colors.ground },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="season/[slug]" options={{ headerBackTitle: 'Back' }} />
      <Stack.Screen name="club/[slug]" options={{ headerBackTitle: 'Back' }} />
    </Stack>
  );
}
