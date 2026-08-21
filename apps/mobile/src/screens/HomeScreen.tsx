import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { HomeStackParamList } from '../navigation/AppNavigator';
import { useAuthStore } from '../stores/auth.store';
import { colors, spacing, typography } from '../theme';

/**
 * Home = the loop's entry point: "What are you eating?"
 * One primary action. No feed, no dashboard, no noise.
 */
export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const user = useAuthStore((state) => state.user);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={[typography.caption, styles.greeting]}>
          {user ? `Hi ${user.email.split('@')[0]}` : ' '}
        </Text>
        <Text style={[typography.title, styles.question]}>What are you eating?</Text>
        <Text style={[typography.body, styles.subtitle]}>
          Snap your meal and get the smallest change that makes it better.
        </Text>

        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Capture')}
          accessibilityRole="button"
          accessibilityLabel="Capture a meal"
        >
          <Ionicons name="camera" size={28} color={colors.surface} />
          <Text style={styles.ctaText}>Capture a meal</Text>
        </TouchableOpacity>
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
  greeting: {
    marginBottom: spacing.sm,
  },
  question: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
