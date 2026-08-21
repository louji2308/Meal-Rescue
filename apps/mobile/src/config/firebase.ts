import AsyncStorage from '@react-native-async-storage/async-storage';
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, initializeAuth } from 'firebase/auth';
// getReactNativePersistence ships only under the "react-native" export
// condition; @firebase/auth's top-level "types" hides it from tsc but
// Metro resolves it correctly at runtime.
// @ts-expect-error - see note above
import { getReactNativePersistence } from 'firebase/auth';

/**
 * Firebase client configuration.
 *
 * Lazy and fail-soft: returns null until EXPO_PUBLIC_FIREBASE_* env vars
 * are provided, so the app boots cleanly before the Firebase project is
 * provisioned. The backend currently issues its own JWTs (see
 * apps/backend/src/modules/auth); this client wires up for the cutover.
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured()) {
    return null;
  }

  if (!cachedAuth) {
    cachedApp =
      getApps().length > 0 && getApps()[0] ? getApps()[0]! : initializeApp(firebaseConfig);

    cachedAuth = initializeAuth(cachedApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }

  return cachedAuth;
}
