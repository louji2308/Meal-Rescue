import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RescueGenerateResponse } from '@meal-rescue/shared-types';

import { getAftercareEligibilitySafe } from '../../services/aftercare.api';
import { hasOneSignalAppId } from '../../services/onesignal.service';
import { colors, spacing } from '../../theme';
import { LivingPlate } from '../living-plate/LivingPlate';
import { aftercareColors } from './tokens';

/**
 * Aftercare/Living Plate integration slots (OWNED BY v2/aftercare branch).
 *
 * Keep exported names + prop signatures EXACTLY as the frozen contract:
 *   LivingPlateSlot({ result }: { result: RescueGenerateResponse })
 *   SatisfactionCheckinSlot({ rescueId, recommendation })
 *   SATISFACTION_ROUTE
 */

export function LivingPlateSlot({ result }: { result: RescueGenerateResponse }) {
  return <LivingPlate result={result} />;
}

/**
 * Post-result satisfaction hand-off.
 *
 * On mount it asks the backend whether this rescue is eligible for an
 * aftercare check-in. Eligibility is silent when the backend says no
 * (cooldown / dedupe / disabled) - zero nagging. When eligible and OneSignal
 * is unconfigured (keyless dev build) it emits the explicit dry-run marker
 * and shows the inline microcopy, with a one-tap path to the check-in screen.
 */
export function SatisfactionCheckinSlot({
  rescueId,
  recommendation,
}: {
  rescueId: string;
  recommendation: string;
}) {
  // Local param list: SATISFACTION_ROUTE is registered in AppNavigator by the
  // mobile-core agent; typing against the route constant keeps this branch
  // compiling before that lands (coordinator merges the registration).
  const navigation = useNavigation<
    NativeStackNavigationProp<{
      SatisfactionCheckin: { rescueId: string; recommendation: string };
    }>
  >();
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [dryRun, setDryRun] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const outcome = await getAftercareEligibilitySafe(rescueId);
      if (!mounted) return;
      if (outcome.ok) {
        setEligible(outcome.data.eligible);
        if (outcome.data.eligible && !hasOneSignalAppId()) {
          /* eslint-disable no-console */
          console.log(
            `[dry-run] would send aftercare for rescue=${rescueId} (one check-in, cooldown respected)`,
          );
          /* eslint-enable no-console */
          setDryRun(true);
        }
      } else {
        setEligible(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [rescueId]);

  if (eligible === false || (!eligible && !dryRun)) return null;

  const openCheckin = () => {
    navigation.navigate('SatisfactionCheckin', { rescueId, recommendation });
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.hand}>👋</Text>
        <View style={styles.textWrap}>
          <Text style={styles.title}>We'll check in later</Text>
          <Text style={styles.body}>No spam, no guilt - just one quick nudge after you eat.</Text>
        </View>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Check in on how it went"
        onPress={openCheckin}
        style={styles.action}
        activeOpacity={0.7}
      >
        <Text style={styles.actionText}>How did it hit?</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Route name the mobile-core navigator registers for the check-in screen. */
export const SATISFACTION_ROUTE = 'SatisfactionCheckin' as const;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  hand: {
    fontSize: 22,
    marginTop: 2,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  body: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  action: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  actionText: {
    color: aftercareColors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
});
