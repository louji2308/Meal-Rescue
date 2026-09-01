import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * OneSignal bootstrap. The SDK initializes only when
 * EXPO_PUBLIC_ONESIGNAL_APP_ID is set; without it every call is a no-op.
 *
 * Permission is deliberately NOT requested at launch (anti-fatigue rule):
 * we ask once, after the user's first successful rescue, when the value of
 * reminders is already proven. `login()` ties pushes to the backend user id
 * so the scheduler can address each person individually.
 *
 * The native module is loaded lazily so the app never crashes when
 * react-native-onesignal is not linked (e.g. Expo Go / dev client without
 * the config plugin).
 */

let _oneSignal: typeof import('react-native-onesignal').OneSignal | null = null;

function getOneSignal(): typeof import('react-native-onesignal').OneSignal | null {
  if (_oneSignal) return _oneSignal;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _oneSignal = require('react-native-onesignal').OneSignal;
    return _oneSignal;
  } catch {
    return null;
  }
}

const PERMISSION_ASKED_KEY = 'meal-rescue/onesignal-permission-asked';

export function initializeOneSignalIfConfigured(): void {
  const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId) return;
  try {
    getOneSignal()?.initialize(appId);
  } catch {
    // Missing native module or bad config - stay silent.
  }
}

export function logInToOneSignal(userId: string): void {
  try {
    if (process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID) {
      getOneSignal()?.login(userId);
    }
  } catch {
    // Best-effort identity sync.
  }
}

export function logOutFromOneSignal(): void {
  try {
    if (process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID) {
      getOneSignal()?.logout();
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
      return (await getOneSignal()?.Notifications.getPermissionAsync()) ?? false;
    }
    await AsyncStorage.setItem(PERMISSION_ASKED_KEY, 'true');
    return (await getOneSignal()?.Notifications.requestPermission(true)) ?? false;
  } catch {
    return false;
  }
}

/** Resolves the deep link carried by a notification click, if any. */
export function onNotificationClick(handler: (deepLink: string | null) => void): () => void {
  if (!process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID) return () => undefined;
  const os = getOneSignal();
  if (!os) return () => undefined;
  const listener = (event: { notification?: { additionalData?: { deepLink?: string } } }) => {
    handler(event.notification?.additionalData?.deepLink ?? null);
  };
  os.Notifications.addEventListener('click', listener);
  return () => os.Notifications.removeEventListener('click', listener);
}

export const onesignalPlatform = Platform.OS;
