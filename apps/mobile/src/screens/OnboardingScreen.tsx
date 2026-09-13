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
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  CulinaryFamily,
} from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { haptics } from '../services/haptics';
import { startOnboarding, submitCuisinePreferences } from '../services/taste.api';
import { useAuthStore } from '../stores/auth.store';
import { colors, spacing, typography } from '../theme';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

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

const MEAL_FEEL_OPTIONS: Array<{ id: string; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'comforting', label: 'Comforting', desc: 'Warm, familiar, satisfying', icon: 'heart-outline' },
  { id: 'flavorful', label: 'Flavorful', desc: 'Bold, spicy, rich, exciting', icon: 'flame-outline' },
  { id: 'fresh', label: 'Fresh', desc: 'Light, crisp, refreshing', icon: 'leaf-outline' },
  { id: 'filling', label: 'Filling', desc: 'Something that really feels substantial', icon: 'restaurant-outline' },
  { id: 'textural', label: 'Textural', desc: 'Crunchy, crispy, creamy, interesting', icon: 'grid-outline' },
  { id: 'balanced', label: 'Balanced', desc: 'A little bit of everything', icon: 'git-compare-outline' },
];

const RESCUE_STYLE_OPTIONS: Array<{ id: string; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'mostly_same', label: 'Keep it mostly the same', desc: 'Small additions or finishing touches', icon: 'add-circle-outline' },
  { id: 'little_upgrade', label: 'Give it a little upgrade', desc: 'Add a couple of things', icon: 'arrow-up-outline' },
  { id: 'open_to_change', label: "I'm open to changing it", desc: 'Bigger modifications are okay', icon: 'swap-horizontal-outline' },
  { id: 'surprise_me', label: 'Surprise me', desc: "I don't mind unusual ideas", icon: 'shuffle-outline' },
];

const HUNGRY_OPTIONS: Array<{ id: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'fast', label: 'I want it fast', icon: 'flash-outline' },
  { id: 'low_cleanup', label: 'I hate cleanup', icon: 'sparkles-outline' },
  { id: 'dont_mind_cooking', label: "I don't mind cooking", icon: 'restaurant-outline' },
  { id: 'one_extra', label: 'I can get one extra ingredient', icon: 'cart-outline' },
  { id: 'use_existing', label: 'I want to use what I already have', icon: 'home-outline' },
];

const RESCUE_PRIORITY_OPTIONS: Array<{ id: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'satisfaction', label: 'Make it more satisfying', icon: 'heart-outline' },
  { id: 'keep_craving', label: 'Keep the craving intact', icon: 'bookmark-outline' },
  { id: 'use_what_i_have', label: 'Use what I already have', icon: 'cube-outline' },
  { id: 'try_something_new', label: 'Try something new', icon: 'compass-outline' },
];

const TOTAL_STEPS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OnboardingStep = 'cuisine' | 'mealFeel' | 'rescueStyle' | 'hungryTired' | 'rescuePriority';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Onboarding'>>();
  const setOnboardingCompleted = useAuthStore((state) => state.setOnboardingCompleted);

  const [step, setStep] = useState<OnboardingStep>('cuisine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Selections
  const [selectedCuisines, setSelectedCuisines] = useState<Set<CulinaryFamily>>(new Set());
  const [selectedMealFeel, setSelectedMealFeel] = useState<Set<string>>(new Set());
  const [selectedRescueStyle, setSelectedRescueStyle] = useState<Set<string>>(new Set());
  const [selectedHungry, setSelectedHungry] = useState<Set<string>>(new Set());
  const [selectedPriority, setSelectedPriority] = useState<Set<string>>(new Set());

  const currentStepNum =
    step === 'cuisine' ? 1
    : step === 'mealFeel' ? 2
    : step === 'rescueStyle' ? 3
    : step === 'hungryTired' ? 4
    : 5;

  useEffect(() => {
    void loadOnboarding();
  }, []);

  useEffect(() => {
    if (step === 'cuisine' && !loading) {
      // Already handled by loadOnboarding
    }
  }, [step, loading]);

  function finishOnboarding() {
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }

  function handleSkip() {
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }

  async function loadOnboarding() {
    setLoading(true);
    setError(null);
    try {
      const state = await startOnboarding();
      if (state.completed) {
        finishOnboarding();
        return;
      }
      // Onboarding step comes back as 'cuisine' or 'pair'
      // We always start with our cuisine step regardless
      setStep('cuisine');
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }

  // ---- Step handlers ----

  function toggleCuisine(family: CulinaryFamily) {
    haptics.light();
    setSelectedCuisines((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }

  function toggleMulti(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    haptics.light();
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCuisineContinue() {
    if (selectedCuisines.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitCuisinePreferences(Array.from(selectedCuisines));
      setStep('mealFeel');
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleMealFeelContinue() {
    if (selectedMealFeel.size === 0) return;
    haptics.medium();
    setStep('rescueStyle');
  }

  function handleRescueStyleContinue() {
    if (selectedRescueStyle.size === 0) return;
    haptics.medium();
    setStep('hungryTired');
  }

  function handleHungryContinue() {
    if (selectedHungry.size === 0) return;
    haptics.medium();
    setStep('rescuePriority');
  }

  function handlePriorityContinue() {
    if (selectedPriority.size === 0) return;
    haptics.medium();
    setOnboardingCompleted(true);
    finishOnboarding();
  }

  function goBack() {
    haptics.light();
    if (step === 'mealFeel') setStep('cuisine');
    else if (step === 'rescueStyle') setStep('mealFeel');
    else if (step === 'hungryTired') setStep('rescueStyle');
    else if (step === 'rescuePriority') setStep('hungryTired');
  }

  const progress = (currentStepNum / TOTAL_STEPS) * 100;

  // ---- Loading ----

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Setting up your taste profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Render ----

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          Step {currentStepNum} of {TOTAL_STEPS}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      {step === 'cuisine' && (
        <CuisineStep
          options={CUISINE_OPTIONS}
          selected={selectedCuisines}
          busy={submitting}
          onToggle={toggleCuisine}
          onContinue={handleCuisineContinue}
          error={error}
          onSkip={handleSkip}
        />
      )}

      {step === 'mealFeel' && (
        <MultiSelectStep
          title="What makes a meal feel right?"
          subtitle="Pick 1–3 that matter most to you."
          options={MEAL_FEEL_OPTIONS}
          selected={selectedMealFeel}
          minSelect={1}
          onToggle={(id) => toggleMulti(setSelectedMealFeel, id)}
          onContinue={handleMealFeelContinue}
          onBack={goBack}
        />
      )}

      {step === 'rescueStyle' && (
        <MultiSelectStep
          title="How do you like food rescued?"
          subtitle="When food needs a little help, what sounds most like you?"
          options={RESCUE_STYLE_OPTIONS}
          selected={selectedRescueStyle}
          minSelect={1}
          onToggle={(id) => toggleMulti(setSelectedRescueStyle, id)}
          onContinue={handleRescueStyleContinue}
          onBack={goBack}
        />
      )}

      {step === 'hungryTired' && (
        <MultiSelectStep
          title="When you're hungry and tired, what's usually true?"
          subtitle="Pick whatever fits."
          options={HUNGRY_OPTIONS}
          selected={selectedHungry}
          minSelect={1}
          onToggle={(id) => toggleMulti(setSelectedHungry, id)}
          onContinue={handleHungryContinue}
          onBack={goBack}
        />
      )}

      {step === 'rescuePriority' && (
        <MultiSelectStep
          title="When I rescue your food, what should I prioritize?"
          subtitle="Pick up to 2."
          options={RESCUE_PRIORITY_OPTIONS}
          selected={selectedPriority}
          minSelect={1}
          maxSelect={2}
          onToggle={(id) => {
            toggleMulti(setSelectedPriority, id);
            // Enforce max 2
            setSelectedPriority((prev) => {
              if (prev.size > 2) {
                const arr = Array.from(prev);
                return new Set(arr.slice(-2));
              }
              return prev;
            });
          }}
          onContinue={handlePriorityContinue}
          onBack={goBack}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-steps
// ---------------------------------------------------------------------------

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
      <Text style={typography.title}>What kinds of food do you love?</Text>
      <Text style={styles.subtitle}>Select 3–5.</Text>
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

function MultiSelectStep({
  title,
  subtitle,
  options,
  selected,
  minSelect = 1,
  maxSelect: _maxSelect,
  onToggle,
  onContinue,
  onBack,
}: {
  title: string;
  subtitle: string;
  options: Array<{ id: string; label: string; desc?: string; icon: keyof typeof Ionicons.glyphMap }>;
  selected: Set<string>;
  minSelect?: number;
  maxSelect?: number;
  onToggle: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const canContinue = selected.size >= minSelect;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={[typography.title, styles.stepTitle]}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {options.map((option) => {
        const isSelected = selected.has(option.id);
        return (
          <TouchableOpacity
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.label}
            onPress={() => onToggle(option.id)}
            activeOpacity={0.85}
            style={[styles.optionRow, isSelected && styles.optionRowSelected]}
          >
            <View style={[styles.optionIconWrap, isSelected && styles.optionIconWrapSelected]}>
              <Ionicons name={option.icon} size={22} color={isSelected ? colors.softViolet : colors.textSecondary} />
            </View>
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              {option.desc ? <Text style={styles.optionDesc}>{option.desc}</Text> : null}
            </View>
            <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
      <PrimaryButton
        label={canContinue ? 'Continue' : `Pick at least ${minSelect}`}
        onPress={onContinue}
        disabled={!canContinue}
      />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  progressRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  progressText: { color: colors.textSecondary, fontSize: 13 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  subtitle: { color: colors.textSecondary, fontSize: 15, marginBottom: spacing.md },
  stepTitle: { marginBottom: spacing.xs },

  // Cuisine grid
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

  // Multi-select options
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.md,
    minHeight: 72,
  },
  optionRowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconWrapSelected: { backgroundColor: colors.primary },
  optionTextWrap: { flex: 1 },
  optionLabel: { fontSize: 17, fontWeight: '600', color: colors.text },
  optionDesc: { fontSize: 14, color: colors.textSecondary, marginTop: 3 },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Navigation
  backButton: { marginBottom: spacing.md, minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.textSecondary, fontSize: 15 },
  skipButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  skipText: { color: colors.textSecondary, fontSize: 14 },
});
