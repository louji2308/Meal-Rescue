import { Ionicons } from '@expo/vector-icons';
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

  const mealSummary =
    foodNames.length > 0
      ? foodNames.length === 1
        ? foodNames[0]
        : foodNames.slice(0, -1).join(', ') + ' and ' + foodNames[foodNames.length - 1]
      : analysis.detectedIngredients.map((i) => i.name).join(', ') || 'your meal';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="restaurant-outline" size={32} color={colors.primary} />
          <Text style={[typography.heading, styles.title]}>Here's what I see</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.mealText}>{mealSummary}</Text>
        </View>

        {needsConfirm && (
          <View style={styles.confirmBox}>
            <PrimaryButton
              label="Hmm, that's not quite right"
              variant="ghost"
              onPress={() => navigation.goBack()}
              style={styles.editButton}
            />
          </View>
        )}

        <View style={styles.footer}>
          <PrimaryButton
            label="Looks good — let's decide"
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
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  mealText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  confirmBox: {
    marginBottom: spacing.md,
  },
  editButton: {
    alignItems: 'center',
    paddingHorizontal: 0,
    minHeight: 40,
  },
  footer: {
    marginTop: 'auto',
  },
  decideButton: {
    marginBottom: spacing.sm,
  },
});
