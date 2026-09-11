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
  /**
   * V2 decision metadata (plan §10). Filled by the v2/backend agent; mobile
   * renders defensively if absent (pre-integration). Never exposes scores.
   */
  actionType?: DecisionAction;
  estimatedMinutes?: number;
  estimatedCostLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  cookingRequired?: boolean;
  satisfiesIntent?: boolean;
  satisfiesReality?: boolean;
  nutritionRationale?: {
    protein?: boolean;
    fibre?: boolean;
    healthyFat?: boolean;
  };
}

export interface RankedRecommendation {
  candidate: RescueCandidate;
  rankScore: number;
  reasoning: string;
  naturalLanguageExplanation: string;
  /** Memory the ranker surfaced; rendered by the "why this?" deep-dive. */
  resonanceMemory?: MemoryReason;
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
  /** V2 decision-layer input (intent / reality / craving lock). */
  v2?: RescueGenerateV2ContextInput;
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
  /** V2: the decision action class the pipeline chose for the best move. */
  decision?: DecisionAction;
  /** V2: audit trail for the best move (frozen shape; backend fills it). */
  provenance?: AIProvenance;
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
// Taste Memory Bank (personalization) - per-context learned taste
// ---------------------------------------------------------------------------

export type TasteContextType =
  | 'cuisine'
  | 'meal_time'
  | 'meal_pattern'
  | 'cuisine_family'
  | 'tradition_vs_modern'
  | 'global'
  | 'addition_nutritional'
  | 'addition_sensory'
  | 'addition_satisfaction'
  | 'addition_modification'
  | 'addition_exploration'
  | 'addition_x_meal_group'
  | 'sensory_flavor'
  | 'sensory_texture'
  | 'sensory_temperature'
  | 'sensory_intensity'
  | 'treatment'
  | 'role'
  | 'modification_magnitude'
  | 'preservation_preference'
  | 'novelty_tolerance';

export type MemorySource = 'feedback' | 'accept' | 'swap' | 'reject' | 'profile' | 'cold_start';

export interface TasteMemoryEntry {
  ingredient: string;
  contextType: TasteContextType;
  contextValue: string;
  /** -1.0 avoid .. +1.0 love. Context-scoped, never a blanket per-ingredient score. */
  affinity: Confidence;
  confidence: Confidence;
  observationCount: number;
  source: MemorySource;
  lastUpdated: ISO8601;
}

export const CULINARY_FAMILY_OPTIONS = [
  'italian',
  'indian',
  'mexican',
  'east_asian',
  'mediterranean',
  'american',
  'middle_eastern',
  'african',
  'caribbean',
  'thai',
] as const;

export const CULINARY_FAMILIES = [...CULINARY_FAMILY_OPTIONS, 'none'] as const;

export type CulinaryFamily = (typeof CULINARY_FAMILIES)[number];

export interface CulinaryCompassSeed {
  family: CulinaryFamily;
  /** -1.0 pure & traditional .. +1.0 loves modern fusion twists. */
  traditionVsModern: Confidence;
}

export interface FoodPersonalityTrait {
  id: string;
  label: string;
  description: string;
  /** 0.0 .. 1.0 - how strongly this trait defines the user. */
  strength: Confidence;
}

export interface FoodPersonality {
  traits: FoodPersonalityTrait[];
  bio: string;
}

export type TasteJournalKind =
  'learned' | 'personality_shift' | 'milestone' | 'corrected' | 'culture' | 'preference';

export interface TasteJournalEntry {
  id: UUID;
  createdAt: ISO8601;
  text: string;
  kind: TasteJournalKind;
}

export interface TasteJournalResponse {
  entries: TasteJournalEntry[];
  personality: FoodPersonality | null;
}

/** One memory behind a "why this?" deep-dive on a recommendation. */
export interface MemoryReason {
  ingredient: string;
  contextValue: string;
  affinity: Confidence;
  confidence: Confidence;
  /** When present, explains a cultural/context reason rather than a single ingredient. */
  kind?: 'ingredient' | 'cuisine_family' | 'tradition';
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
// Phase 4b: Meal-Completion Preference Learning (replaces Culinary Compass)
// ---------------------------------------------------------------------------

export type AdditionFactorKey =
  'nutritional' | 'sensory' | 'satisfaction' | 'modification' | 'exploration';

export type OnboardingRejectionReason =
  | 'taste'
  | 'too_expensive'
  | 'too_much_effort'
  | 'don_t_have'
  | 'don_t_like_ingredient'
  | 'not_appropriate_for_meal'
  | 'not_hungry_enough';

export type ConfidenceState = 'unknown' | 'inferred' | 'confirmed';

export interface OnboardingAdditionOption {
  name: string;
  emoji: string;
  /** e.g. 'protein', 'crunch', 'cream' - a plain role label, never a health claim. */
  role: string;
  blurb: string;
}

export interface OnboardingPair {
  id: string;
  baseMeal: {
    name: string;
    emoji: string;
    /** e.g. 'rice_based' | 'noodle' | 'breakfast_bowl' | 'soup' | 'yogurt_bowl' | 'potato'. */
    mealGroup: string;
    /** Display-only context hint. Cold-start MUST NOT update cuisine preference from this. */
    cuisineLabel: string;
  };
  optionA: OnboardingAdditionOption;
  optionB: OnboardingAdditionOption;
  /** Which latent factors this pair diagnoses and how strongly. Weights sum to 1. */
  tests: Array<{ factor: AdditionFactorKey; weight: number }>;
  question: string;
}

export interface OnboardingAnswer {
  pairId: string;
  /** 'A' | 'B' == which addition the user believes completes the base meal better. */
  selected: 'A' | 'B' | null;
  /** Set when the user doesn't have/accept ONE option; it is NOT a negative preference. */
  unavailableOption: 'A' | 'B' | null;
  rejectionReason?: OnboardingRejectionReason;
}

export interface OnboardingFactorSummary {
  factor: AdditionFactorKey;
  /** Friendly short label, e.g. 'Balance'. */
  label: string;
  /** -1..1 latent score. */
  score: number;
  confidence: ConfidenceState;
  evidenceCount: number;
}

export interface OnboardingSummaryResponse {
  factors: OnboardingFactorSummary[];
  mealGroupAffinities: Record<string, number>;
  seeded: boolean;
}

export type OnboardingStepKind = 'cuisine' | 'pair';

export interface OnboardingStartResponse {
  completed: boolean;
  kind: OnboardingStepKind | null;
  pair: OnboardingPair | null;
  totalSteps: number;
  currentStep: number;
}

export interface CuisinePreferences {
  cuisines: CulinaryFamily[];
}

export interface OnboardingAnswerResponse {
  next: OnboardingPair | null;
  summary: OnboardingSummaryResponse | null;
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
  FORBIDDEN = 'FORBIDDEN',
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
  onboardingCompleted: boolean;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
  user: AuthUser;
}

// ---------------------------------------------------------------------------
// Ads & monetization
// ---------------------------------------------------------------------------

/** GET /api/v1/ads/eligibility - ad surfaces are never offered to Pro users. */
export interface AdEligibilityResponse {
  tier: SubscriptionTier;
  rescuesToday: number | null;
  dailyLimit: number | null;
  rescueCredits: number;
  canWatchRescueFuel: boolean;
  canWatchProPass: boolean;
}

/** POST /api/v1/ads/rewards/rescue-fuel */
export interface RescueFuelClaimResponse {
  granted: boolean;
  rescueCredits: number;
}

/** POST /api/v1/ads/rewards/pro-pass */
export interface ProPassClaimResponse {
  granted: boolean;
  proPassUntil: ISO8601 | null;
}

// ---------------------------------------------------------------------------
// V2 (Shipaton 2026) - Decision Layer contract freeze. DO NOT rename/remove
// fields; additive changes only, coordinated through the v2 branch owner.
// ---------------------------------------------------------------------------

/** Normalized internal intent. Display text is a mobile concern. */
export type MealIntent = 'SATISFY' | 'PRESERVE' | 'LIGHTEN' | 'DECIDE' | 'NO_COOK';

/** V2 decision layer frozen shapes. */
export type RealityTimeBudget = 5 | 15 | 30;

export type RealityBudgetLevel = 'LOW' | 'MEDIUM' | 'OPEN';

export type CleanupTolerance = 'LOW' | 'MEDIUM' | 'HIGH';

/** Hard constraints, modeled as reality (not preference). Optional = unknown. */
export interface RealityContext {
  timeAvailable?: RealityTimeBudget;
  cookingAllowed: boolean;
  budgetLevel?: RealityBudgetLevel;
  useAvailableIngredients: boolean;
  cleanupTolerance?: CleanupTolerance;
}

/** What the user wants preserved. Primary = locked craving; the engine must
 *  modify around it supportively, never replace it. */
export interface CravingProfile {
  primary: string;
  preservedElements: string[];
  flexibleElements: string[];
}

export type DecisionAction =
  'RESCUE' | 'ADD' | 'COMBINE' | 'USE_LEFTOVER' | 'USE_EXPIRING' | 'KEEP_AS_IS';

/** Captured after the user completes the meal. Explicit evidence only. */
export interface SatisfactionRecord {
  rescueId: UUID;
  result: 'EXACTLY' | 'ALMOST' | 'NOT_REALLY';
  reason?: string[];
  timestamp: ISO8601;
}

export type MealRescueEventType =
  | 'MEAL_CAPTURED'
  | 'INTENT_SELECTED'
  | 'REALITY_SELECTED'
  | 'CRAVING_LOCKED'
  | 'RESCUE_STARTED'
  | 'RECOMMENDATION_PRESENTED'
  | 'RECOMMENDATION_SELECTED'
  | 'MEAL_COMPLETED'
  | 'SATISFACTION_RECORDED'
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_OPENED';

export interface DecisionEvent {
  eventType: MealRescueEventType;
  userId?: UUID;
  mealId?: UUID;
  rescueId?: UUID;
  timestamp: ISO8601;
  /** Free-form product payload; keep it small and non-sensitive. */
  payload?: Record<string, unknown>;
}

/** Enough provenance to reproduce or audit any AI recommendation. */
export interface AIProvenance {
  provider: string;
  model: string;
  promptVersion: string;
  pipelineVersion: string;
  rankingVersion: string;
  fallbackUsed: boolean;
  processingTimeMs: number;
  validationOutcome: string;
}

// --- API payload extensions (additive) ---

export interface RescueGenerateV2ContextInput {
  /** Normalized intent from the mobile intent selector. Omit = DECIDE fallback. */
  intent?: MealIntent;
  /** Reality context from the mobile reality selector; optional = permissive. */
  reality?: RealityContext;
  /** Craving lock from the mobile craving UX; engine must respect preserved
   *  elements and never replace the primary craving. */
  craving?: CravingProfile;
}

export interface SatisfactionRecordRequest {
  result: 'EXACTLY' | 'ALMOST' | 'NOT_REALLY';
  reason?: string[];
}

export interface SatisfactionRecordResponse {
  success: true;
  recorded: SatisfactionRecord;
  /** Plain-language, user-visible: how this feedback will influence the next rescue. */
  personalizationImpact: string[];
}

/**
 * Commit the user's actual action for a rescue (plan §9 / §27).
 *
 * `userDecision` starts as 'pending' on the rescue row; the decide endpoint
 * is what flips it to a real UserDecision so satisfaction feedback and the
 * meal_completed aftercare gate become reachable. Last write wins.
 */
export interface DecideRequest {
  action: UserDecision;
}

export interface DecideResponse {
  success: true;
  rescueId: UUID;
  userDecision: UserDecision;
  decisionTimestamp: ISO8601;
}

/** OneSignal aftercare eligibility for the meal_completed check-in. */
export interface AftercareEligibility {
  eligible: boolean;
  reason?: 'COOLDOWN' | 'NO_RESCUE' | 'ALREADY_SENT' | 'FEEDBACK_DISABLED' | 'OK';
}

// Taste Memory V2 — event-sourced taste system
export * from './taste-v2';
