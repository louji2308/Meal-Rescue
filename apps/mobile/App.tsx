import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from './src/navigation/AppNavigator';
import { initializeAdsIfConfigured } from './src/services/ads.service';
import {
  initializeOneSignalIfConfigured,
  logInToOneSignal,
  logOutFromOneSignal,
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

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppNavigator />
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
