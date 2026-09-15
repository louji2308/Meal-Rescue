import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '../components/AppText';
import { Pressable } from '../components/motion/Pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CulinaryFamily } from '@meal-rescue/shared-types';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { haptics } from '../services/haptics';
import { submitCuisinePreferences } from '../services/taste.api';
import { useAuthStore } from '../stores/auth.store';
import { colors, fonts, spacing } from '../theme';
import { FadeInView } from '../components/motion/FadeInView';

// ---------------------------------------------------------------------------
// Cuisine grid data
// ---------------------------------------------------------------------------

interface CuisineOption {
  id: CulinaryFamily;
  label: string;
  image: number;
}

const CUISINE_OPTIONS: CuisineOption[] = [
  { id: 'african', label: 'African', image: require('../../assets/cuisines/african.jpg') },
  { id: 'american', label: 'American', image: require('../../assets/cuisines/american.jpg') },
  { id: 'caribbean', label: 'Caribbean', image: require('../../assets/cuisines/caribbean.jpg') },
  { id: 'east_asian', label: 'East Asian', image: require('../../assets/cuisines/east_asian.jpg') },
  { id: 'indian', label: 'Indian', image: require('../../assets/cuisines/indian.jpg') },
  { id: 'italian', label: 'Italian', image: require('../../assets/cuisines/italian.jpg') },
  { id: 'mediterranean', label: 'Mediterranean', image: require('../../assets/cuisines/mediterranean.jpg') },
  { id: 'mexican', label: 'Mexican', image: require('../../assets/cuisines/mexican.jpg') },
  { id: 'middle_eastern', label: 'Middle Eastern', image: require('../../assets/cuisines/middle_eastern.jpg') },
  { id: 'thai', label: 'Thai', image: require('../../assets/cuisines/thai.jpg') },
];

// ---------------------------------------------------------------------------
// Questions (same as before, but with backend integration)
// ---------------------------------------------------------------------------

type QuestionId =
  | 'cuisine'
  | 'rescueStyle'
  | 'mealFeel'
  | 'changeAmount'
  | 'familiarVsNew'
  | 'cookingEffort'
  | 'whoAtTable'
  | 'neverSuggest';

type StepId = QuestionId | 'done';

interface Question {
  id: QuestionId;
  title: string;
  subtitle?: string;
  options: Array<{ id: string; label: string; desc?: string }>;
  maxSelect?: number;
}

const RESCUE_STYLE_Q: Question = {
  id: 'rescueStyle',
  title: 'You already have some food.\nWhat would you do with it?',
  options: [
    { id: 'keep_simple', label: 'Keep it simple', desc: 'Just make it better.' },
    { id: 'add_something', label: 'Add something', desc: 'Find a good side for it.' },
    { id: 'change_little', label: 'Change it a little', desc: 'Give it a new twist.' },
    { id: 'make_new', label: 'Make something new', desc: 'Turn it into a new meal.' },
  ],
};

const MEAL_FEEL_Q: Question = {
  id: 'mealFeel',
  title: 'What makes a meal feel right to you?',
  subtitle: 'Pick up to 2.',
  options: [
    { id: 'fresh', label: 'Fresh' },
    { id: 'crispy', label: 'Crispy' },
    { id: 'spicy', label: 'Spicy' },
    { id: 'tangy', label: 'Tangy' },
    { id: 'creamy', label: 'Creamy' },
    { id: 'filling', label: 'Something filling' },
  ],
  maxSelect: 2,
};

const CHANGE_AMOUNT_Q: Question = {
  id: 'changeAmount',
  title: 'How much should we\nchange your food?',
  subtitle: "We won't change what you love.",
  options: [
    { id: 'little', label: 'Just a little' },
    { id: 'twist', label: 'A nice twist' },
    { id: 'surprise', label: 'Surprise me' },
  ],
};

const FAMILIAR_VS_NEW_Q: Question = {
  id: 'familiarVsNew',
  title: 'Tonight, which sounds better?',
  options: [
    { id: 'familiar', label: 'Something I know I\u2019ll enjoy' },
    { id: 'different', label: 'Show me something different' },
  ],
};

const COOKING_EFFORT_Q: Question = {
  id: 'cookingEffort',
  title: 'How much work sounds\nokay today?',
  options: [
    { id: 'easy', label: 'Keep it easy', desc: '10\u201315 min' },
    { id: 'little', label: 'I can cook a little', desc: '20\u201330 min' },
    { id: 'enjoy', label: 'I enjoy cooking', desc: 'Take your time' },
  ],
};

const WHO_AT_TABLE_Q: Question = {
  id: 'whoAtTable',
  title: 'Who is usually at the table?',
  subtitle: 'You can change this anytime.',
  options: [
    { id: 'just_me', label: 'Just me' },
    { id: 'family', label: 'Me + family' },
    { id: 'few_people', label: 'A few people' },
  ],
};

const NEVER_SUGGEST_Q: Question = {
  id: 'neverSuggest',
  title: 'What should we\nnever suggest?',
  subtitle: 'Pick all that apply.',
  options: [
    { id: 'too_spicy', label: 'Too spicy' },
    { id: 'too_sweet', label: 'Too sweet' },
    { id: 'too_much_work', label: 'Too much work' },
    { id: 'too_different', label: 'Too different' },
  ],
};

// ---------------------------------------------------------------------------
// Dynamic question routing
// ---------------------------------------------------------------------------

function getNextQuestion(
  current: QuestionId,
  selections: Record<string, Set<string>>,
): StepId | null {
  switch (current) {
    case 'cuisine': {
      const cuisines = selections.cuisine ?? new Set();
      const hasIndian = cuisines.has('indian');
      return hasIndian ? 'rescueStyle' : 'mealFeel';
    }
    case 'rescueStyle':
      return 'mealFeel';
    case 'mealFeel':
      return 'changeAmount';
    case 'changeAmount':
      return 'familiarVsNew';
    case 'familiarVsNew':
      return 'cookingEffort';
    case 'cookingEffort':
      return 'whoAtTable';
    case 'whoAtTable':
      return 'neverSuggest';
    case 'neverSuggest':
      return 'done';
    default:
      return null;
  }
}

function getQuestionList(selections: Record<string, Set<string>>): StepId[] {
  const list: StepId[] = ['cuisine'];
  let current: QuestionId = 'cuisine';
  let next: StepId | null = 'cuisine';
  while (next && next !== 'done') {
    next = getNextQuestion(current, selections);
    if (next && next !== 'done') {
      list.push(next);
      current = next;
    }
  }
  list.push('done');
  return list;
}

function getQuestion(id: QuestionId): Question | null {
  const map: Record<string, Question> = {
    rescueStyle: RESCUE_STYLE_Q,
    mealFeel: MEAL_FEEL_Q,
    changeAmount: CHANGE_AMOUNT_Q,
    familiarVsNew: FAMILIAR_VS_NEW_Q,
    cookingEffort: COOKING_EFFORT_Q,
    whoAtTable: WHO_AT_TABLE_Q,
    neverSuggest: NEVER_SUGGEST_Q,
  };
  return map[id] ?? null;
}

// ---------------------------------------------------------------------------
// Progress indicator
// ---------------------------------------------------------------------------

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current ? styles.dotActive : null,
            i < current ? styles.dotDone : null,
          ]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Cuisine grid screen
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLUMNS = 2;
const GRID_GAP = 12;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - GRID_GAP) / GRID_COLUMNS;

function CuisineGridScreen({
  selected,
  onToggle,
  onContinue,
}: {
  selected: Set<CulinaryFamily>;
  onToggle: (id: CulinaryFamily) => void;
  onContinue: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.qContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.qTitle}>What food feels{'\n'}most like home?</Text>
      <Text style={styles.qSubtitle}>Pick the ones you naturally enjoy.</Text>

      <View style={styles.cuisineGrid}>
        {CUISINE_OPTIONS.map((cuisine) => {
          const isSelected = selected.has(cuisine.id);
          return (
            <Pressable
              key={cuisine.id}
              style={[styles.cuisineItem, isSelected && styles.cuisineItemSelected]}
              onPress={() => onToggle(cuisine.id)}
              scaleTo={1}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Image source={cuisine.image} style={styles.cuisineImage} resizeMode="cover" />
              <View style={[styles.cuisineLabelWrap, isSelected && styles.cuisineLabelWrapSelected]}>
                <Text style={[styles.cuisineLabel, isSelected && styles.cuisineLabelSelected]}>
                  {cuisine.label}
                </Text>
              </View>
              {isSelected && <View style={styles.cuisineCheck}><Text style={styles.checkmark}>?</Text></View>}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.continueBtn, selected.size === 0 && styles.continueBtnDisabled]}
        onPress={onContinue}
        scaleTo={1}
        disabled={selected.size === 0}
      >
        <Text style={[styles.continueBtnText, selected.size === 0 && styles.continueBtnTextDisabled]}>
          Continue
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Question screen
// ---------------------------------------------------------------------------

function QuestionScreen({
  question,
  selected,
  onToggle,
  onContinue,
  onBack,
  extraInput,
}: {
  question: Question;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
  extraInput?: { value: string; onChange: (t: string) => void };
}) {
  const canContinue = selected.size > 0;

  return (
    <ScrollView
      contentContainerStyle={styles.qContent}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={onBack} style={styles.backBtn} scaleTo={1}>
        <Text style={styles.backBtnText}>Back</Text>
      </Pressable>

      <Text style={styles.qTitle}>{question.title}</Text>
      {question.subtitle ? (
        <Text style={styles.qSubtitle}>{question.subtitle}</Text>
      ) : null}

      <View style={styles.chipsWrap}>
        {question.options.map((opt) => {
          const isSelected = selected.has(opt.id);
          return (
            <Pressable
              key={opt.id}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onToggle(opt.id)}
              scaleTo={1}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                {opt.label}
              </Text>
              {opt.desc ? (
                <Text style={[styles.chipDesc, isSelected && styles.chipDescSelected]}>
                  {opt.desc}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {extraInput ? (
        <View style={styles.extraInputWrap}>
          <TextInput
            style={styles.extraInput}
            placeholder="Anything else..."
            placeholderTextColor={colors.homeTextTertiary}
            value={extraInput.value}
            onChangeText={extraInput.onChange}
            multiline
          />
        </View>
      ) : null}

      <Pressable
        style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
        onPress={onContinue}
        scaleTo={1}
        disabled={!canContinue}
      >
        <Text style={[styles.continueBtnText, !canContinue && styles.continueBtnTextDisabled]}>
          Continue
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Onboarding'>>();
  const setOnboardingCompleted = useAuthStore((state) => state.setOnboardingCompleted);

  const [phase, setPhase] = useState<'cuisine' | 'questions' | 'done'>('cuisine');
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [cuisineSelections, setCuisineSelections] = useState<Set<CulinaryFamily>>(new Set());
  const [customNever, setCustomNever] = useState('');
  const [_submitting, setSubmitting] = useState(false);

  // Build question list dynamically based on current selections
  const questionList = getQuestionList(selections);
  const questionSteps = questionList.filter((q) => q !== 'cuisine' && q !== 'done');
  const [stepIndex, setStepIndex] = useState(0);

  const currentQuestionId = questionSteps[stepIndex] as QuestionId | undefined;
  const currentQuestion = currentQuestionId ? getQuestion(currentQuestionId) : null;

  function toggleCuisine(id: CulinaryFamily) {
    haptics.light();
    setCuisineSelections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleCuisineContinue() {
    haptics.medium();
    setSubmitting(true);
    try {
      // Submit cuisines to backend
      await submitCuisinePreferences(Array.from(cuisineSelections));
      // Also store locally for question routing
      setSelections({ cuisine: cuisineSelections });
      setPhase('questions');
    } catch {
      // If backend fails, still proceed with local state
      setSelections({ cuisine: cuisineSelections });
      setPhase('questions');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleOption(id: string) {
    haptics.light();
    if (!currentQuestionId) return;
    setSelections((prev) => {
      const current = new Set(prev[currentQuestionId] ?? []);
      if (current.has(id)) {
        current.delete(id);
      } else {
        if (currentQuestion?.maxSelect && current.size >= currentQuestion.maxSelect) {
          return prev;
        }
        current.add(id);
      }
      return { ...prev, [currentQuestionId]: current };
    });
  }

  function handleContinue() {
    haptics.medium();
    if (!currentQuestionId) return;

    // Save custom "never suggest" text
    if (currentQuestionId === 'neverSuggest' && customNever.trim()) {
      setSelections((prev) => {
        const never = new Set(prev.neverSuggest ?? []);
        never.add(`custom:${customNever.trim()}`);
        return { ...prev, neverSuggest: never };
      });
    }

    if (stepIndex < questionSteps.length - 1) {
      const newList = getQuestionList(selections);
      const newSteps = newList.filter((q) => q !== 'cuisine' && q !== 'done');
      if (stepIndex < newSteps.length - 1) {
        setStepIndex(stepIndex + 1);
      } else {
        setOnboardingCompleted(true);
        navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
      }
    } else {
      setOnboardingCompleted(true);
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    }
  }

  function handleBack() {
    haptics.light();
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    } else {
      setPhase('cuisine');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {phase === 'cuisine' && (
        <FadeInView style={styles.flex}>
          <CuisineGridScreen
            selected={cuisineSelections}
            onToggle={toggleCuisine}
            onContinue={() => void handleCuisineContinue()}
          />
        </FadeInView>
      )}

      {phase === 'questions' && currentQuestion && currentQuestionId && (
        <FadeInView key={currentQuestionId} style={styles.flex}>
          <ProgressDots total={questionSteps.length} current={stepIndex} />
          <QuestionScreen
            question={currentQuestion}
            selected={selections[currentQuestionId] ?? new Set()}
            onToggle={toggleOption}
            onContinue={handleContinue}
            onBack={handleBack}
            extraInput={
              currentQuestionId === 'neverSuggest'
                ? { value: customNever, onChange: setCustomNever }
                : undefined
            }
          />
        </FadeInView>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CHARCOAL = '#161616';
const SMOKE = '#D1D1D6';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  // Progress dots — full-width dashes
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  dot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: SMOKE,
  },
  dotActive: {
    backgroundColor: CHARCOAL,
    flex: 1.8,
  },
  dotDone: {
    backgroundColor: CHARCOAL,
  },

  // Intro
  introWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  introSpacer: { flex: 0.4 },
  introTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 30,
    lineHeight: 38,
    color: CHARCOAL,
    textAlign: 'center',
    marginBottom: 12,
  },
  introSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 17,
    lineHeight: 24,
    color: colors.homeTextSecondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  startButton: {
    width: 200,
    height: 54,
    borderRadius: 27,
    backgroundColor: CHARCOAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },

  // Question screen
  qContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  backBtn: {
    minHeight: 40,
    justifyContent: 'center',
    marginBottom: 8,
  },
  backBtnText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.homeTextSecondary,
  },
  qTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 26,
    lineHeight: 33,
    color: CHARCOAL,
    marginBottom: 8,
  },
  qSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.homeTextSecondary,
    marginBottom: 24,
  },

  // Cuisine grid
  cuisineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    marginBottom: 24,
  },
  cuisineItem: {
    width: GRID_ITEM_WIDTH,
    height: GRID_ITEM_WIDTH * 0.85,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: SMOKE,
  },
  cuisineItemSelected: {
    borderWidth: 2.5,
    borderColor: CHARCOAL,
  },
  cuisineImage: {
    width: '100%',
    height: '100%',
  },
  cuisineLabelWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  cuisineLabelWrapSelected: {
    backgroundColor: 'rgba(22, 22, 22, 0.7)',
  },
  cuisineLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cuisineLabelSelected: {
    color: '#FFFFFF',
  },
  cuisineCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CHARCOAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: fonts.bold,
  },

  // Chips
  chipsWrap: {
    gap: 10,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: SMOKE,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: CHARCOAL,
    backgroundColor: '#F0F0EC',
  },
  chipLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: CHARCOAL,
  },
  chipLabelSelected: {
    color: CHARCOAL,
  },
  chipDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.homeTextSecondary,
    marginTop: 2,
  },
  chipDescSelected: {
    color: colors.homeTextSecondary,
  },

  // Extra input
  extraInputWrap: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: SMOKE,
    borderRadius: 14,
    padding: 14,
  },
  extraInput: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: CHARCOAL,
    minHeight: 40,
    padding: 0,
  },

  // Continue button
  continueBtn: {
    marginTop: 24,
    height: 54,
    borderRadius: 27,
    backgroundColor: CHARCOAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: SMOKE,
  },
  continueBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  continueBtnTextDisabled: {
    color: '#8E8E93',
  },
});
