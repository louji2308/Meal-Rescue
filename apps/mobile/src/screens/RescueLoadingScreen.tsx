import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RescueGenerateResponse } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { RescueFuelSheet } from '../components/ads/RescueFuelSheet';
import { ScanningLoader } from '../components/loading/ScanningLoader';
import type { HomeStackParamList, RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { generateRescueV2 } from '../services/rescue.api';
import { useAuthStore } from '../stores/auth.store';
import { useDecisionStore } from '../stores/decision.store';
import { colors, spacing, typography } from '../theme';

/**
 * Runs the decision-aware generate call once, then lands on RescueResult.
 * Kept as its own light screen so the result screen is purely presentational
 * and we get a humane loading beat instead of a silent stall. Daily-limit 429s
 * surface the (unchanged) RescueFuelSheet recovery path.
 */
export function RescueLoadingScreen({
  route,
}: {
  route: {
    params: { mealId: string; foods: string[] };
  };
}) {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { mealId, foods } = route.params;
  const mealText = foods.join(', ');
  const buildV2Context = useDecisionStore((state) => state.buildV2Context);
  const reset = useDecisionStore((state) => state.reset);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [busy, setBusy] = useState(true);
  const [fuelVisible, setFuelVisible] = useState(false);
  const ran = useRef(false);

  async function runGenerate(): Promise<RescueGenerateResponse> {
    setBusy(true);
    setError(null);
    try {
      const result = await generateRescueV2(mealId, buildV2Context());
      navigation.replace('RescueResult', { result, rescueId: result.rescueId });
      reset();
      return result;
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.code === 'DAILY_RESCUE_LIMIT') {
        setFuelVisible(true);
      } else {
        setError(apiErr);
      }
      throw err;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void runGenerate().catch(() => {
      /* handled above */
    });
    // Intentionally runs once on mount; runGenerate reads the store at call time.
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={[typography.heading, styles.title]}>Finding your best move…</Text>
        <ScanningLoader mealText={mealText} />
        <ErrorBanner error={error} />
        {error ? (
          <PrimaryButton label="Try again" onPress={() => void runGenerate()} busy={busy} />
        ) : null}
        <Text style={styles.foot}>{userId ? 'Made just for how you’re feeling tonight.' : ''}</Text>
      </View>
      <RescueFuelSheet
        visible={fuelVisible}
        onClose={() => setFuelVisible(false)}
        retryGenerate={() => runGenerate()}
        onRecovered={(result) => {
          navigation.replace('RescueResult', { result, rescueId: result.rescueId });
          reset();
        }}
        onGoPro={() => rootNavigation.navigate('Paywall')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  foot: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.lg,
  },
});
