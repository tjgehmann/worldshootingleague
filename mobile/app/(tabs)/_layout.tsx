import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';

import { RingMark } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchProfile } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const { userId } = useAuth();

  // The case queue is a tab rather than a corner of the profile, because a
  // referee who has to go looking for it will not work it. It is hidden for
  // everyone else — and hiding it is cosmetic only: decide_dispute() checks the
  // role itself, so the screen being reachable would not make it usable.
  const profile = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  });
  const isReferee = profile.data?.role === 'referee' || profile.data?.role === 'admin';

  return (
    <Tabs
      screenOptions={{
        // Each screen carries its own large title, so there is no header bar.
        headerShown: false,
        sceneStyle: { backgroundColor: t.colors.ground },
        tabBarActiveTintColor: t.colors.accent,
        tabBarInactiveTintColor: t.colors.inkFaint,
        tabBarLabelStyle: {
          fontFamily: t.fonts.monoMedium,
          fontSize: 9.5,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
        },
        // A bar on the ground with a rule above it, not a floating pill. The
        // pill and its drop shadow were the last of the app-card language, and
        // they cost 30 pt of a screen that is mostly list.
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 78,
          paddingTop: 10,
          paddingBottom: 18,
          borderTopWidth: 1,
          borderTopColor: t.colors.hairline,
          backgroundColor: t.colors.ground,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Matches',
          // A target, not a lightning bolt. The bolt meant "fast" in a sport
          // where nothing is, and it was the only icon on the screen that could
          // have belonged to any app at all.
          tabBarIcon: ({ color, size }) => <RingMark size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Rankings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="cases"
        options={{
          title: 'Cases',
          href: isReferee ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
