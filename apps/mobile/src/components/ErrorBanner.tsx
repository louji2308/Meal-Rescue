import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '../services/api';
import { colors, spacing } from '../theme';

interface ErrorBannerProps {
  error: ApiError | null;
}

/**
 * Single place where API failures reach the user: the backend's plain
 * message plus its suggested action when one exists. No stack traces,
 * no codes - plain language only.
 */
export function ErrorBanner({ error }: ErrorBannerProps) {
  if (!error) {
    return null;
  }

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Text style={styles.message}>{error.message}</Text>
      {error.suggestedAction ? (
        <Text style={styles.suggestion}>{error.suggestedAction}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FDECEA',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  message: {
    color: colors.error,
    fontSize: 14,
  },
  suggestion: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.xs,
  },
});
