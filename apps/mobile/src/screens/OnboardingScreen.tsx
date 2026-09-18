import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
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
// Questions
// ---------------------------------------------------------------------------

type QuestionId =
  | 'cuisine'
  | 'hardNos'
  | 'flavorPersonality'
  | 'texturePairs'
  | 'adventurousness'
  | 'rescueNeed'
  | 'priorities';

type StepId = QuestionId | 'done';

interface Question {
  id: QuestionId;
  title: string;
  subtitle?: string;
  options: Array<{ id: string; label: string; desc?: string }>;
  maxSelect?: number;
}

const HARD_NOS_Q: Question = {
  id: 'hardNos',
  title: 'First, any hard no\'s?\nWhat should Meal Rescue never suggest?',
  subtitle: 'Select anything that applies.\nHard restrictions are treated as rules, not preferences.',
  options: [
    { id: 'allergies', label: 'Allergies' },
    { id: 'avoid_ingredients', label: 'Ingredients I avoid' },
    { id: 'dietary_restrictions', label: 'Dietary restrictions' },
    { id: 'religious_cultural', label: 'Religious/cultural restrictions' },
    { id: 'strong_dislikes', label: 'Foods I strongly dislike' },
    { id: 'nothing', label: 'Nothing \u2014 I\'m pretty open' },
  ],
};

const FLAVOR_PERSONALITY_Q: Question = {
  id: 'flavorPersonality',
  title: 'Let\'s find your flavor\npersonality.',
  subtitle: 'Which direction usually wins? Pick up to 3.',
  options: [
    { id: 'bright_tangy', label: 'Bright & Tangy', desc: 'lemon, pickles, chutneys, citrus' },
    { id: 'deep_savory', label: 'Deep & Savory', desc: 'umami, roasted, rich flavors' },
    { id: 'hot_spicy', label: 'Hot & Spicy', desc: 'chilli, pepper, heat' },
    { id: 'fresh_light', label: 'Fresh & Light', desc: 'herbs, vegetables, citrus' },
    { id: 'creamy_comforting', label: 'Creamy & Comforting', desc: 'yogurt, sauces, creamy textures' },
    { id: 'mild_familiar', label: 'Mild & Familiar', desc: 'simple, comforting flavors' },
  ],
  maxSelect: 3,
};

const TEXTURE_PAIRS_Q: Question = {
  id: 'texturePairs',
  title: 'Texture matters too.',
  subtitle: 'Pick one from each pair.',
  options: [
    { id: 'crunchy', label: 'Crunchy' },
    { id: 'soft', label: 'Soft' },
    { id: 'creamy', label: 'Creamy' },
    { id: 'crisp', label: 'Crisp' },
    { id: 'juicy', label: 'Juicy' },
    { id: 'dry', label: 'Dry' },
    { id: 'chewy', label: 'Chewy' },
    { id: 'tender', label: 'Tender' },
  ],
  maxSelect: 4,
};

const ADVENTUROUSNESS_Q: Question = {
  id: 'adventurousness',
  title: 'How adventurous\nshould I be?',
  subtitle: 'When I rescue your meal, I should usually...',
  options: [
    { id: 'stay_familiar', label: 'Stay familiar', desc: 'Give me something I already understand.' },
    { id: 'familiar_twist', label: 'Keep it familiar, add a twist', desc: 'Surprise me a little.' },
    { id: 'surprise_me', label: 'Surprise me', desc: 'I\'m happy to discover new combinations.' },
  ],
};

const RESCUE_NEED_Q: Question = {
  id: 'rescueNeed',
  title: 'What kind of "rescue"\nsounds most like you?',
  subtitle: 'My meal usually needs...',
  options: [
    { id: 'substance', label: 'More substance' },
    { id: 'freshness', label: 'More freshness' },
    { id: 'flavor', label: 'More flavor' },
    { id: 'texture', label: 'More texture' },
    { id: 'something_rich', label: 'Something rich' },
    { id: 'something_light', label: 'Something light' },
    { id: 'side', label: 'A side to round it out' },
    { id: 'figure_out', label: 'I don\'t know \u2014 figure it out for me' },
  ],
};

const PRIORITIES_Q: Question = {
  id: 'priorities',
  title: 'What should I prioritize\nwhen I suggest something?',
  subtitle: 'Pick up to 3.',
  options: [
    { id: 'enjoy', label: 'Something I\'ll genuinely enjoy' },
    { id: 'filling', label: 'Something that makes the meal more filling' },
    { id: 'freshness', label: 'Something that adds freshness' },
    { id: 'balance', label: 'Something that balances the meal' },
    { id: 'have_at_home', label: 'Something I already have in my kitchen' },
    { id: 'quick', label: 'Something quick' },
    { id: 'new_to_try', label: 'Something new to try' },
  ],
  maxSelect: 3,
};

// ---------------------------------------------------------------------------
// Dynamic question routing
// ---------------------------------------------------------------------------

function getNextQuestion(
  current: QuestionId,
  _selections: Record<string, Set<string>>,
): StepId | null {
  switch (current) {
    case 'cuisine':
      return 'hardNos';
    case 'hardNos':
      return 'flavorPersonality';
    case 'flavorPersonality':
      return 'texturePairs';
    case 'texturePairs':
      return 'adventurousness';
    case 'adventurousness':
      return 'rescueNeed';
    case 'rescueNeed':
      return 'priorities';
    case 'priorities':
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
    hardNos: HARD_NOS_Q,
    flavorPersonality: FLAVOR_PERSONALITY_Q,
    texturePairs: TEXTURE_PAIRS_Q,
    adventurousness: ADVENTUROUSNESS_Q,
    rescueNeed: RESCUE_NEED_Q,
    priorities: PRIORITIES_Q,
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
// Texture pair divider (visual separator between pairs)
// ---------------------------------------------------------------------------

function TexturePairDivider() {
  return (
    <View style={styles.textureDivider}>
      <View style={styles.textureDividerLine} />
      <Text style={styles.textureDividerText}>or</Text>
      <View style={styles.textureDividerLine} />
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
              {isSelected && <View style={styles.cuisineCheck}><Text style={styles.checkmark}>✓</Text></View>}
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
}: {
  question: Question;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const canContinue = selected.size > 0;

  // For texture pairs, render with dividers between pairs
  const isTexturePairs = question.id === 'texturePairs';

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

      {isTexturePairs ? (
        <View style={styles.chipsWrap}>
          {question.options.map((opt, index) => {
            const isSelected = selected.has(opt.id);
            const isEvenPair = index % 2 === 0;
            return (
              <React.Fragment key={opt.id}>
                <Pressable
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => onToggle(opt.id)}
                  scaleTo={1}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
                {!isEvenPair && index < question.options.length - 1 && <TexturePairDivider />}
              </React.Fragment>
            );
          })}
        </View>
      ) : (
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
      )}

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
      await submitCuisinePreferences(Array.from(cuisineSelections));
      setSelections({ cuisine: cuisineSelections });
      setPhase('questions');
    } catch {
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

  // Texture pair divider
  textureDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  textureDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: SMOKE,
  },
  textureDividerText: {
    fontFamily: fonts.regular,
    fontSize: 13,
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
