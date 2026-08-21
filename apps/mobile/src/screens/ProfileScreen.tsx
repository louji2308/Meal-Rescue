import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/PrimaryButton';
import { useAuthStore } from '../stores/auth.store';
import { colors, spacing, typography } from '../theme';

/**
 * Identity + sign out. Preference learning and subscription management
 * arrive in later phases - nothing else belongs here yet.
 */
export function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={[typography.heading, styles.email]}>{user?.email}</Text>
        <Text style={[typography.caption, styles.tier]}>
          {user?.subscriptionTier === 'pro' ? 'Pro plan' : 'Free plan · 3 rescues/day'}
        </Text>

        <PrimaryButton
          label="Sign out"
          variant="ghost"
          onPress={clearSession}
          style={styles.signOut}
        />
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
  email: {
    marginBottom: spacing.xs,
  },
  tier: {
    marginBottom: spacing.xl,
  },
  signOut: {
    alignSelf: 'stretch',
  },
});
