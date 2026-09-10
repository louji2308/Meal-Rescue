import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../../theme';

/**
 * Shared layout shell for the V2 decision steps (intent / reality / craving).
 * Warm, centered, one question at a time - never a form. A small progress
 * hint keeps the journey feeling SHORT (3 easy taps, not a wizard).
 */
export function StepShell({
  step,
  title,
  subtitle,
  children,
}: {
  step: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[typography.caption, styles.step]}>{step} of 3 quick questions</Text>
          <Text style={[typography.title, styles.title]}>{title}</Text>
          {subtitle ? <Text style={[typography.body, styles.subtitle]}>{subtitle}</Text> : null}
        </View>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  header: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  step: {
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
    color: colors.secondary,
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
  },
  body: {},
});
