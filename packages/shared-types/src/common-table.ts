/**
 * Common Table — household meal convergence contracts.
 *
 * Common Table answers "how do I make ONE meal work for multiple people
 * without cooking separate meals?" It is architecturally separate from
 * Rescue: Rescue improves one plate, Common Table converges many preferences
 * onto one shared base + late branch finishes.
 */
import type { DietaryRestriction, EffortLevel, ISO8601, UUID } from './index';

// ---------------------------------------------------------------------------
// Households
// ---------------------------------------------------------------------------

export type HouseholdRelationship =
  'self' | 'partner' | 'child' | 'family' | 'roommate' | 'friend' | 'other';

/** HARD constraints — can never be violated, never relaxed by an LLM. */
export interface HouseholdMemberConstraints {
  allergies: string[];
  dietaryRestrictions: DietaryRestriction[];
  avoidIngredients: string[];
}

/** SOFT preferences — learned/declared, never treated as safety. */
export interface HouseholdMemberSoftPreferences {
  likes: string[];
  dislikes: string[];
  spiceLevel?: 'mild' | 'medium' | 'spicy';
  textures?: string[];
}

export interface HouseholdMemberProfile {
  id: UUID;
  householdId: UUID;
  displayName: string;
  initials: string;
  relationship: HouseholdRelationship;
  isOwner: boolean;
  active: boolean;
  constraints: HouseholdMemberConstraints;
  preferences: HouseholdMemberSoftPreferences;
  createdAt: ISO8601;
}

export interface Household {
  id: UUID;
  ownerId: UUID;
  name: string;
  members: HouseholdMemberProfile[];
  createdAt: ISO8601;
}

// ---------------------------------------------------------------------------
// Common Table convergence
// ---------------------------------------------------------------------------

export type CommonTableStatus =
  'planning' | 'converged' | 'cooking' | 'split' | 'completed' | 'failed';

export type IngredientSource = 'text' | 'image' | 'kitchen' | 'any';

export type CommonTableEffort = 'quick' | 'normal';

export interface CookingStep {
  title: string;
  detail?: string;
  minutes?: number;
}

export interface MealFinish {
  id: UUID;
  memberId: UUID;
  memberName: string;
  title: string;
  additions: string[];
  notes?: string;
}

export interface SharedMealPlan {
  baseName: string;
  baseDescription: string;
  estimatedMinutes: number;
  effort: EffortLevel;
  equipment: string[];
  sharedSteps: CookingStep[];
  /** Index into the full flow where branches begin (== sharedSteps.length). */
  splitPointIndex: number;
  branchSteps: CookingStep[];
  finishes: MealFinish[];
  ingredients: string[];
  /** Canonical ingredient names excluded globally for safety reasons. */
  excludedIngredients: string[];
}

export interface CommonTableFallback {
  message: string;
  suggestions: string[];
}

export type FinishResultStatus = 'pending' | 'applied' | 'skipped' | 'swapped';

export interface CommonTableResult {
  sharedMealId: UUID;
  status: CommonTableStatus;
  householdId: UUID;
  memberIds: UUID[];
  converged: boolean;
  plan: SharedMealPlan | null;
  fallback: CommonTableFallback | null;
  /** Ingredients that were blocked for safety, for transparency. */
  blockedIngredients: string[];
  /** Per-member finish state from the split moment (present once restored). */
  finishStatuses?: { memberId: UUID; status: FinishResultStatus }[];
}

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------

export interface CreateHouseholdRequest {
  name?: string;
}

export interface CreateHouseholdResponse {
  household: Household;
}

export interface GetHouseholdResponse {
  household: Household | null;
}

export interface CreateMemberRequest {
  displayName: string;
  relationship?: HouseholdRelationship;
  constraints?: Partial<HouseholdMemberConstraints>;
  preferences?: Partial<HouseholdMemberSoftPreferences>;
}

export interface CreateMemberResponse {
  member: HouseholdMemberProfile;
}

export type UpdateMemberRequest = Partial<CreateMemberRequest> & {
  active?: boolean;
};

export interface UpdateMemberResponse {
  member: HouseholdMemberProfile;
}

export interface DeleteMemberResponse {
  removed: boolean;
}

export interface CommonTableRequest {
  memberIds: UUID[];
  ingredients?: string[];
  ingredientSource?: IngredientSource;
  imageBase64?: string;
  mimeType?: string;
  effort?: CommonTableEffort;
  timeMinutes?: number;
  shoppingAllowed?: boolean;
}

export interface CommonTableFeedbackRequest {
  householdRating: 'loved' | 'worked' | 'not_really';
  remember?: string;
  memberOutcomes?: {
    memberId: UUID;
    rating: 'loved' | 'worked' | 'not_really';
    notes?: string;
  }[];
  finishResults?: {
    memberId: UUID;
    status: 'applied' | 'skipped' | 'swapped';
    swappedTo?: string;
  }[];
}

export interface CommonTableFeedbackResponse {
  recorded: boolean;
}

export interface CommonTableCompleteRequest {
  finishResults?: {
    memberId: UUID;
    status: 'applied' | 'skipped' | 'swapped';
  }[];
}

export interface CommonTableCompleteResponse {
  sharedMealId: UUID;
  status: CommonTableStatus;
}
