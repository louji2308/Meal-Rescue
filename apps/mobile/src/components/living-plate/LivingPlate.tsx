import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RescueGenerateResponse } from '@meal-rescue/shared-types';

import { haptics } from '../../services/haptics';
import { colors, spacing, typography } from '../../theme';
import { aftercareColors } from '../aftercare/tokens';
import { CounterfactualBubble } from './CounterfactualBubble';
import { PlateVisualization } from './PlateVisualization';
import { glyphForName } from './assets';
import {
  buildAdditionCounterfactual,
  buildKeepAsIsCopy,
  buildSubstitutionCounterfactual,
} from './counterfactual';

interface LivingPlateProps {
  result: RescueGenerateResponse;
}

interface Token {
  name: string;
  kind: 'addition' | 'swap';
  index: number;
}

/**
 * LIVING PLATE (§9) — the interactive before/after plate.
 *
 * The user taps an addition (or swap) and the plate physically changes,
 * answered by a counterfactual explanation grounded strictly in candidate
 * data ("What changes if I do this?"). When the best move is KEEP_AS_IS the
 * plate calmly says "leave it as is" — never pressure to add anything.
 */
export function LivingPlate({ result }: LivingPlateProps) {
  const candidate = result.recommendation.candidate;
  const baseFood = result.originalMeal.foods.join(', ');

  const tokens: Token[] = useMemo(() => {
    const additions = (candidate.additions ?? []).map((a, index) => ({
      name: a.name,
      kind: 'addition' as const,
      index,
    }));
    if (additions.length > 0) return additions;
    const swaps = (candidate.substitutions ?? []).map((s) => ({
      name: s.replacement.name,
      kind: 'swap' as const,
      index: 0,
    }));
    return swaps;
  }, [candidate]);

  const [selected, setSelected] = useState<Token | null>(null);

  const keepsAsIs = tokens.length === 0;

  const fact = useMemo(() => {
    if (keepsAsIs) return buildKeepAsIsCopy(baseFood);
    if (!selected) return null;
    if (selected.kind === 'addition') {
      const addition = candidate.additions[selected.index];
      return addition ? buildAdditionCounterfactual(addition, candidate) : null;
    }
    const substitution = candidate.substitutions?.[0];
    return substitution ? buildSubstitutionCounterfactual(substitution, candidate) : null;
  }, [keepsAsIs, baseFood, selected, candidate]);

  const toggle = (token: Token) => {
    haptics.light();
    setSelected((prev) => (prev?.name === token.name ? null : token));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>See what changes</Text>
      <Text style={styles.subheading}>
        {keepsAsIs
          ? 'Your plate is already good as it is.'
          : 'Tap an addition to play with the before / after.'}
      </Text>

      <PlateVisualization
        active={selected !== null && !keepsAsIs}
        glyph={selected ? glyphForName(selected.name) : ''}
        badged={selected === null ? false : !keepsAsIs}
      />

      {!keepsAsIs && (
        <View style={styles.chips}>
          {tokens.map((token) => {
            const on = selected?.name === token.name;
            return (
              <TouchableOpacity
                key={token.name}
                accessibilityRole="button"
                accessibilityLabel={`${on ? 'Remove' : 'Add'} ${token.name}`}
                accessibilityState={{ selected: on }}
                onPress={() => toggle(token)}
                style={[styles.chip, on && styles.chipOn]}
                activeOpacity={0.7}
              >
                <Text style={styles.chipGlyph}>{glyphForName(token.name)}</Text>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{token.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <CounterfactualBubble fact={fact} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
  },
  heading: {
    ...typography.heading,
    fontSize: 18,
    textAlign: 'center',
  },
  subheading: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 18,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: aftercareColors.accentSoft,
    borderColor: aftercareColors.accent,
  },
  chipGlyph: {
    fontSize: 15,
    marginRight: 5,
  },
  chipText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  chipTextOn: {
    color: aftercareColors.accent,
  },
});
