import { Redirect } from 'expo-router';

import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/**
 * The root is a fork, not a screen. Signed in you land in your matches; signed
 * out you land on the public league rather than a login wall.
 */
export default function Index() {
  const { session, loading } = useAuth();

  if (loading) return <Loading />;
  return <Redirect href={session ? '/(tabs)' : '/(public)'} />;
}
