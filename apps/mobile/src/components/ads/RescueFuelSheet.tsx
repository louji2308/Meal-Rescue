import React, { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RescueGenerateResponse } from '@meal-rescue/shared-types';

import { claimProPass, claimRescueFuel, getAdEligibility } from '../../services/ads.api';
import { hasAdMobAppId, showRewardedAd } from '../../services/ads.service';
import { toApiError } from '../../services/api';
import { colors, spacing, typography } from '../../theme';
import { PrimaryButton } from '../PrimaryButton';

interface RescueFuelSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Re-runs the blocked rescue after fuel is granted; called at most once. */
  onRecovered?: (result: RescueGenerateResponse) => void;
  retryGenerate?: () => Promise<RescueGenerateResponse>;
  onGoPro: () => void;
}

/**
 * Presented when /rescue/generate answers 429 DAILY_RESCUE_LIMIT.
 * Two honest options, zero dark patterns: watch a short ad for +2 rescues
 * today, try Pro free for an hour, or upgrade. Subscribers never see this.
 */
export function RescueFuelSheet({
  visible,
  onClose,
  onRecovered,
  retryGenerate,
  onGoPro,
}: RescueFuelSheetProps) {
  const [credits, setCredits] = useState<number | null>(null);
  const [proPassUntil, setProPassUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setNote(null);
    getAdEligibility()
      .then((eligibility) => {
        setCredits(eligibility.rescueCredits);
        if (eligibility.tier === 'pro') {
          setNote('You already have full access - just keep going.');
        }
      })
      .catch(() => setCredits(null));
  }, [visible]);

  const handleWatchForCredits = useCallback(async () => {
    setBusy(true);
    setNote(null);
    if (!hasAdMobAppId()) {
      setNote('Ads need a dev build with an AdMob App ID configured.');
      setBusy(false);
      return;
    }
    try {
      const txId = await showRewardedAd('rescue-fuel');
      const claim = await claimRescueFuel(txId);
      setCredits(claim.rescueCredits);
      if (claim.granted) {
        setNote('+2 rescues added for today.');
        if (retryGenerate && onRecovered) {
          const result = await retryGenerate();
          onClose();
          onRecovered(result);
          return;
        }
      } else {
        setNote('That reward was already used.');
      }
    } catch {
      setNote(toApiError(new Error('ad')).message);
    } finally {
      setBusy(false);
    }
  }, [onClose, onRecovered, retryGenerate]);

  const handleFreeProHour = useCallback(async () => {
    setBusy(true);
    setNote(null);
    if (!hasAdMobAppId()) {
      setNote('Ads need a dev build with an AdMob App ID configured.');
      setBusy(false);
      return;
    }
    try {
      const txId = await showRewardedAd('pro-pass');
      const claim = await claimProPass(txId);
      if (claim.granted && claim.proPassUntil) {
        setProPassUntil(claim.proPassUntil);
        setNote('Pro is yours until the hour ends. Unlimited rescues.');
      } else {
        setNote('That reward was already used.');
      }
    } catch {
      setNote(toApiError(new Error('ad')).message);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={[typography.heading, styles.title]}>Out of rescues today</Text>
          <Text style={[typography.body, styles.subtitle]}>
            You have used your 3 free rescues. Keep going with one of these:
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Watch a short ad for two extra rescues"
            style={styles.option}
            activeOpacity={0.8}
            disabled={busy || proPassUntil !== null}
            onPress={() => void handleWatchForCredits()}
          >
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionTitle}>Watch a short ad</Text>
              <Text style={styles.optionBody}>+2 extra rescues for today</Text>
            </View>
            {credits !== null && credits > 0 && <Text style={styles.creditBadge}>{credits}</Text>}
          </TouchableOpacity>

          {!proPassUntil && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Try Pro free for one hour"
              style={styles.option}
              activeOpacity={0.8}
              disabled={busy}
              onPress={() => void handleFreeProHour()}
            >
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Try Pro free for 1 hour</Text>
                <Text style={styles.optionBody}>Unlimited rescues, no ads, no card needed</Text>
              </View>
            </TouchableOpacity>
          )}

          <PrimaryButton
            label="Upgrade to Pro"
            onPress={() => {
              onClose();
              onGoPro();
            }}
            disabled={busy}
            style={styles.upgradeButton}
          />

          {note ? <Text style={styles.note}>{note}</Text> : null}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.closeButton}
            disabled={busy}
          >
            <Text style={styles.closeText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 64,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  optionBody: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  creditBadge: {
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  upgradeButton: {
    marginTop: spacing.sm,
  },
  note: {
    textAlign: 'center',
    color: colors.primary,
    marginTop: spacing.md,
    fontSize: 14,
  },
  closeButton: {
    marginTop: spacing.sm,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
