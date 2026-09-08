import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { NotificationClickEvent } from 'react-native-onesignal';

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

/** True when a OneSignal app id is configured. Keyless = dry-run mode. */
export function hasOneSignalAppId(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID);
}

/** Payload carried by an aftercare (satisfaction check-in) notification. */
export interface AftercareNotificationPayload {
  rescueId: string;
  recommendation: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the aftercare payload from a notification click's additionalData.
 * Returns null when the tap wasn't an aftercare notification, so the root
 * listener can ignore non-aftercare pushes safely.
 */
export function readAftercareFromClick(event: {
  notification?: { additionalData?: Record<string, unknown> };
}): AftercareNotificationPayload | null {
  const data = event.notification?.additionalData;
  if (!data || !isRecord(data)) return null;
  if (data.kind !== 'aftercare' && data.aftercare !== true) return null;
  const rescueId = data.rescueId;
  const recommendation = data.recommendation;
  if (typeof rescueId !== 'string' || rescueId.length === 0) return null;
  return {
    rescueId,
    recommendation: typeof recommendation === 'string' ? recommendation : '',
  };
}

/** Extracts the raw click payload, routing around the SDK's `object` typing. */
function aftercarePayloadFromClick(
  event: NotificationClickEvent,
): AftercareNotificationPayload | null {
  const additionalData = event.notification?.additionalData;
  if (!additionalData || typeof additionalData !== 'object') return null;
  return readAftercareFromClick({
    notification: { additionalData: additionalData as Record<string, unknown> },
  });
}

/**
 * Aftercare notification-open listener.
 *
 * Fires only for taps on aftercare (satisfaction check-in) pushes - other
 * pushes are ignored so the app never hijacks a generic notification open.
 * Works keyless: when OneSignal is unconfigured this subscribes nothing and
 * returns a no-op unsubscribe.
 */
export function onAftercareNotificationClick(
  handler: (payload: AftercareNotificationPayload) => void,
): () => void {
  if (!hasOneSignalAppId()) return () => undefined;
  const os = getOneSignal();
  if (!os) return () => undefined;
  const listener = (event: NotificationClickEvent) => {
    const payload = aftercarePayloadFromClick(event);
    if (payload) handler(payload);
  };
  os.Notifications.addEventListener('click', listener);
  return () => os.Notifications.removeEventListener('click', listener);
}

export const onesignalPlatform = Platform.OS;
