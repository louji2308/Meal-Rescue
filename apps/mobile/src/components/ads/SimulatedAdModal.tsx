import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAdStore } from '../../services/ads.service';
import { colors, spacing, typography } from '../../theme';

const AD_DURATION_SECONDS = 3;

/**
 * Simulated rewarded ad. Mounted once at the app root; the ads gateway
 * controls visibility. Shows a branded countdown, then unlocks the reward.
 * Clearly labeled as sponsored - never disguised as app content.
 */
export function SimulatedAdModal() {
  const visible = useAdStore((state) => state.visible);
  const purpose = useAdStore((state) => state.purpose);
  const complete = useAdStore((state) => state.complete);
  const dismiss = useAdStore((state) => state.dismiss);

  const [secondsLeft, setSecondsLeft] = useState(AD_DURATION_SECONDS);

  useEffect(() => {
    if (!visible) return;
    setSecondsLeft(AD_DURATION_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [visible]);

  const earned = secondsLeft === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.sponsorLabel}>Sponsored · Meal Rescue</Text>
          <Text style={[typography.heading, styles.headline]}>
            {purpose === 'pro-pass' ? 'A partner message' : 'A short word from a partner'}
          </Text>
          <Text style={[typography.body, styles.body]}>
            Your reward unlocks when the countdown ends.
          </Text>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${((AD_DURATION_SECONDS - secondsLeft) / AD_DURATION_SECONDS) * 100}%` },
              ]}
            />
          </View>

          {earned ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Claim reward"
              style={styles.claimButton}
              activeOpacity={0.85}
              onPress={complete}
            >
              <Text style={styles.claimText}>Claim reward</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.waitingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.countdown}>{secondsLeft}s</Text>
            </View>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Cancel ad"
            onPress={dismiss}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>No thanks</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
  },
  sponsorLabel: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  headline: {
    marginBottom: spacing.xs,
  },
  body: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  claimButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  claimText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
  },
  countdown: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cancelButton: {
    marginTop: spacing.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
