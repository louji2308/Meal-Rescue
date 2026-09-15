import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
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

export type NotificationActionButton = 'make_it' | 'later' | 'not_tonight';

export interface ActionButtonPayload {
  actionId: NotificationActionButton;
  deepLink?: string;
  kind?: string;
}

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

/** Parsed result of a mealrescue:// deep link. */
export interface ParsedDeepLink {
  route: string;
  params?: Record<string, string>;
}

const _DEEP_LINK_HOSTS = new Set(['rescue', 'pantry', 'home']);

/**
 * Parses a mealrescue:// deep link into a route and optional params.
 *
 * Supported forms:
 *   mealrescue://rescue           → home tab
 *   mealrescue://pantry           → kitchen tab
 *   mealrescue://home             → home tab
 *   mealrescue://rescue?dish=X    → home tab with dish param
 *   mealrescue://rescue/dish=X    → home tab with dish param (trailing slash variant)
 *
 * Returns null for unrecognized schemes or hosts.
 */
export function parseDeepLink(url: string): ParsedDeepLink | null {
  try {
    const normalized = url.trim();
    if (!normalized.startsWith('mealrescue://')) return null;

    const afterScheme = normalized.slice('mealrescue://'.length);
    // Strip trailing slashes and fragments
    const cleaned = afterScheme.replace(/[/#?].*$/, '');
    const host = cleaned.toLowerCase();

    // Extract query string if present
    const qIndex = afterScheme.indexOf('?');
    const params: Record<string, string> = {};
    if (qIndex !== -1) {
      const qs = afterScheme.slice(qIndex + 1).replace(/[#/].*$/, '');
      qs.split('&').forEach((pair) => {
        const [k, v] = pair.split('=');
        if (k) {
          try {
            params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
          } catch {
            params[k] = v ?? '';
          }
        }
      });
    }

    // Also handle path-style params: mealrescue://rescue/dish=X
    const slashIndex = afterScheme.indexOf('/');
    if (slashIndex !== -1 && qIndex === -1) {
      const pathSegment = afterScheme.slice(slashIndex + 1).replace(/[#?/].*$/, '');
      const eqIndex = pathSegment.indexOf('=');
      if (eqIndex !== -1) {
        const k = pathSegment.slice(0, eqIndex);
        const v = pathSegment.slice(eqIndex + 1);
        try {
          params[decodeURIComponent(k)] = decodeURIComponent(v);
        } catch {
          params[k] = v;
        }
      }
    }

    if (host === 'rescue' || host === 'home') {
      const route = 'Tabs' as const;
      const result: ParsedDeepLink = { route };
      if (params.dish) result.params = { dish: params.dish };
      return result;
    }
    if (host === 'pantry') {
      return { route: 'Tabs' };
    }

    return null;
  } catch {
    return null;
  }
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

/** A push as captured from the SDK's newest event first, for the inbox. */
export interface IncomingPush {
  id: string;
  title: string;
  body: string;
  kind: string;
  deepLink?: string;
}

function readIncomingPush(notification: unknown): IncomingPush | null {
  if (!notification || typeof notification !== 'object') return null;
  const n = notification as Record<string, unknown>;
  const title = typeof n.title === 'string' ? n.title : '';
  const body = typeof n.body === 'string' ? n.body : '';
  if (!title && !body) return null;
  const id =
    typeof n.notificationId === 'string'
      ? n.notificationId
      : typeof n.id === 'string'
        ? n.id
        : `push-${Date.now()}`;
  const additionalData = isRecord(n.additionalData) ? n.additionalData : {};
  const kind = typeof additionalData.kind === 'string' ? additionalData.kind : 'push';
  const deepLink =
    typeof additionalData.deepLink === 'string' && additionalData.deepLink.length > 0
      ? additionalData.deepLink
      : undefined;
  return { id, title, body, kind, deepLink };
}

/**
 * Records every incoming push (delivered and opened) so the inbox can show
 * them without inventing anything. Subscribes to both foreground display and
 * click; the store dedupes the same push surfacing twice. Returns a single
 * unsubscribe for both.
 */
export function onIncomingPush(
  handler: (push: IncomingPush) => void,
): () => void {
  if (!hasOneSignalAppId()) return () => undefined;
  const os = getOneSignal();
  if (!os) return () => undefined;

  const notifications = os.Notifications;

  const handleForeground = (event: {
    getNotification?: () => unknown;
    notification?: unknown;
  }) => {
    let raw: unknown = null;
    try {
      raw = typeof event.getNotification === 'function' ? event.getNotification() : event.notification;
    } catch {
      raw = event.notification ?? null;
    }
    const push = readIncomingPush(raw);
    if (push) handler(push);
  };

  const handleClick = (event: { notification?: unknown }) => {
    const push = readIncomingPush(event.notification);
    if (push) handler(push);
  };

  notifications.addEventListener('foregroundWillDisplay', handleForeground);
  notifications.addEventListener('click', handleClick);

  return () => {
    notifications.removeEventListener('foregroundWillDisplay', handleForeground);
    notifications.removeEventListener('click', handleClick);
  };
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

/**
 * Action button click handler.
 *
 * When a user taps an action button (Make it, Later, Not tonight),
 * this listener receives the action ID and the notification's additionalData.
 * Returns an unsubscribe function.
 */
export function onActionButtonClick(
  handler: (payload: ActionButtonPayload) => void,
): () => void {
  if (!hasOneSignalAppId()) return () => undefined;
  const os = getOneSignal();
  if (!os) return () => undefined;

  const listener = (event: NotificationClickEvent) => {
    const additionalData = event.notification?.additionalData;
    if (!additionalData || typeof additionalData !== 'object') return;

    // OneSignal passes actionId on the event when a button is clicked
    const actionId = (event as { actionId?: string }).actionId;
    if (!actionId) return;

    const validActions: NotificationActionButton[] = ['make_it', 'later', 'not_tonight'];
    if (!validActions.includes(actionId as NotificationActionButton)) return;

    const data = additionalData as Record<string, unknown>;
    handler({
      actionId: actionId as NotificationActionButton,
      deepLink: typeof data.deepLink === 'string' ? data.deepLink : undefined,
      kind: typeof data.kind === 'string' ? data.kind : undefined,
    });
  };

  os.Notifications.addEventListener('click', listener);
  return () => os.Notifications.removeEventListener('click', listener);
}

/**
 * Push Subscription Verification Dialog.
 *
 * Google requires push subscription verification to deliver notifications
 * to Android users. When the server assigns a subscription ID, the SDK's
 * push subscription observer fires with a non-empty value. To comply,
 * show a dialog asking the user if they want to receive notifications,
 * and only request permission when they tap the button.
 *
 * Call this once after OneSignal initialization. Returns an unsubscribe function.
 */
let _subscriptionVerifierUnsub: (() => void) | null = null;

export function registerPushSubscriptionVerifier(): () => void {
  if (_subscriptionVerifierUnsub) return _subscriptionVerifierUnsub;
  if (!hasOneSignalAppId()) return () => undefined;

  const os = getOneSignal();
  if (!os) return () => undefined;

  const listener = (event: { current?: { id?: string } }) => {
    const subId = event.current?.id;
    // Server-assigned IDs are non-empty and not prefixed with "local-"
    if (subId && subId.length > 0 && !subId.startsWith('local-')) {
      // Only show dialog if permission hasn't been granted yet
      os.Notifications.getPermissionAsync()
        .then((granted) => {
          if (granted) return;
          Alert.alert(
            'Meal Rescue',
            'Would you like to receive meal rescue reminders and updates?',
            [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Yes',
                onPress: () => {
                  void os.Notifications.requestPermission(true);
                },
              },
            ],
            { cancelable: false },
          );
        })
        .catch(() => undefined);
    }
  };

  os.User.pushSubscription.addEventListener('change', listener);
  _subscriptionVerifierUnsub = () => {
    os.User.pushSubscription.removeEventListener('change', listener);
    _subscriptionVerifierUnsub = null;
  };
  return _subscriptionVerifierUnsub;
}
