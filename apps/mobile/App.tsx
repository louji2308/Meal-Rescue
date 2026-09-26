import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import {
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold,
  Raleway_700Bold,
  Raleway_800ExtraBold,
} from '@expo-google-fonts/raleway';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect } from 'react';
import { Animated, LogBox, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Text } from './src/components/AppText';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { navigationRef } from './src/components/aftercare/navigation';
import { AppNavigator } from './src/navigation/AppNavigator';
import { initializeAdsIfConfigured } from './src/services/ads.service';
import type { AftercareNotificationPayload } from './src/services/onesignal.service';
import {
  initializeOneSignalIfConfigured,
  logInToOneSignal,
  logOutFromOneSignal,
  onActionButtonClick,
  onAftercareNotificationClick,
  onIncomingPush,
  onNotificationClick,
  parseDeepLink,
  registerPushSubscriptionVerifier,
} from './src/services/onesignal.service';
import {
  configurePurchasesIfReady,
  logInToRevenueCat,
  logOutFromRevenueCat,
} from './src/services/revenuecat.service';
import { useAuthStore } from './src/stores/auth.store';
import { InAppNotificationKind, useNotificationsStore } from './src/stores/notifications.store';
import { colors } from './src/theme';

// Must run at root level so the auth-session callback is intercepted on cold start
WebBrowser.maybeCompleteAuthSession();

// The RevenueCat SDK logs every network failure (offline/emulator without
// internet) via console.error, which LogBox surfaces as red banners that also
// intercept touches. These are expected in local dev - the wrapper already
// degrades to safe no-ops - so silence the SDK's own noise here.
LogBox.ignoreLogs([
  '[RevenueCat]',
  "TurboModuleRegistry.getEnforcing(...): 'OneSignal'",
  "TurboModuleRegistry.getEnforcing(...): 'RNGoogleMobileAdsModule'",
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 2,
    },
  },
});

/**
 * Aftercare cold-start queue. A notification tap can wake the app before the
 * navigator is mounted; the payload is stashed here and flushed once the
 * navigation ref is ready (bounded re-checks, then dropped).
 */
let pendingAftercare: AftercareNotificationPayload | null = null;

function flushPendingAftercare(): boolean {
  if (!pendingAftercare || !navigationRef.isReady()) return false;
  const payload = pendingAftercare;
  pendingAftercare = null;
  navigationRef.navigate('SatisfactionCheckin', payload);
  return true;
}

function BootScreen() {
  const pulse = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.boot}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Image
          source={require('./assets/logo.png')}
          style={styles.bootImage}
          contentFit="contain"
        />
      </Animated.View>
      <Text style={styles.bootText}>Warming up the kitchen</Text>
      <View style={styles.dotsRow}>
        <LoadingDot delay={0} />
        <LoadingDot delay={300} />
        <LoadingDot delay={600} />
      </View>
    </View>
  );
}

function LoadingDot({ delay }: { delay: number }) {
  const opacity = React.useRef(new Animated.Value(0.2)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.2, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, delay]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
}

export default function App() {
  const hydrate = useAuthStore((state) => state.hydrate);
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id ?? null);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    DMSerifDisplay_400Regular,
    Raleway_400Regular,
    Raleway_500Medium,
    Raleway_600SemiBold,
    Raleway_700Bold,
    Raleway_800ExtraBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_600SemiBold,
  });

  useEffect(() => {
    void hydrate();
    initializeOneSignalIfConfigured();
    registerPushSubscriptionVerifier();
    void initializeAdsIfConfigured();
    void useNotificationsStore.getState().hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (token && userId) {
      configurePurchasesIfReady(userId);
      void logInToRevenueCat(userId);
      logInToOneSignal(userId);
    } else if (!token) {
      void logOutFromRevenueCat();
      logOutFromOneSignal();
    }
  }, [token, userId]);

  useEffect(() => {
    const unsubscribe = onAftercareNotificationClick((payload) => {
      pendingAftercare = payload;
      if (flushPendingAftercare()) return;
      const timer = setInterval(() => {
        if (flushPendingAftercare()) clearInterval(timer);
      }, 500);
      setTimeout(() => clearInterval(timer), 15_000);
    });
    return unsubscribe;
  }, []);

  // Handle notification action button clicks
  useEffect(() => {
    const unsubscribe = onActionButtonClick((payload) => {
      const { actionId } = payload;
      const navigateToDeepLink = () => {
        if (payload.deepLink && navigationRef.isReady()) {
          const parsed = parseDeepLink(payload.deepLink);
          if (parsed) {
            navigationRef.resetRoot({ index: 0, routes: [{ name: parsed.route }] });
          }
        }
      };

      switch (actionId) {
        // ---- Spoiler Alert buttons ----
        case 'make_it': {
          navigateToDeepLink();
          break;
        }
        case 'later': {
          // Snooze the spoiler alert for 4 hours (backend /snooze).
          void import('./src/services/notifications.api').then(({ requestNotificationSnooze }) =>
            requestNotificationSnooze('spoiler_alert', 4).catch(() => {}),
          );
          break;
        }
        case 'not_tonight': {
          // Dismiss for the rest of the day (max snooze window: 24h).
          void import('./src/services/notifications.api').then(({ requestNotificationSnooze }) =>
            requestNotificationSnooze('spoiler_alert', 24).catch(() => {}),
          );
          break;
        }

        // ---- Aftercare buttons ----
        // The answer IS the interaction - record it, don't reopen the
        // check-in screen (which would ask the same thing again).
        case 'loved_it':
        case 'was_ok':
        case 'not_great': {
          // Record the user's satisfaction so recommendations learn from it.
          if (payload.rescueId) {
            void import('./src/services/notifications.api').then(({ submitAftercareFeedback }) =>
              submitAftercareFeedback(payload.rescueId as string, actionId).catch(() => {}),
            );
          }
          break;
        }

        // ---- Generic buttons ----
        case 'open_app': {
          navigateToDeepLink();
          break;
        }
        case 'dismiss': {
          // Nothing to do - user chose to ignore.
          break;
        }
      }
    });
    return unsubscribe;
  }, []);

  // Handle deep links from notification taps (non-aftercare)
  useEffect(() => {
    const unsubscribe = onNotificationClick((deepLink) => {
      if (!deepLink) return;
      const parsed = parseDeepLink(deepLink);
      if (!parsed) return;
      if (!navigationRef.isReady()) {
        // Stash for cold-start; root effect will retry
        return;
      }
      navigationRef.resetRoot({ index: 0, routes: [{ name: parsed.route }] });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onIncomingPush((push) => {
      const kind: InAppNotificationKind =
        push.kind === 'spoiler_alert' ||
        push.kind === 'aftercare' ||
        push.kind === 'promo' ||
        push.kind === 'system'
          ? push.kind
          : 'push';
      useNotificationsStore.getState().pushNotification({
        kind,
        title: push.title,
        body: push.body,
        deepLink: push.deepLink,
      });
    });
    return unsubscribe;
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {fontsLoaded ? (
          <>
            <ErrorBoundary>
              <AppNavigator />
            </ErrorBoundary>
            <StatusBar style="auto" />
          </>
        ) : (
          <BootScreen />
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  bootImage: {
    width: 200,
    height: 200,
  },
  bootText: {
    marginTop: 28,
    fontSize: 16,
    color: colors.textSecondary,
  },
  dotsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.homeInk,
  },
});
