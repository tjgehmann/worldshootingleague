import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Push registration.
 *
 * The client's only job is to hand its device token to the database. What is
 * worth notifying about, and when, is decided by triggers in Postgres — see
 * supabase/migrations/..._notifications.sql.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Expo needs the EAS project id to mint a token for a standalone build. */
function projectId(): string | undefined {
  const extra = require('expo-constants').default?.expoConfig?.extra;
  return extra?.eas?.projectId;
}

export async function registerForPush(userId: string): Promise<'granted' | 'denied' | 'unsupported'> {
  // A simulator has no push token to give, and asking for one throws.
  if (!Device.isDevice) return 'unsupported';

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return 'denied';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Matches',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;

  // A token can move between accounts on a shared device, so claim it for this
  // shooter and clear any earlier disable.
  await supabase.from('device_tokens').upsert(
    {
      shooter_id: userId,
      token,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
      last_seen_at: new Date().toISOString(),
      disabled_at: null,
    },
    { onConflict: 'token' },
  );

  return 'granted';
}

/** Called on sign-out so a shared device stops receiving someone else's matches. */
export async function unregisterPush(userId: string): Promise<void> {
  if (!Device.isDevice) return;
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
    await supabase.from('device_tokens').delete().eq('token', token).eq('shooter_id', userId);
  } catch {
    // No token to release — nothing to clean up.
  }
}

/** The deep link a notification carries, e.g. "/match/<id>". */
export function routeFromNotification(
  response: Notifications.NotificationResponse,
): string | undefined {
  const data = response.notification.request.content.data as { route?: string } | undefined;
  return typeof data?.route === 'string' ? data.route : undefined;
}
