import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { navigationRef } from './src/components/aftercare/navigation';
import { AppNavigator } from './src/navigation/AppNavigator';
import { initializeAdsIfConfigured } from './src/services/ads.service';
import type { AftercareNotificationPayload } from './src/services/onesignal.service';
import {
  initializeOneSignalIfConfigured,
  logInToOneSignal,
  logOutFromOneSignal,
  onAftercareNotificationClick,
} from './src/services/onesignal.service';
import {
  configurePurchasesIfReady,
  logInToRevenueCat,
  logOutFromRevenueCat,
} from './src/services/revenuecat.service';
import { useAuthStore } from './src/stores/auth.store';

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

export default function App() {
  const hydrate = useAuthStore((state) => state.hydrate);
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id ?? null);

  useEffect(() => {
    void hydrate();
    initializeOneSignalIfConfigured();
    void initializeAdsIfConfigured();
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

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppNavigator />
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
