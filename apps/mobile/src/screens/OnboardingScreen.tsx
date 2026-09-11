import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  CulinaryFamily,
  OnboardingPair,
  OnboardingStartResponse,
} from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { haptics } from '../services/haptics';
import {
  answerOnboarding,
  startOnboarding,
  submitCuisinePreferences,
} from '../services/taste.api';
import { useAuthStore } from '../stores/auth.store';
import { colors, spacing, typography } from '../theme';

interface CuisineOption {
  family: CulinaryFamily;
  name: string;
  examples: string;
  image: ImageSourcePropType;
}

const CUISINE_OPTIONS: CuisineOption[] = [
  { family: 'italian', name: 'Italian', examples: 'Pizza, pasta, risotto', image: require('../../assets/cuisines/italian.png') },
  { family: 'indian', name: 'Indian', examples: 'Curry, biryani, dosa', image: require('../../assets/cuisines/indian.png') },
  { family: 'mexican', name: 'Mexican', examples: 'Tacos, burritos, mole', image: require('../../assets/cuisines/mexican.png') },
  { family: 'east_asian', name: 'East Asian', examples: 'Ramen, stir-fry, pho', image: require('../../assets/cuisines/east_asian.png') },
  { family: 'mediterranean', name: 'Mediterranean', examples: 'Falafel, hummus, shawarma', image: require('../../assets/cuisines/mediterranean.png') },
  { family: 'american', name: 'American', examples: 'Burgers, BBQ, soul food', image: require('../../assets/cuisines/american.png') },
  { family: 'middle_eastern', name: 'Middle Eastern', examples: 'Kebabs, tabbouleh, shakshuka', image: require('../../assets/cuisines/middle_eastern.png') },
  { family: 'african', name: 'African', examples: 'Jollof, injera, tagine', image: require('../../assets/cuisines/african.png') },
  { family: 'caribbean', name: 'Caribbean', examples: 'Jerk, plantains, roti', image: require('../../assets/cuisines/caribbean.png') },
  { family: 'thai', name: 'Thai', examples: 'Pad thai, green curry, som tum', image: require('../../assets/cuisines/thai.png') },
];

type Phase = 'loading' | 'cuisine' | 'pair' | 'done';

/**
 * First-login onboarding: pick beloved cuisines (step 1) then answer the
 * adaptive A/B pair questions. "Skip for now" exits to the app but leaves
 * onboarding incomplete so it re-opens on the next launch.
 */
export function OnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Onboarding'>>();
  const setOnboardingCompleted = useAuthStore((state) => state.setOnboardingCompleted);
  const [phase, setPhase] = useState<Phase>('loading');
  const [pair, setPair] = useState<OnboardingPair | null>(null);
  const [selected, setSelected] = useState<Set<CulinaryFamily>>(new Set());
  const [currentStep, setCurrentStep] = useState(1);
  const [totalSteps, setTotalSteps] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

useEffect(() => {
    void loadOnboarding();
  }, []);

  function finishOnboarding() {
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }

  function handleSkip() {
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }

  function applyState(state: OnboardingStartResponse) {
    setTotalSteps(state.totalSteps);
    setCurrentStep(state.currentStep);
    if (state.completed) {
      setPhase('done');
      return;
    }
    if (state.kind === 'cuisine') {
      setSelected(new Set());
      setPhase('cuisine');
      return;
    }
    if (state.kind === 'pair' && state.pair) {
      setPair(state.pair);
      setPhase('pair');
      return;
    }
    setPhase('done');
  }

  async function loadOnboarding() {
    setBusy(true);
    setError(null);
    try {
      applyState(await startOnboarding());
    } catch (err) {
      setError(toApiError(err));
      setPhase('done');
    } finally {
      setBusy(false);
    }
  }

  function toggleCuisine(family: CulinaryFamily) {
    if (busy) return;
    haptics.light();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }

  async function handleCuisineContinue() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const cuisines = Array.from(selected);
      const state = await submitCuisinePreferences(cuisines);
      setSelected(new Set());
      applyState(state);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePairAnswer(choice: 'A' | 'B') {
    if (busy || !pair) return;
    setBusy(true);
    setError(null);
    try {
      const result = await answerOnboarding({
        pairId: pair.id,
        selected: choice,
        unavailableOption: null,
      });
      if (result.summary || !result.next) {
        setOnboardingCompleted(true);
        setPair(null);
        setPhase('done');
        return;
      }
      setPair(result.next);
      setCurrentStep((step) => Math.min(totalSteps, step + 1));
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Setting up your taste profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Text style={[typography.title, styles.doneTitle]}>You're all set!</Text>
          <Text style={[typography.body, styles.doneBody]}>
            Your rescue suggestions will now lean into the flavors you love.
          </Text>
          {error ? <ErrorBanner error={error} /> : null}
          <PrimaryButton label="Let's cook" onPress={finishOnboarding} style={styles.doneButton} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          Step {currentStep} of {totalSteps}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      {phase === 'cuisine' ? (
        <CuisineStep
          options={CUISINE_OPTIONS}
          selected={selected}
          busy={busy}
          onToggle={toggleCuisine}
          onContinue={handleCuisineContinue}
          error={error}
          onSkip={handleSkip}
        />
      ) : (
        <PairStep pair={pair} busy={busy} onAnswer={handlePairAnswer} error={error} onSkip={handleSkip} />
      )}
    </SafeAreaView>
  );
}

function CuisineStep({
  options,
  selected,
  busy,
  onToggle,
  onContinue,
  error,
  onSkip,
}: {
  options: CuisineOption[];
  selected: Set<CulinaryFamily>;
  busy: boolean;
  onToggle: (family: CulinaryFamily) => void;
  onContinue: () => void;
  error: ReturnType<typeof toApiError> | null;
  onSkip: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={typography.title}>What cuisines do you love?</Text>
      <Text style={styles.subtitle}>Pick everything that makes you say yes.</Text>
      <View style={styles.grid}>
        {options.map((option) => {
          const isSelected = selected.has(option.family);
          return (
            <TouchableOpacity
              key={option.family}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={option.name}
              onPress={() => onToggle(option.family)}
              activeOpacity={0.85}
              style={[styles.cell, isSelected && styles.cellSelected]}
            >
              <Image source={option.image} style={styles.cellImage} />
              <Text style={styles.cellName}>{option.name}</Text>
              <Text style={styles.cellExamples}>{option.examples}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ErrorBanner error={error} />
      <PrimaryButton
        label={selected.size > 0 ? `Continue (${selected.size})` : 'Pick at least one'}
        onPress={onContinue}
        busy={busy}
        disabled={selected.size === 0}
      />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Skip onboarding"
        onPress={onSkip}
        style={styles.skipButton}
      >
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function PairStep({
  pair,
  busy,
  onAnswer,
  error,
  onSkip,
}: {
  pair: OnboardingPair | null;
  busy: boolean;
  onAnswer: (choice: 'A' | 'B') => void;
  error: ReturnType<typeof toApiError> | null;
  onSkip: () => void;
}) {
  if (!pair) return null;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[typography.title, styles.pairTitle]}>{pair.question}</Text>
      <OptionCard
        label={pair.optionA.name}
        detail={pair.optionA.blurb}
        onPress={() => onAnswer('A')}
        busy={busy}
      />
      <OptionCard
        label={pair.optionB.name}
        detail={pair.optionB.blurb}
        onPress={() => onAnswer('B')}
        busy={busy}
      />
      <ErrorBanner error={error} />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Skip onboarding"
        onPress={onSkip}
        style={styles.skipButton}
      >
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function OptionCard({
  label,
  detail,
  onPress,
  busy,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  busy: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
      style={styles.optionCard}
    >
      <Text style={styles.optionLabel}>{label}</Text>
      {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  loadingText: { color: colors.textSecondary, fontSize: 14 },
  doneTitle: { textAlign: 'center' },
  doneBody: { textAlign: 'center', color: colors.textSecondary },
  doneButton: { minWidth: 220 },
  progressRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  progressText: { color: colors.textSecondary, fontSize: 13 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  subtitle: { color: colors.textSecondary, fontSize: 15, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  cell: {
    width: '48%',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    alignItems: 'center',
  },
  cellSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  cellImage: { width: 80, height: 80, borderRadius: 8, marginBottom: spacing.sm },
  cellName: { fontSize: 15, fontWeight: '600', color: colors.text },
  cellExamples: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
  skipButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  skipText: { color: colors.textSecondary, fontSize: 14 },
  pairTitle: { marginBottom: spacing.md },
  optionCard: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  optionLabel: { fontSize: 17, fontWeight: '700', color: colors.text },
  optionDetail: { color: colors.textSecondary, fontSize: 14, marginTop: 2 },
});