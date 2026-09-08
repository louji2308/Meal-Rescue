import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { haptics } from '../../services/haptics';
import { colors, spacing } from '../../theme';

/**
 * REVERSIBILITY (plan §9 / §36): every recommendation is editable in place.
 * Remove an added ingredient, or swap it for a lighter suggestion - with an
 * immediate explanation update (the parent recomputes the hero copy).
 *
 * This is a client-side, in-place edit (the pre-integration backend keeps the
 * original candidate); the final edited choice is what the user posts forward.
 */
const SWAP_SUGGESTIONS: Record<string, string[]> = {
  egg: ['tofu', 'canned tuna', 'rotisserie chicken'],
  cheese: ['avocado', 'hummus', 'peanut butter'],
  spinach: ['lettuce', 'cabbage', 'rocket'],
  tomatoes: ['bell pepper', 'cucumber'],
  rice: ['quinoa', 'couscous', 'cauliflower rice'],
};

export function ReversibilityEditor({
  additions,
  onReplace,
  onRemove,
}: {
  additions: string[];
  onReplace: (index: number, replacement: string) => void;
  onRemove: (index: number) => void;
}) {
  if (additions.length === 0) {
    return <Text style={styles.empty}>Nothing to edit — this one’s already simple.</Text>;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Make it yours — tweak any part</Text>
      {additions.map((name, index) => {
        const suggestions = SWAP_SUGGESTIONS[name.toLowerCase()] ?? [];
        return (
          <View key={`${name}-${index}`} style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.rowIngredient}>{name}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Remove ${name}`}
                onPress={() => {
                  haptics.light();
                  onRemove(index);
                }}
                style={styles.remove}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {suggestions.length > 0 ? (
              <View style={styles.swapWrap}>
                <Text style={styles.swapLabel}>Swap for:</Text>
                <View style={styles.swapRow}>
                  {suggestions.map((suggestion) => (
                    <TouchableOpacity
                      key={suggestion}
                      accessibilityRole="button"
                      accessibilityLabel={`Swap ${name} for ${suggestion}`}
                      style={styles.swapChip}
                      activeOpacity={0.7}
                      onPress={() => {
                        haptics.light();
                        onReplace(index, suggestion);
                      }}
                    >
                      <Text style={styles.swapChipText}>{suggestion}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  empty: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  heading: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowIngredient: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  remove: {
    padding: spacing.xs,
  },
  swapWrap: {
    marginTop: spacing.sm,
  },
  swapLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  swapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  swapChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primaryLight,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  swapChipText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
});
