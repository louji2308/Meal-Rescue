import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import {
  Dimensions,
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
import {
  submitCuisinePreferences,
  submitOnboardingPreferences,
  type OnboardingPreferences,
} from '../services/taste.api';
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
// Texture pair definitions
// ---------------------------------------------------------------------------

const TEXTURE_PAIRS = [
  { a: 'crunchy', b: 'soft', labelA: 'Crunchy', labelB: 'Soft' },
  { a: 'creamy', b: 'crisp', labelA: 'Creamy', labelB: 'Crisp' },
  { a: 'juicy', b: 'dry', labelA: 'Juicy', labelB: 'Dry' },
  { a: 'chewy', b: 'tender', labelA: 'Chewy', labelB: 'Tender' },
] as const;

// ---------------------------------------------------------------------------
// Hard Nos text input placeholders
// ---------------------------------------------------------------------------

const HARD_NO_PLACEHOLDERS: Record<string, string> = {
  allergies: 'e.g. peanuts, shellfish, gluten...',
  avoid_ingredients: 'e.g. cilantro, olives, mushrooms...',
  dietary_restrictions: 'e.g. vegetarian, vegan, keto...',
  religious_cultural: 'e.g. halal, kosher, no beef...',
  strong_dislikes: 'e.g. liver, anchovies, blue cheese...',
};

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

type StepId =
  | 'welcome'
  | 'cuisine'
  | 'hardNos'
  | 'flavorPersonality'
  | 'texturePairs'
  | 'adventurousness'
  | 'rescueNeed'
  | 'priorities'
  | 'done';

const ALL_STEPS: StepId[] = [
  'welcome',
  'cuisine',
  'hardNos',
  'flavorPersonality',
  'texturePairs',
  'adventurousness',
  'rescueNeed',
  'priorities',
];

// ---------------------------------------------------------------------------
// Step progress with question labels + answers
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<string, string> = {
  cuisine: 'Cuisine',
  hardNos: 'Hard no\'s',
  flavorPersonality: 'Flavor',
  texturePairs: 'Texture',
  adventurousness: 'Adventure',
  rescueNeed: 'Rescue',
  priorities: 'Priorities',
};

function getStepAnswer(step: string, state: {
  cuisineSelections: Set<CulinaryFamily>;
  hardNoSelections: Set<string>;
  flavorSelection: Set<string>;
  textureSelections: Record<string, string>;
  adventurousness: string | null;
  rescueNeed: Set<string>;
  priorities: Set<string>;
}): string | null {
  switch (step) {
    case 'cuisine':
      return state.cuisineSelections.size > 0 ? `${state.cuisineSelections.size} selected` : null;
    case 'hardNos':
      return state.hardNoSelections.size > 0 ? `${state.hardNoSelections.size} rules` : null;
    case 'flavorPersonality':
      return state.flavorSelection.size > 0 ? `${state.flavorSelection.size} picked` : null;
    case 'texturePairs': {
      const count = Object.keys(state.textureSelections).length;
      return count > 0 ? `${count}/4` : null;
    }
    case 'adventurousness':
      return state.adventurousness ? state.adventurousness.replace(/_/g, ' ') : null;
    case 'rescueNeed':
      return state.rescueNeed.size > 0 ? `${state.rescueNeed.size} picked` : null;
    case 'priorities':
      return state.priorities.size > 0 ? `${state.priorities.size} picked` : null;
    default:
      return null;
  }
}

function StepProgress({
  steps,
  currentIndex,
  answerState,
}: {
  steps: string[];
  currentIndex: number;
  answerState: {
    cuisineSelections: Set<CulinaryFamily>;
    hardNoSelections: Set<string>;
    flavorSelection: Set<string>;
    textureSelections: Record<string, string>;
    adventurousness: string | null;
    rescueNeed: Set<string>;
    priorities: Set<string>;
  };
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.stepProgressRow}
    >
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isDone = i < currentIndex;
        const label = STEP_LABELS[step] ?? step;
        const answer = isDone ? getStepAnswer(step, answerState) : null;
        return (
          <View key={step} style={styles.stepBadgeWrap}>
            <View style={[
              styles.stepBadge,
              isCurrent && styles.stepBadgeCurrent,
              isDone && styles.stepBadgeDone,
            ]}>
              <Text style={[
                styles.stepBadgeLabel,
                isCurrent && styles.stepBadgeLabelCurrent,
                isDone && styles.stepBadgeLabelDone,
              ]}>
                {isDone ? '✓ ' : ''}{label}
              </Text>
            </View>
            {answer && (
              <Text style={styles.stepAnswer}>{answer}</Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Welcome intro screen (Q0)
// ---------------------------------------------------------------------------

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.welcomeWrap}>
      <View style={styles.welcomeSpacer} />
      <Text style={styles.welcomeTitle}>
        We're going to learn{'\n'}what you love.
      </Text>
      <Text style={styles.welcomeSubtitle}>
        Not a diet plan. Not calorie counting.{'\n\n'}
        Just the flavors, textures, and moods that{'\n'}
        make a meal feel right to you — so we can{'\n'}
        rescue your food exactly the way you want it.
      </Text>
      <Pressable style={styles.continueBtn} onPress={onContinue} scaleTo={0.97}>
        <Text style={styles.continueBtnText}>Let's go</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Cuisine grid screen (Q1)
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLUMNS = 2;
const GRID_GAP = 12;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - GRID_GAP) / GRID_COLUMNS;

function CuisineGridScreen({
  selected,
  onToggle,
  onContinue,
  onBack,
}: {
  selected: Set<CulinaryFamily>;
  onToggle: (id: CulinaryFamily) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
      <Pressable onPress={onBack} style={styles.backBtn} scaleTo={1}>
        <Text style={styles.backBtnText}>Back</Text>
      </Pressable>
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
              <Image source={cuisine.image} style={styles.cuisineImage} contentFit="cover" />
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
// Hard Nos screen (Q2) — with text inputs
// ---------------------------------------------------------------------------

function HardNosScreen({
  selected,
  textInputs,
  onToggle,
  onTextInput,
  onContinue,
  onBack,
}: {
  selected: Set<string>;
  textInputs: Record<string, string>;
  onToggle: (id: string) => void;
  onTextInput: (id: string, text: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const options = [
    { id: 'allergies', label: 'Allergies' },
    { id: 'avoid_ingredients', label: 'Ingredients I avoid' },
    { id: 'dietary_restrictions', label: 'Dietary restrictions' },
    { id: 'religious_cultural', label: 'Religious/cultural restrictions' },
    { id: 'strong_dislikes', label: 'Foods I strongly dislike' },
    { id: 'nothing', label: 'Nothing \u2014 I\'m pretty open' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
      <Pressable onPress={onBack} style={styles.backBtn} scaleTo={1}>
        <Text style={styles.backBtnText}>Back</Text>
      </Pressable>
      <Text style={styles.qTitle}>What should Meal Rescue{'\n'}never suggest?</Text>
      <Text style={styles.qSubtitle}>
        Select anything that applies.{'\n'}
        Hard restrictions are treated as rules, not preferences.
      </Text>

      <View style={styles.chipsWrap}>
        {options.map((opt) => {
          const isSelected = selected.has(opt.id);
          const showInput = isSelected && opt.id !== 'nothing';
          return (
            <View key={opt.id}>
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
              {showInput && (
                <View style={styles.hardNoInputWrap}>
                  <TextInput
                    style={styles.hardNoInput}
                    placeholder={HARD_NO_PLACEHOLDERS[opt.id] ?? 'Enter details...'}
                    placeholderTextColor={colors.homeTextTertiary}
                    value={textInputs[opt.id] ?? ''}
                    onChangeText={(t) => onTextInput(opt.id, t)}
                  />
                </View>
              )}
            </View>
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
// Generic single-select question screen
// ---------------------------------------------------------------------------

function SingleSelectScreen({
  title,
  subtitle,
  options,
  selected,
  onSelect,
  onContinue,
  onBack,
}: {
  title: string;
  subtitle?: string;
  options: Array<{ id: string; label: string; desc?: string }>;
  selected: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
      <Pressable onPress={onBack} style={styles.backBtn} scaleTo={1}>
        <Text style={styles.backBtnText}>Back</Text>
      </Pressable>
      <Text style={styles.qTitle}>{title}</Text>
      {subtitle ? <Text style={styles.qSubtitle}>{subtitle}</Text> : null}

      <View style={styles.chipsWrap}>
        {options.map((opt) => {
          const isSelected = selected === opt.id;
          return (
            <Pressable
              key={opt.id}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelect(opt.id)}
              scaleTo={1}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
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

      <Pressable
        style={[styles.continueBtn, !selected && styles.continueBtnDisabled]}
        onPress={onContinue}
        scaleTo={1}
        disabled={!selected}
      >
        <Text style={[styles.continueBtnText, !selected && styles.continueBtnTextDisabled]}>
          Continue
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Multi-select question screen (max N)
// ---------------------------------------------------------------------------

function MultiSelectScreen({
  title,
  subtitle,
  options,
  selected,
  maxSelect: _maxSelect,
  onToggle,
  onContinue,
  onBack,
}: {
  title: string;
  subtitle?: string;
  options: Array<{ id: string; label: string; desc?: string }>;
  selected: Set<string>;
  maxSelect?: number;
  onToggle: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
      <Pressable onPress={onBack} style={styles.backBtn} scaleTo={1}>
        <Text style={styles.backBtnText}>Back</Text>
      </Pressable>
      <Text style={styles.qTitle}>{title}</Text>
      {subtitle ? <Text style={styles.qSubtitle}>{subtitle}</Text> : null}

      <View style={styles.chipsWrap}>
        {options.map((opt) => {
          const isSelected = selected.has(opt.id);
          return (
            <Pressable
              key={opt.id}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onToggle(opt.id)}
              scaleTo={1}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
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
// Texture Pairs screen (Q4) — strict one per pair
// ---------------------------------------------------------------------------

function TexturePairsScreen({
  selections,
  onSelect,
  onContinue,
  onBack,
}: {
  selections: Record<string, string>;
  onSelect: (pairKey: string, value: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const allSelected = Object.keys(selections).length === TEXTURE_PAIRS.length;

  return (
    <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
      <Pressable onPress={onBack} style={styles.backBtn} scaleTo={1}>
        <Text style={styles.backBtnText}>Back</Text>
      </Pressable>
      <Text style={styles.qTitle}>Texture matters too.</Text>
      <Text style={styles.qSubtitle}>Pick one from each pair.</Text>

      <View style={styles.chipsWrap}>
        {TEXTURE_PAIRS.map((pair, index) => (
          <React.Fragment key={pair.a}>
            <View style={styles.pairRow}>
              <Pressable
                style={[styles.chip, styles.pairChip, selections[pair.a] === pair.a && styles.chipSelected]}
                onPress={() => onSelect(pair.a, pair.a)}
                scaleTo={1}
                accessibilityRole="radio"
                accessibilityState={{ checked: selections[pair.a] === pair.a }}
              >
                <Text style={[styles.chipLabel, selections[pair.a] === pair.a && styles.chipLabelSelected]}>
                  {pair.labelA}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chip, styles.pairChip, selections[pair.a] === pair.b && styles.chipSelected]}
                onPress={() => onSelect(pair.a, pair.b)}
                scaleTo={1}
                accessibilityRole="radio"
                accessibilityState={{ checked: selections[pair.a] === pair.b }}
              >
                <Text style={[styles.chipLabel, selections[pair.a] === pair.b && styles.chipLabelSelected]}>
                  {pair.labelB}
                </Text>
              </Pressable>
            </View>
            {index < TEXTURE_PAIRS.length - 1 && <View style={styles.pairDivider} />}
          </React.Fragment>
        ))}
      </View>

      <Pressable
        style={[styles.continueBtn, !allSelected && styles.continueBtnDisabled]}
        onPress={onContinue}
        scaleTo={1}
        disabled={!allSelected}
      >
        <Text style={[styles.continueBtnText, !allSelected && styles.continueBtnTextDisabled]}>
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

  const [stepIndex, setStepIndex] = useState(0);
  const [cuisineSelections, setCuisineSelections] = useState<Set<CulinaryFamily>>(new Set());
  const [hardNoSelections, setHardNoSelections] = useState<Set<string>>(new Set());
  const [hardNoTextInputs, setHardNoTextInputs] = useState<Record<string, string>>({});
  const [flavorSelection, setFlavorSelection] = useState<Set<string>>(new Set());
  const [textureSelections, setTextureSelections] = useState<Record<string, string>>({});
  const [adventurousness, setAdventurousness] = useState<string | null>(null);
  const [rescueNeed, setRescueNeed] = useState<Set<string>>(new Set());
  const [priorities, setPriorities] = useState<Set<string>>(new Set());
  const [_submitting, setSubmitting] = useState(false);

  const currentStep = ALL_STEPS[stepIndex];

  function goNext() {
    haptics.medium();
    if (stepIndex < ALL_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      void handleSubmit();
    }
  }

  function goBack() {
    haptics.light();
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  }

  function toggleCuisine(id: CulinaryFamily) {
    haptics.light();
    setCuisineSelections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleHardNo(id: string) {
    haptics.light();
    setHardNoSelections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // If "nothing" is selected, clear everything else
        if (id === 'nothing') return new Set(['nothing']);
        next.delete('nothing');
        next.add(id);
      }
      return next;
    });
  }

  function toggleFlavor(id: string) {
    haptics.light();
    setFlavorSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) return prev;
        next.add(id);
      }
      return next;
    });
  }

  function selectTexture(pairKey: string, value: string) {
    haptics.light();
    setTextureSelections((prev) => ({ ...prev, [pairKey]: value }));
  }

  function toggleRescueNeed(id: string) {
    haptics.light();
    setRescueNeed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) return prev;
        next.add(id);
      }
      return next;
    });
  }

  function togglePriority(id: string) {
    haptics.light();
    setPriorities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) return prev;
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const hardNos: OnboardingPreferences['hardNos'] = {};
      if (hardNoSelections.has('allergies') && hardNoTextInputs.allergies) {
        hardNos.allergies = hardNoTextInputs.allergies.split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (hardNoSelections.has('avoid_ingredients') && hardNoTextInputs.avoid_ingredients) {
        hardNos.avoidIngredients = hardNoTextInputs.avoid_ingredients.split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (hardNoSelections.has('dietary_restrictions') && hardNoTextInputs.dietary_restrictions) {
        hardNos.dietaryRestrictions = hardNoTextInputs.dietary_restrictions.split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (hardNoSelections.has('religious_cultural') && hardNoTextInputs.religious_cultural) {
        hardNos.religiousCultural = hardNoTextInputs.religious_cultural.split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (hardNoSelections.has('strong_dislikes') && hardNoTextInputs.strong_dislikes) {
        hardNos.strongDislikes = hardNoTextInputs.strong_dislikes.split(',').map((s) => s.trim()).filter(Boolean);
      }

      // Build texture preferences
      const texturePrefs: OnboardingPreferences['texturePreferences'] = {};
      for (const pair of TEXTURE_PAIRS) {
        const val = textureSelections[pair.a];
        if (val === pair.a) {
          if (pair.a === 'crunchy') texturePrefs.crunchiness = 'crunchy';
          else if (pair.a === 'creamy') texturePrefs.creaminess = 'creamy';
          else if (pair.a === 'juicy') texturePrefs.moistness = 'juicy';
          else if (pair.a === 'chewy') texturePrefs.chewiness = 'chewy';
        } else if (val === pair.b) {
          if (pair.b === 'soft') texturePrefs.crunchiness = 'soft';
          else if (pair.b === 'crisp') texturePrefs.creaminess = 'crisp';
          else if (pair.b === 'dry') texturePrefs.moistness = 'dry';
          else if (pair.b === 'tender') texturePrefs.chewiness = 'tender';
        }
      }

      await submitCuisinePreferences(Array.from(cuisineSelections));
      await submitOnboardingPreferences({
        hardNos: Object.keys(hardNos).length > 0 ? hardNos : undefined,
        flavorPersonality: flavorSelection.size > 0 ? Array.from(flavorSelection) : undefined,
        texturePreferences: Object.keys(texturePrefs).length > 0 ? texturePrefs : undefined,
        adventurousness: adventurousness ?? undefined,
        rescueNeed: rescueNeed.size > 0 ? Array.from(rescueNeed) : undefined,
        priorities: priorities.size > 0 ? Array.from(priorities) : undefined,
      });
    } catch {
      // Proceed even if backend fails
    } finally {
      setSubmitting(false);
      setOnboardingCompleted(true);
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    }
  }

  // ------- Flavor personality options -------
  const flavorOptions = [
    { id: 'bright_tangy', label: 'Bright & Tangy', desc: 'lemon, pickles, chutneys, citrus' },
    { id: 'deep_savory', label: 'Deep & Savory', desc: 'umami, roasted, rich flavors' },
    { id: 'hot_spicy', label: 'Hot & Spicy', desc: 'chilli, pepper, heat' },
    { id: 'fresh_light', label: 'Fresh & Light', desc: 'herbs, vegetables, citrus' },
    { id: 'creamy_comforting', label: 'Creamy & Comforting', desc: 'yogurt, sauces, creamy textures' },
    { id: 'mild_familiar', label: 'Mild & Familiar', desc: 'simple, comforting flavors' },
  ];

  const adventurousOptions = [
    { id: 'stay_familiar', label: 'Stay familiar', desc: 'Give me something I already understand.' },
    { id: 'familiar_twist', label: 'Keep it familiar, add a twist', desc: 'Surprise me a little.' },
    { id: 'surprise_me', label: 'Surprise me', desc: 'I\'m happy to discover new combinations.' },
  ];

  const rescueNeedOptions = [
    { id: 'substance', label: 'More substance' },
    { id: 'freshness', label: 'More freshness' },
    { id: 'flavor', label: 'More flavor' },
    { id: 'texture', label: 'More texture' },
    { id: 'something_rich', label: 'Something rich' },
    { id: 'something_light', label: 'Something light' },
    { id: 'side', label: 'A side to round it out' },
    { id: 'figure_out', label: 'I don\'t know \u2014 figure it out for me' },
  ];

  const priorityOptions = [
    { id: 'enjoy', label: 'Something I\'ll genuinely enjoy' },
    { id: 'filling', label: 'Something that makes the meal more filling' },
    { id: 'freshness_priority', label: 'Something that adds freshness' },
    { id: 'balance', label: 'Something that balances the meal' },
    { id: 'have_at_home', label: 'Something I already have in my kitchen' },
    { id: 'quick', label: 'Something quick' },
    { id: 'new_to_try', label: 'Something new to try' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <FadeInView key={currentStep} style={styles.flex}>
        {currentStep !== 'welcome' && currentStep !== 'cuisine' && currentStep !== 'done' && (
          <StepProgress
            steps={ALL_STEPS.filter((s) => s !== 'welcome' && s !== 'done')}
            currentIndex={stepIndex - 1}
            answerState={{
              cuisineSelections,
              hardNoSelections,
              flavorSelection,
              textureSelections,
              adventurousness,
              rescueNeed,
              priorities,
            }}
          />
        )}

        {currentStep === 'welcome' && (
          <WelcomeScreen onContinue={goNext} />
        )}

        {currentStep === 'cuisine' && (
          <CuisineGridScreen
            selected={cuisineSelections}
            onToggle={toggleCuisine}
            onContinue={goNext}
            onBack={goBack}
          />
        )}

        {currentStep === 'hardNos' && (
          <HardNosScreen
            selected={hardNoSelections}
            textInputs={hardNoTextInputs}
            onToggle={toggleHardNo}
            onTextInput={(id, text) => setHardNoTextInputs((prev) => ({ ...prev, [id]: text }))}
            onContinue={goNext}
            onBack={goBack}
          />
        )}

        {currentStep === 'flavorPersonality' && (
          <MultiSelectScreen
            title="Let's find your flavor personality."
            subtitle="Which direction usually wins? Pick up to 3."
            options={flavorOptions}
            selected={flavorSelection}
            maxSelect={3}
            onToggle={toggleFlavor}
            onContinue={goNext}
            onBack={goBack}
          />
        )}

        {currentStep === 'texturePairs' && (
          <TexturePairsScreen
            selections={textureSelections}
            onSelect={selectTexture}
            onContinue={goNext}
            onBack={goBack}
          />
        )}

        {currentStep === 'adventurousness' && (
          <SingleSelectScreen
            title="How adventurous should I be?"
            subtitle="When I rescue your meal, I should usually..."
            options={adventurousOptions}
            selected={adventurousness}
            onSelect={(id) => { haptics.light(); setAdventurousness(id); }}
            onContinue={goNext}
            onBack={goBack}
          />
        )}

        {currentStep === 'rescueNeed' && (
          <MultiSelectScreen
            title='What kind of "rescue" sounds most like you?'
            subtitle="My meal usually needs... Pick up to 3."
            options={rescueNeedOptions}
            selected={rescueNeed}
            maxSelect={3}
            onToggle={toggleRescueNeed}
            onContinue={goNext}
            onBack={goBack}
          />
        )}

        {currentStep === 'priorities' && (
          <MultiSelectScreen
            title="What should I prioritize when I suggest something?"
            subtitle="Pick up to 3."
            options={priorityOptions}
            selected={priorities}
            maxSelect={3}
            onToggle={togglePriority}
            onContinue={goNext}
            onBack={goBack}
          />
        )}
      </FadeInView>
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

  // Step progress badges
  stepProgressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  stepBadgeWrap: {
    alignItems: 'center',
    gap: 3,
  },
  stepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: SMOKE,
  },
  stepBadgeCurrent: {
    backgroundColor: CHARCOAL,
  },
  stepBadgeDone: {
    backgroundColor: '#E8E8E4',
  },
  stepBadgeLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: '#8E8E93',
  },
  stepBadgeLabelCurrent: {
    color: '#FFFFFF',
  },
  stepBadgeLabelDone: {
    color: CHARCOAL,
  },
  stepAnswer: {
    fontFamily: fonts.regular,
    fontSize: 9,
    color: colors.homeTextSecondary,
    maxWidth: 70,
    textAlign: 'center',
  },

  // Welcome screen
  welcomeWrap: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  welcomeSpacer: { flex: 0.2 },
  welcomeTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 30,
    lineHeight: 38,
    color: CHARCOAL,
    textAlign: 'center',
    marginBottom: 20,
  },
  welcomeSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.homeTextSecondary,
    textAlign: 'center',
    marginBottom: 48,
  },

  // Question content
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
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  cuisineItemSelected: {
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

  // Hard no text inputs
  hardNoInputWrap: {
    marginTop: 8,
    marginBottom: 2,
    borderWidth: 1.5,
    borderColor: SMOKE,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FAFAF8',
  },
  hardNoInput: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: CHARCOAL,
    padding: 0,
  },

  // Texture pair row
  pairRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pairChip: {
    flex: 1,
    alignItems: 'center',
  },
  pairDivider: {
    height: 1,
    backgroundColor: SMOKE,
    marginVertical: 2,
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
