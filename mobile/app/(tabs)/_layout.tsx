import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();

  return (
    <Tabs
      screenOptions={{
        // Each screen carries its own large title, so there is no header bar.
        headerShown: false,
        sceneStyle: { backgroundColor: t.colors.ground },
        tabBarActiveTintColor: t.colors.accent,
        tabBarInactiveTintColor: t.colors.inkFaint,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        // Floating pill rather than a bar welded to the bottom edge.
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 14,
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 22,
          borderTopWidth: 0,
          backgroundColor: t.colors.surface,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: t.dark ? 0.4 : 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color, size }) => <Ionicons name="flash" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Rangliste',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
