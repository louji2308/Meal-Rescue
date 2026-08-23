import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getAdEligibility } from '../../services/ads.api';
import { colors, spacing, typography } from '../../theme';

interface StaplesShelfProps {
  /** Candidate ingredient names the user may be missing. */
  staples: string[];
}

/**
 * Staples Shelf - a subtle strip of suggested staple ingredients derived
 * from the current recommendation. Free users can tap a chip to open a
 * clearly-labeled sponsored card; Pro users never see the strip.
 */
export function StaplesShelf({ staples }: StaplesShelfProps) {
  const [isFreeTier, setIsFreeTier] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdEligibility()
      .then((eligibility) => {
        if (!cancelled) setIsFreeTier(eligibility.tier === 'free');
      })
      .catch(() => {
        if (!cancelled) setIsFreeTier(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isFreeTier || staples.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Staples that make this work</Text>
      <View style={styles.chipRow}>
        {staples.map((staple) => (
          <TouchableOpacity
            key={staple}
            accessibilityRole="button"
            accessibilityLabel={`Learn about ${staple}`}
            style={styles.chip}
            activeOpacity={0.8}
            onPress={() => setSelected(staple)}
          >
            <Text style={styles.chipText}>{staple}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.sponsorLabel}>Sponsored</Text>
            {selected !== null && (
              <>
                <Text style={[typography.heading, styles.title]}>{selected}</Text>
                <Text style={[typography.body, styles.body]}>
                  Keep {selected} on hand and this rescue is always one step away.
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Find ${selected} in store`}
                  style={styles.storeButton}
                  activeOpacity={0.85}
                  onPress={() => setSelected(null)}
                >
                  <Text style={styles.storeButtonText}>Find in store</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              onPress={() => setSelected(null)}
              style={styles.dismissButton}
            >
              <Text style={styles.dismissText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 14,
    color: colors.text,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
  },
  sponsorLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  title: {
    textTransform: 'capitalize',
    marginBottom: spacing.xs,
  },
  body: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  storeButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  storeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  dismissButton: {
    marginTop: spacing.sm,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  dismissText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
