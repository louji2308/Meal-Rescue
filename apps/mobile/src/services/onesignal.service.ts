import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { OneSignal } from 'react-native-onesignal';

/**
 * OneSignal bootstrap. The SDK initializes only when
 * EXPO_PUBLIC_ONESIGNAL_APP_ID is set; without it every call is a no-op.
 *
 * Permission is deliberately NOT requested at launch (anti-fatigue rule):
 * we ask once, after the user's first successful rescue, when the value of
 * reminders is already proven. `login()` ties pushes to the backend user id
 * so the scheduler can address each person individually.
 */

const PERMISSION_ASKED_KEY = 'meal-rescue/onesignal-permission-asked';

export function initializeOneSignalIfConfigured(): void {
  const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId) return;
  try {
    OneSignal.initialize(appId);
  } catch {
    // Missing native module (Expo Go) or bad config - stay silent.
  }
}

export function logInToOneSignal(userId: string): void {
  try {
    if (process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID) {
      OneSignal.login(userId);
    }
  } catch {
    // Best-effort identity sync.
  }
}

export function logOutFromOneSignal(): void {
  try {
    if (process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID) {
      OneSignal.logout();
    }
  } catch {
    // Ignore.
  }
}

/**
 * Asks for notification permission exactly once, after the first rescue.
 * Returns true only when the user granted it.
 */
export async function requestNotificationPermissionOnce(): Promise<boolean> {
  const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId) return false;
  try {
    const asked = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
    if (asked === 'true') {
      return OneSignal.Notifications.getPermissionAsync();
    }
    await AsyncStorage.setItem(PERMISSION_ASKED_KEY, 'true');
    return await OneSignal.Notifications.requestPermission(true);
  } catch {
    return false;
  }
}

/** Resolves the deep link carried by a notification click, if any. */
export function onNotificationClick(handler: (deepLink: string | null) => void): () => void {
  if (!process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID) return () => undefined;
  const listener = (event: { notification?: { additionalData?: { deepLink?: string } } }) => {
    handler(event.notification?.additionalData?.deepLink ?? null);
  };
  OneSignal.Notifications.addEventListener('click', listener);
  return () => OneSignal.Notifications.removeEventListener('click', listener);
}

export const onesignalPlatform = Platform.OS;
