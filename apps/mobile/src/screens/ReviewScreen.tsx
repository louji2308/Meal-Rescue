import { useNavigation, useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/PrimaryButton';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, typography } from '../theme';

/**
 * REVIEW (plan §33): confirm what was detected before making decisions.
 * The legacy constraint chips moved to the dedicated V2 Reality step
 * (RealityScreen), so this screen stays focused on one job: is the plate right?
 * "Looks good" goes straight into INTENT - one tap.
 */
export function ReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'Review'>>();
  const { analysis } = route.params;

  const foodNames = analysis.detectedFoods.map((food) => food.name);
  const needsConfirm = analysis.requiresConfirmation;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[typography.heading, styles.title]}>Your meal</Text>

        <View style={styles.card}>
          <View style={styles.foodList}>
            {foodNames.map((name) => (
              <Text key={name} style={styles.foodItem}>
                • {name}
              </Text>
            ))}
          </View>
          {foodNames.length === 0 ? (
            <Text style={styles.foodItem}>
              • {analysis.detectedIngredients.map((i) => i.name).join(', ') || 'A meal'}
            </Text>
          ) : null}
        </View>

        {needsConfirm && (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmQuestion}>Is that right?</Text>
            <PrimaryButton
              label="Not quite - let me type it"
              variant="ghost"
              onPress={() => navigation.goBack()}
              style={styles.editButton}
            />
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.prompt}>What do you want to do with it?</Text>
          <PrimaryButton
            label="Looks good — let’s decide"
            onPress={() => navigation.navigate('Intent', { analysis })}
            style={styles.decideButton}
          />
        </View>
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
  title: {
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  foodList: {
    gap: spacing.xs,
  },
  foodItem: {
    fontSize: 16,
    color: colors.text,
  },
  confirmBox: {
    marginBottom: spacing.md,
  },
  confirmQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  editButton: {
    alignItems: 'flex-start',
    paddingHorizontal: 0,
    minHeight: 40,
  },
  footer: {
    marginTop: 'auto',
  },
  prompt: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  decideButton: {
    marginBottom: spacing.sm,
  },
});
