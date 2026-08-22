/**
 * Meal Rescue - Shared domain types.
 *
 * These types are the single source of truth for data crossing the
 * backend <-> mobile boundary. The architecture doc requires strict
 * structured output everywhere: every AI-derived payload must validate
 * against these shapes before it leaves the server.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type UUID = string;

export type ISO8601 = string;

export type Confidence = number; // 0.0 - 1.0

// ---------------------------------------------------------------------------
// Meal analysis
// ---------------------------------------------------------------------------

export type InputType = 'image' | 'text' | 'voice';

export type IngredientState = 'raw' | 'cooked' | 'processed' | 'mixed';

export interface DetectedFood {
  name: string;
  confidence: Confidence;
}

export interface DetectedIngredient {
  name: string;
  confidence: Confidence;
  state: IngredientState;
  estimatedQuantity?: string;
}

export interface ComponentAnalysis {
  protein: boolean;
  fiber_sources: boolean;
  healthy_fat_sources: boolean;
  carbohydrates: boolean;
  sodium_likely_high?: boolean;
}

export interface UncertaintyFlag {
  field: string;
  reason: string;
  confidence: Confidence;
}

export type ComponentKey = keyof Omit<ComponentAnalysis, 'sodium_likely_high'>;

export interface NutritionalImpact {
  /** component -> how the rescue changes it */
  [component: string]: 'added' | 'increased' | 'reduced';
}

// ---------------------------------------------------------------------------
// Constraints (deterministic engine input)
// ---------------------------------------------------------------------------

export type BudgetLevel = 'low' | 'medium' | 'high';

export interface Constraints {
  timeMinutes?: number;
  budget?: BudgetLevel;
  cookingRequired?: boolean;
  equipmentAvailable?: string[];
  avoidIngredients?: string[];
  allergies?: string[];
  keepOriginal?: boolean;
  dietaryRestrictions?: DietaryRestriction[];
}

export type DietaryRestriction = 'vegetarian' | 'vegan' | 'keto' | 'paleo' | 'halal' | 'kosher';

// ---------------------------------------------------------------------------
// Rescue candidates & recommendations
// ---------------------------------------------------------------------------

export type CandidateType = 'addition' | 'substitution' | 'modification';

export type EffortLevel = 'low' | 'medium' | 'high';

export interface Substitution {
  original: { name: string };
  replacement: {
    name: string;
    prepTime?: number;
    costLevel?: BudgetLevel;
  };
}

export interface RescueCandidate {
  id: UUID;
  type: CandidateType;
  additions: Array<{
    name: string;
    state?: IngredientState;
    prepTime?: number;
    costLevel?: BudgetLevel;
    requiredEquipment?: string[];
    cookingSteps?: number;
  }>;
  substitutions: Substitution[];
  estimatedTime: number;
  estimatedCost: BudgetLevel;
  requiredEquipment: string[];
  cookingSteps: number;
  nutritionalImprovement: NutritionalImpact;
  preferenceAlignment: number;
}

export interface RankedRecommendation {
  candidate: RescueCandidate;
  rankScore: number;
  reasoning: string;
  naturalLanguageExplanation: string;
}

export type UserDecision = 'accepted' | 'swapped' | 'rejected' | 'kept_as_is';

export type Satisfaction = 'better' | 'same' | 'not_for_me';

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

export interface MealAnalysisResponse {
  mealId: UUID;
  detectedFoods: DetectedFood[];
  detectedIngredients: DetectedIngredient[];
  detectedComponents: ComponentAnalysis;
  confidenceScores: Record<string, Confidence>;
  uncertaintyFlags: UncertaintyFlag[];
  requiresConfirmation: boolean;
}

export interface RescueGenerateRequest {
  mealId: UUID;
  constraints: Constraints;
}

export interface RescueGenerateResponse {
  rescueId: UUID;
  originalMeal: {
    mealId: UUID;
    foods: string[];
  };
  recommendation: RankedRecommendation;
  alternatives: RankedRecommendation[];
  actions: Array<'rescue' | 'swap' | 'dont_have' | 'keep_as_is'>;
}

export interface FeedbackRequest {
  satisfaction: Satisfaction;
  feedbackText?: string;
  outcome?: {
    completed: boolean;
    modifications?: string[];
    actualTime?: number;
  };
}

// ---------------------------------------------------------------------------
// Phase 4: Personalization & Pantry
// ---------------------------------------------------------------------------

export interface PantryItem {
  id: UUID;
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  addedAt: ISO8601;
  expiresAt: ISO8601 | null;
  lastUsedAt: ISO8601 | null;
  usePriority: number;
  daysUntilExpiry: number | null;
  isExpiringSoon: boolean;
  isLowStock: boolean;
}

export interface SuggestedUse {
  ingredientName: string;
  reason: string;
  rescueId?: UUID;
  rescuePreview?: string;
}

export interface PersonalizationInsight {
  type:
    | 'favorite_ingredient'
    | 'avoided_ingredient'
    | 'prep_tolerance'
    | 'time_pattern'
    | 'rescue_pattern';
  description: string;
  confidence: Confidence;
}

export interface FeedbackResponse {
  success: true;
  personalizationUpdated: boolean;
  insights: PersonalizationInsight[];
}

export interface PreferenceLearned {
  preferenceType: string;
  preferenceKey: string;
  preferenceValue: object;
  confidenceScore: Confidence;
  observationCount: number;
  lastUpdated: ISO8601;
}

export interface PantryGetResponse {
  ingredients: PantryItem[];
  expiringSoon: PantryItem[];
  lowStock: PantryItem[];
  suggestedUses: SuggestedUse[];
}

export interface PantryUpsertRequest {
  ingredientName: string;
  quantity?: number | null;
  unit?: string | null;
  expiresAt?: ISO8601 | null;
  usePriority?: number;
}

export interface PantryDeleteResponse {
  success: true;
  deletedId: UUID;
}

// ---------------------------------------------------------------------------
// Phase 5: Advanced Features (Fridge Negotiator, Leftover Alchemist)
// ---------------------------------------------------------------------------

export type HungerLevel = 'snack' | 'meal';

export interface FoodComponent {
  name: string;
  quantity?: string;
  state?: 'raw' | 'cooked' | 'prepped';
}

export interface MealRecommendation {
  name: string;
  ingredients: string[];
  instructions: string[];
  estimatedTimeMinutes: number;
  effort: EffortLevel;
  missingIngredients: string[];
  usesPantryItems: string[];
  nutritionNote?: string;
}

export interface Transformation {
  name: string;
  format: 'bowl' | 'wrap' | 'skillet' | 'salad' | 'soup' | 'bake';
  ingredients: string[];
  instructions: string[];
  estimatedTimeMinutes: number;
  effort: EffortLevel;
  description: string;
}

export interface FridgeNegotiateRequest {
  availableIngredients: string[];
  timeMinutes: number;
  hungerLevel?: HungerLevel;
  userId: UUID;
}

export interface FridgeNegotiateResponse {
  recommendations: MealRecommendation[];
  reasoning: string;
  missingIngredients: string[];
}

export interface LeftoverAlchemistRequest {
  image?: PickedImage; // multipart image
  description?: string;
  userId: UUID;
}

export interface PickedImage {
  uri: string;
  name: string;
  mimeType: string;
}

export interface LeftoverAlchemistResponse {
  identifiedComponents: FoodComponent[];
  transformations: Transformation[];
  effortRanking: EffortLevel[];
}

// ---------------------------------------------------------------------------
// Errors - structured error contract from the architecture doc
// ---------------------------------------------------------------------------

export enum ErrorCategory {
  INPUT_VALIDATION = 'INPUT_VALIDATION',
  AI_MODEL_FAILURE = 'AI_MODEL_FAILURE',
  CONSTRAINT_CONFLICT = 'CONSTRAINT_CONFLICT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_FAILURE = 'EXTERNAL_SERVICE_FAILURE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL = 'INTERNAL',
}

export interface ErrorBody {
  category: ErrorCategory;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface ErrorResponse {
  success: false;
  error: ErrorBody;
  requestId: string;
  timestamp: ISO8601;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'free' | 'pro';

export interface AuthUser {
  id: UUID;
  email: string;
  subscriptionTier: SubscriptionTier;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
  user: AuthUser;
}
