/**
 * Meal Memory — intent-aware household food agent contracts.
 *
 * Meal Memory answers "what is happening with my food life across time,
 * and what should happen next?" It is architecturally separate from
 * Rescue (which improves one plate right now). Every natural-language
 * request is classified into a structured intent, validated server-side,
 * and only HIGH-confident, low-risk mutations act without confirmation.
 */
import type { DietaryRestriction, EffortLevel, ISO8601, UUID } from './index';

// ---------------------------------------------------------------------------
// Calendar primitives
// ---------------------------------------------------------------------------

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface SlotKey {
  dateKey: string; // YYYY-MM-DD
  mealSlot: MealSlot;
}

/** Internal "what kind of placeholder is this slot" concept. */
export type MealEventConceptType =
  'recipe' | 'leftover' | 'eat_out' | 'open' | 'blocked' | 'flexible' | 'custom';

/** Lifecycle of a single meal event (plan vs reality are separate rows). */
export type MealEventLifecycleState =
  | 'PLANNED'
  | 'CONFIRMED'
  | 'EATEN'
  | 'SKIPPED'
  | 'REPLACED'
  | 'CANCELLED'
  | 'MOVED'
  | 'OPEN'
  | 'BLOCKED'
  | 'OUT';

/** Slot flexibility — how committed the calendar is at this position. */
export type MealSlotStatus =
  'LOCKED' | 'PREFERRED' | 'OPEN' | 'FLEXIBLE' | 'BLOCKED' | 'OUT' | 'UNKNOWN';

/** Internal role a planned meal plays in the week (never shown raw to users). */
export type MealRole =
  | 'USE_SOON'
  | 'LEFTOVER'
  | 'LOW_EFFORT'
  | 'FAMILY_FAVORITE'
  | 'VARIETY'
  | 'COMFORT'
  | 'EXPLORE'
  | 'BALANCE'
  | 'INVENTORY_UTILIZATION';

export type MealEventKind = 'plan' | 'actual';

export interface MealEvent {
  id: UUID;
  householdId: UUID;
  planId: UUID | null;
  userId: UUID;
  /** YYYY-MM-DD. Null for flexible "floating" slots that are not pinned to a day yet. */
  dateKey: string | null;
  mealSlot: MealSlot;
  kind: MealEventKind;
  concept: string | null;
  conceptType: MealEventConceptType | null;
  state: MealEventLifecycleState;
  slotStatus: MealSlotStatus;
  flexible: boolean;
  horizon: string | null;
  excludedDays: string[] | null;
  preferredDays: string[] | null;
  mealRole: MealRole | null;
  ingredients: string[] | null;
  memberIds: UUID[] | null;
  reasons: string[] | null;
  effort: EffortLevel | null;
  rawText: string | null;
  movedFrom: SlotKey | null;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

// ---------------------------------------------------------------------------
// Meal plans (coherent weekly groups)
// ---------------------------------------------------------------------------

export type MealPlanStatus = 'proposed' | 'confirmed' | 'declined' | 'superseded';

export type MealPlanSource = 'plan_week' | 'schedule' | 'replan' | 'intent' | 'manual';

export interface MealPlan {
  id: UUID;
  householdId: UUID;
  status: MealPlanStatus;
  weekStart: string; // YYYY-MM-DD (Monday)
  source: MealPlanSource;
  meals: MealEvent[];
  openSlots: SlotKey[];
  createdAt: ISO8601;
}

// ---------------------------------------------------------------------------
// Explicit rules / reservations
// ---------------------------------------------------------------------------

export type MealRuleScope = 'household' | 'member' | 'user';

export type MealRulePriorityGroup =
  | 2 // explicit current user instruction
  | 3 // explicit household rule
  | 4 // explicit member rule
  | 5 // availability
  | 7; // hard scheduling

export type MealRuleInstructionType =
  | 'EXCLUDE_INGREDIENT'
  | 'HOLD_INGREDIENT'
  | 'RESERVE_INGREDIENT'
  | 'BLOCK_SLOT'
  | 'KEEP_OPEN'
  | 'KEEP_OUT'
  | 'AVAILABILITY'
  | 'EFFORT'
  | 'PREFERENCE'
  | 'RECURRENCE'
  | 'GENERAL';

export interface MealRule {
  id: UUID;
  householdId: UUID;
  memberId: UUID | null;
  userId: UUID;
  scope: MealRuleScope;
  instructionType: MealRuleInstructionType;
  ingredient: string | null;
  mealSlot: MealSlot | null;
  detail: Record<string, unknown> | null;
  priorityGroup: MealRulePriorityGroup;
  active: boolean;
  appliesFrom: string | null;
  expiresAt: string | null;
  note: string | null;
  createdAt: ISO8601;
}

export interface InventoryReservation {
  id: UUID;
  householdId: UUID;
  userId: UUID;
  ingredient: string;
  reservedQuantity: number | null;
  unit: string | null;
  purpose: 'HOLD' | 'RESERVE_MEAL' | 'ALLOCATION';
  mealEventId: UUID | null;
  active: boolean;
  expiresAt: string | null;
  createdAt: ISO8601;
}

export interface InventoryAllocation {
  mealEventId: UUID;
  ingredient: string;
  quantity: number | null;
  unit: string | null;
}

// ---------------------------------------------------------------------------
// Intent layer
// ---------------------------------------------------------------------------

export type MealMemoryIntent =
  | 'REMEMBER'
  | 'RECORD_ACTUAL_MEAL'
  | 'SCHEDULE'
  | 'MODIFY_SCHEDULE'
  | 'MOVE_MEAL'
  | 'REMOVE_MEAL'
  | 'BLOCK_TIME'
  | 'SET_PREFERENCE'
  | 'SET_RULE'
  | 'MODIFY_INVENTORY_INTENT'
  | 'PLAN_WEEK'
  | 'REPLAN'
  | 'ASK_QUESTION'
  | 'PURCHASE_SUGGESTION'
  | 'QUERY_REASONING'
  | 'GENERAL_INFORMATION';

export const MEAL_MEMORY_INTENTS: MealMemoryIntent[] = [
  'REMEMBER',
  'RECORD_ACTUAL_MEAL',
  'SCHEDULE',
  'MODIFY_SCHEDULE',
  'MOVE_MEAL',
  'REMOVE_MEAL',
  'BLOCK_TIME',
  'SET_PREFERENCE',
  'SET_RULE',
  'MODIFY_INVENTORY_INTENT',
  'PLAN_WEEK',
  'REPLAN',
  'ASK_QUESTION',
  'PURCHASE_SUGGESTION',
  'QUERY_REASONING',
  'GENERAL_INFORMATION',
];

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export type BlockType = 'out' | 'blocked' | 'keep_open';

export interface IntentEntities {
  mealConcept: string | null;
  targetDate: string | null; // YYYY-MM-DD when fully resolved
  targetHorizon: string | null; // 'this_week' | 'next_week' | etc when soft
  mealSlot: MealSlot | null;
  excludedDay: string | null; // day-of-week name the request excludes
  ingredient: string | null;
  memberId: UUID | null;
  blockType: BlockType | null;
  effort: EffortLevel | null;
  constraint: {
    kind: string;
    value: string | null;
    mealSlot: MealSlot | null;
  } | null;
  moveTarget: { dateKey: string; mealSlot: MealSlot } | null;
}

export interface IntentResolution {
  intent: MealMemoryIntent;
  confidence: number; // 0..1
  confidenceBand: ConfidenceBand;
  entities: IntentEntities;
  rawText: string;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
}

export interface ClarificationPrompt {
  question: string;
  neededEntities: string[];
  options?: string[];
}

// ---------------------------------------------------------------------------
// World state (Situation Model — internal, read-only view)
// ---------------------------------------------------------------------------

export interface MemberMemoryContext {
  id: UUID;
  displayName: string;
  initials: string;
  relationship: string;
  allergies: string[];
  dietaryRestrictions: DietaryRestriction[];
  avoidIngredients: string[];
  likes: string[];
  dislikes: string[];
  spiceLevel: 'mild' | 'medium' | 'spicy' | null;
  textures: string[] | null;
  learnedIngredientAffinities: Record<string, number>;
}

export interface InventoryItemState {
  id: UUID;
  name: string;
  quantity: number | null;
  unit: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  isExpiringSoon: boolean;
  kind: 'pantry' | 'leftover';
  dishName: string | null;
  servings: number | null;
  madeAt: string | null;
  /** Quantity removed from use by active reservations/holds. */
  reservedQuantity: number;
  /** quantity - reservedQuantity when both are numeric. */
  availableQuantity: number | null;
}

export interface LeftoverState {
  name: string;
  dishName: string | null;
  servings: number | null;
  madeAt: string | null;
  expiresAt: string | null;
  notes: string | null;
}

export interface ActiveConstraint {
  source: 'member' | 'rule' | 'reservation';
  memberId: UUID | null;
  ingredient: string | null;
  mealSlot: MealSlot | null;
  kind: string;
  description: string;
  priorityGroup: number;
}

export interface LearnedPreference {
  memberId: UUID | null;
  ingredient: string;
  affinity: number;
  confidence: number;
  source: 'declared' | 'learned';
}

export interface PurchaseSuggestion {
  id: UUID;
  ingredient: string;
  shortfall: number;
  unit: string | null;
  suggestedQuantity: number;
  suggestedUnit: string | null;
  reason: string;
}

export interface FoodWorldState {
  household: { id: UUID; name: string; ownerId: UUID } | null;
  householdMembers: MemberMemoryContext[];
  inventory: InventoryItemState[];
  expiringItems: InventoryItemState[];
  leftovers: LeftoverState[];
  plannedMeals: MealEvent[];
  actualMeals: MealEvent[];
  openSlots: SlotKey[];
  blockedSlots: SlotKey[];
  availability: { memberId: UUID; dateKey: string; present: boolean }[];
  activeConstraints: ActiveConstraint[];
  recentMeals: MealEvent[];
  mealExposure: string[];
  explicitRules: MealRule[];
  learnedPreferences: LearnedPreference[];
  purchaseNeeds: PurchaseSuggestion[];
}

// ---------------------------------------------------------------------------
// Planning output
// ---------------------------------------------------------------------------

export type PlanningReasonKind =
  | 'expiry'
  | 'preference'
  | 'exposure'
  | 'effort'
  | 'availability'
  | 'leftover'
  | 'inventory'
  | 'rule'
  | 'safety'
  | 'variety'
  | 'shortage'
  | 'open_slot';

export interface PlanningReason {
  kind: PlanningReasonKind;
  message: string;
}

export interface PlanningResult {
  plan: MealPlan | null;
  purchaseSuggestions: PurchaseSuggestion[];
  allocations: InventoryAllocation[];
  reasons: PlanningReason[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------

export interface MealMemoryIntentRequest {
  text: string;
  /** When supplied, re-resolves within an existing intent flow. */
  intentId?: UUID;
  answer?: string;
}

export type MealMemoryIntentStatus =
  'actioned' | 'clarification' | 'awaiting_confirmation' | 'question';

export interface MemoryActionResult {
  message: string;
  mealEvents: MealEvent[];
  plan: MealPlan | null;
  rule: MealRule | null;
  reservation: InventoryReservation | null;
  purchaseSuggestions: PurchaseSuggestion[];
}

export interface MealMemoryIntentResponse {
  intentId: UUID;
  status: MealMemoryIntentStatus;
  resolution: IntentResolution;
  clarification: ClarificationPrompt | null;
  result: MemoryActionResult | null;
}

export interface MealMemoryConfirmRequest {
  intentId: UUID;
  answer: string;
}

export interface MealMemoryConfirmResponse {
  intentId: UUID;
  status: MealMemoryIntentStatus;
  resolution: IntentResolution;
  clarification: ClarificationPrompt | null;
  result: MemoryActionResult | null;
}

export interface PlanWeekRequest {
  weekStart?: string; // YYYY-MM-DD (defaults to the week containing today)
  mealSlots?: MealSlot[];
  strategy?: 'balance' | 'easy' | 'use_expiring' | 'family_favorites';
  confirm?: boolean;
}

export interface PlanWeekResponse {
  result: PlanningResult;
}

export interface MealMemoryWeekResponse {
  weekStart: string;
  days: MealMemoryDay[];
}

export interface MealMemoryDay {
  dateKey: string;
  slots: MealMemorySlotView[];
}

export interface MealMemorySlotView {
  dateKey: string;
  mealSlot: MealSlot;
  slotStatus: MealSlotStatus;
  planned: MealEvent | null;
  actual: MealEvent | null;
}

export interface MealMemoryMealDetailResponse {
  event: MealEvent;
  kitchenItems: InventoryItemState[];
  substitutions: string[];
}

export interface MealMemoryUpdateMealRequest {
  concept?: string;
  mealSlot?: MealSlot;
  dateKey?: string;
  state?: MealEventLifecycleState;
  slotStatus?: MealSlotStatus;
  memberIds?: UUID[];
  effort?: EffortLevel;
}

export interface MealMemoryMoveMealRequest {
  dateKey: string;
  mealSlot?: MealSlot;
}

export interface MealMemoryRecordActualRequest {
  dateKey?: string;
  mealSlot?: MealSlot;
  concept?: string;
  skipped?: boolean;
  cancelled?: boolean;
  ate?: boolean;
}

export interface MealMemoryRecordActualResponse {
  event: MealEvent;
}

export interface MealMemoryReplanRequest {
  reason?: string;
  scope?: 'local' | 'week';
  anchor?: SlotKey;
}

export interface MealMemoryReplanResponse {
  result: PlanningResult;
  changed: ChangeNotice[];
}

export interface ChangeNotice {
  eventId: UUID;
  dateKey: string;
  mealSlot: MealSlot;
  before: string | null;
  after: string | null;
  message: string;
}

export interface MealMemoryRememberRequest {
  mealEventId?: UUID;
  sentiment: 'loved' | 'liked' | 'not_for_us';
  note?: string;
  memberIds?: UUID[];
}

export interface MealMemoryRememberResponse {
  remembered: boolean;
  eventId: UUID;
  messages: string[];
}

export interface MealMemoryCreateRuleRequest {
  instructionType: MealRuleInstructionType;
  ingredient?: string;
  mealSlot?: MealSlot;
  scope?: MealRuleScope;
  memberId?: UUID;
  detail?: Record<string, unknown>;
  appliesFrom?: string;
  expiresAt?: string;
  note?: string;
  priorityGroup?: MealRulePriorityGroup;
}

export interface MealMemoryFeedbackRequest {
  mealEventId: UUID;
  rating: 'loved' | 'worked' | 'not_really';
  notes?: string;
  memberIds?: UUID[];
}

export interface MealMemoryFeedbackResponse {
  recorded: boolean;
}

export interface MealMemoryRulesResponse {
  rules: MealRule[];
}
