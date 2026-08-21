import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '../stores/auth.store';
import { colors, spacing, typography } from '../theme';

/**
 * Profile: auth state, subscription tier, preferences.
 * Phase 3 adds sign-in UI; Phase 4 adds preference management.
 */
export function ProfileScreen() {
  const user = useAuthStore((state) => state.user);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={[typography.heading, styles.title]}>Profile</Text>
        <Text style={typography.body}>{user ? `Signed in as ${user.email}` : 'Not signed in'}</Text>
        <Text style={typography.caption}>Sign-in flow and preferences arrive in Phases 3-4.</Text>
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
