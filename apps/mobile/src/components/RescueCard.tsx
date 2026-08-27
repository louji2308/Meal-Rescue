import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';
import { PrimaryButton } from './PrimaryButton';

interface RescueCardProps {
  mealName: string;
  rescue: string;
  why: string;
  timeMinutes: number;
  effort: string;
  onShare: () => Promise<void>;
  onClose: () => void;
}

/**
 * Shareable Rescue Card - the "growth loop" artifact.
 * Visual card that can be shared to friends via native share sheet.
 * Product rule: sharing is a byproduct of a good result, not a requirement.
 */
export function RescueCard({
  mealName,
  rescue,
  why,
  timeMinutes,
  effort,
  onShare,
  onClose,
}: RescueCardProps) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.badge}>
            <Ionicons name="help-buoy" size={20} color={colors.primary} />
            <Text style={styles.badgeText}>Meal Rescue</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.mealLabel}>Your meal</Text>
        <Text style={styles.mealName}>{mealName}</Text>

        <View style={styles.divider} />

        <Text style={styles.rescueLabel}>Rescue</Text>
        <Text style={styles.rescueText}>{rescue}</Text>

        <View style={styles.divider} />

        <Text style={styles.whyLabel}>Why</Text>
        <Text style={styles.whyText}>{why}</Text>

        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text>{timeMinutes} min</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="flash-outline" size={16} color={colors.textSecondary} />
            <Text>Extra effort: {effort}</Text>
          </View>
        </View>

        <PrimaryButton label="Share this rescue" variant="secondary" onPress={onShare} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  badgeText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  mealLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  mealName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  rescueLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  rescueText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  whyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  whyText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.md,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
