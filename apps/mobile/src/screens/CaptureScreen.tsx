import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { HomeStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, typography } from '../theme';

/**
 * Meal capture: camera / photo / text input.
 * Camera integration lands in Phase 3; navigation flow is wired now.
 */
export function CaptureScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={[typography.heading, styles.title]}>Capture</Text>
        <Text style={typography.caption}>Camera and text input arrive in Phase 3.</Text>

        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('RescueResult')}
        >
          <Text style={styles.ctaText}>Preview rescue flow</Text>
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
  title: {
    marginBottom: spacing.sm,
  },
  cta: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
    marginTop: spacing.xl,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
