import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../theme';

/** Fridge Negotiator - max 3 recommendations from what you have (Phase 5). */
export function FridgeNegotiatorScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={[typography.heading, styles.title]}>Fridge Negotiator</Text>
        <Text style={typography.caption}>
          Tell it what is in your fridge; it negotiates the best meal. Ships in Phase 5.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: {
    marginBottom: spacing.sm,
  },
});
