import type { Confidence, ISO8601, UUID } from './index';

// --- Target Types ---
export type TasteTargetType =
  | 'ingredient'
  | 'sensory'
  | 'treatment'
  | 'role'
  | 'combination'
  | 'modification'
  | 'cuisine'
  | 'cuisine_style';

// --- Event Types ---
export type TasteEventType =
  | 'EXPLICIT_LIKE'
  | 'EXPLICIT_DISLIKE'
  | 'CURRENT_WANT'
  | 'RESCUE_ACCEPTED'
  | 'RESCUE_REJECTED'
  | 'RESCUE_SWAPPED'
  | 'MEAL_COMPLETED'
  | 'SATISFACTION_NAILED'
  | 'SATISFACTION_ALMOST'
  | 'SATISFACTION_NOT_FOR_ME'
  | 'ONBOARDING_COMPLETED'
  | 'EXPOSURE_RECOMMENDED'
  | 'EXPOSURE_COMPLETED';

// --- Sensory Dimensions ---
export type FlavorDimension =
  | 'savory' | 'sweet' | 'sour' | 'spicy' | 'umami'
  | 'bitter' | 'rich' | 'smoky' | 'fresh' | 'tangy';

export type TextureDimension =
  | 'crispy' | 'crunchy' | 'creamy' | 'soft' | 'chewy'
  | 'juicy' | 'silky' | 'chunky';

export type TemperatureDimension = 'hot' | 'warm' | 'cold' | 'cool';
export type IntensityDimension = 'mild' | 'moderate' | 'bold' | 'very_intense';

// --- Food Roles ---
export type FoodRole =
  | 'protein' | 'fibre' | 'creaminess' | 'crunch' | 'acidity'
  | 'heat' | 'freshness' | 'richness' | 'sweetness' | 'saltiness'
  | 'sauce' | 'moisture' | 'bulk' | 'contrast' | 'aroma';

// --- Treatment Types ---
export type TreatmentType =
  | 'add_fresh' | 'roast' | 'fry' | 'grill' | 'toast'
  | 'crisp' | 'blend' | 'mash' | 'chop' | 'pickle'
  | 'season' | 'sauce' | 'garnish' | 'mix_in' | 'serve_alongside'
  | 'use_as_topping' | 'use_as_filling';

// --- Modification Magnitude ---
export type ModificationMagnitude =
  | 'tiny' | 'small' | 'moderate' | 'large' | 'transformative';

// --- Rescue Mode ---
export type RescueMode = 'REINFORCE' | 'VARY' | 'EXPLORE';

// --- Taste Event (immutable) ---
export interface TasteEvent {
  id: UUID;
  userId: UUID;
  eventType: TasteEventType;
  targetType: TasteTargetType;
  targetId: string;
  contextKey: string;
  contextType?: string | null;
  contextValue?: string | null;
  treatment?: TreatmentType | null;
  role?: FoodRole | null;
  magnitude?: ModificationMagnitude | null;
  sourceStrength: Confidence;
  attributionConfidence: Confidence;
  rescueId?: UUID | null;
  mealId?: UUID | null;
  metadata?: Record<string, unknown> | null;
  createdAt: ISO8601;
}

// --- Taste Belief (derived, mutable) ---
export interface TasteBelief {
  id: UUID;
  userId: UUID;
  targetType: TasteTargetType;
  targetId: string;
  contextKey: string;
  affinity: Confidence;
  confidence: Confidence;
  positiveEvidence: number;
  negativeEvidence: number;
  observationCount: number;
  stability: Confidence;
  lastObservedAt: ISO8601;
}

// --- Combination Belief ---
export interface CombinationBelief {
  id: UUID;
  userId: UUID;
  members: string[];
  cuisineContext?: string | null;
  mealContext?: string | null;
  treatment?: TreatmentType | null;
  affinity: Confidence;
  confidence: Confidence;
  observationCount: number;
  lastObservedAt: ISO8601;
}

// --- Exposure State ---
export interface ExposureState {
  targetType: TasteTargetType;
  targetId: string;
  recentRecommendations: number;
  recentCompletions: number;
  lastRecommendedAt?: ISO8601;
  lastCompletedAt?: ISO8601;
  consecutiveExposure: number;
}

// --- Rescue Taste Context (compact LLM input) ---
export interface RescueTasteContext {
  currentMeal: {
    foods: string[];
    cuisine?: string;
    cuisineConfidence?: Confidence;
  };
  currentNeed: string[];
  strongPreferences: string[];
  preferredTreatments: TreatmentType[];
  preferredModificationMagnitude: ModificationMagnitude;
  successfulCombinations: string[];
  decisionPreferences: string[];
  recentExposure: string[];
  noveltyTolerance: Confidence;
  cuisineStyle: {
    traditional: Confidence;
    fusion: Confidence;
  };
  preservationPreference: Confidence;
}

// --- Expanded Taste Context Types ---
export type ExpandedTasteContextType =
  | 'cuisine' | 'meal_time' | 'meal_pattern'
  | 'cuisine_family' | 'tradition_vs_modern' | 'global'
  | 'addition_nutritional' | 'addition_sensory' | 'addition_satisfaction'
  | 'addition_modification' | 'addition_exploration' | 'addition_x_meal_group'
  | 'sensory_flavor' | 'sensory_texture' | 'sensory_temperature' | 'sensory_intensity'
  | 'treatment' | 'role' | 'modification_magnitude'
  | 'preservation_preference' | 'novelty_tolerance';

// --- V2 Response (aggregated for TasteJournal) ---
export interface TasteV2SensoryBelief {
  dimension: string;
  preference: string;
  strength: number;
  sampleCount: number;
}

export interface TasteV2TreatmentBelief {
  treatment: string;
  preference: string;
  strength: number;
  sampleCount: number;
}

export interface TasteV2CombinationSummary {
  members: string[];
  affinity: Confidence;
  confidence: Confidence;
  observationCount: number;
  cuisineContext?: string | null;
}

export interface TasteV2Response {
  sensory: Record<string, TasteV2SensoryBelief[]>;
  treatment: Record<string, TasteV2TreatmentBelief[]>;
  overexposed: string[];
  recentEvents: TasteEvent[];
  combinations: TasteV2CombinationSummary[];
  journal: unknown[];
}
