import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  Constraints,
  MealAnalysisResponse,
  RescueGenerateResponse,
} from '@meal-rescue/shared-types';

import { Chip } from '../components/Chip';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { generateRescue } from '../services/rescue.api';
import { colors, spacing, typography } from '../theme';

/**
 * One screen, two jobs (kept together to avoid an extra step):
 * 1. Confirm what was detected - "Is that correct?" guards against
 *    hallucinated ingredients. Edit goes back to typing.
 * 2. Constraint shortcuts - tappable chips, never a form, skippable.
 */
export function ReviewScreen({ route }: { route: { params: { analysis: MealAnalysisResponse } } }) {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { analysis } = route.params;

  const [quick, setQuick] = useState(false);
  const [noCooking, setNoCooking] = useState(false);
  const [cheap, setCheap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  const foodNames = analysis.detectedFoods.map((food) => food.name);
  const needsConfirm = analysis.requiresConfirmation;

  function buildConstraints(): Constraints {
    const constraints: Constraints = {};
    if (quick) {
      constraints.timeMinutes = 5;
      constraints.cookingRequired = false;
    }
    if (noCooking) {
      constraints.cookingRequired = false;
    }
    if (cheap) {
      constraints.budget = 'low';
    }
    return constraints;
  }

  async function handleRescue() {
    setError(null);
    setBusy(true);
    try {
      const result: RescueGenerateResponse = await generateRescue(
        analysis.mealId,
        buildConstraints(),
      );
      navigation.navigate('RescueResult', { result });
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

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
          <View style={styles.components}>
            <Text style={[typography.caption, styles.componentLine]}>
              Protein: {analysis.detectedComponents.protein ? 'yes' : 'missing'} · Fiber:{' '}
              {analysis.detectedComponents.fiber_sources ? 'yes' : 'missing'} · Healthy fat:{' '}
              {analysis.detectedComponents.healthy_fat_sources ? 'yes' : 'missing'}
            </Text>
          </View>
        </View>

        {needsConfirm && (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmQuestion}>Is that correct?</Text>
            <PrimaryButton
              label="Not quite - let me type it"
              variant="ghost"
              onPress={() => navigation.navigate('Capture')}
              style={styles.editButton}
            />
          </View>
        )}

        <Text style={[typography.heading, styles.constraintsTitle]}>Anything to keep in mind?</Text>
        <Text style={[typography.caption, styles.constraintsHint]}>Optional - skip any.</Text>
        <View style={styles.chips}>
          <Chip label="⏱ 5 minutes" selected={quick} onToggle={() => setQuick(!quick)} />
          <Chip
            label="🍳 No cooking"
            selected={noCooking}
            onToggle={() => setNoCooking(!noCooking)}
          />
          <Chip label="💰 Keep it cheap" selected={cheap} onToggle={() => setCheap(!cheap)} />
        </View>

        <ErrorBanner error={error} />

        <PrimaryButton
          label="Rescue my meal"
          onPress={() => void handleRescue()}
          busy={busy}
          style={styles.rescueButton}
        />
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
  },
  foodList: {
    gap: spacing.xs,
  },
  foodItem: {
    fontSize: 16,
    color: colors.text,
  },
  components: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  componentLine: {},
  confirmBox: {
    marginTop: spacing.md,
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
  constraintsTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  constraintsHint: {
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  rescueButton: {
    marginTop: 'auto',
  },
});
