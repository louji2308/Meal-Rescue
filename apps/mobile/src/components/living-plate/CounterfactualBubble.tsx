import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../theme';
import type { Counterfactual } from './counterfactual';

interface CounterfactualBubbleProps {
  fact: Counterfactual | null;
}

/**
 * The "what changes if I do this?" answer (plan §19). Shown as a friendly
 * speech bubble under the plate so the interaction reads like a suggestion
 * from a friend rather than a clinical verdict.
 */
export function CounterfactualBubble({ fact }: CounterfactualBubbleProps) {
  if (!fact) return null;
  return (
    <View style={styles.bubble}>
      <View style={styles.tail} />
      <Text style={styles.lead}>{fact.lead}</Text>
      <Text style={styles.body}>{fact.body}</Text>
      {fact.tags.length > 0 && (
        <View style={styles.tags}>
          {fact.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  tail: {
    position: 'absolute',
    top: -7,
    left: 34,
    width: 14,
    height: 14,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
  },
  lead: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tag: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
});
