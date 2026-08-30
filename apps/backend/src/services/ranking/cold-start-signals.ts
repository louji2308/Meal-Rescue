/**
 * Meal-completion cold-start ranking signals (Plan 3).
 *
 * Pure, DB-free math implementing spec §6 generic meal-context prior, §7
 * weighted-additive ranking + recommendation-safety gate, and §8
 * anti-fatigue + role-family diversity layer. The LLM ranking prompt and
 * the deterministic fallback both consume these values; the signals
 * themselves never write anything.
 */
import type { AdditionFactorKey, ConfidenceState } from '@meal-rescue/shared-types';

import { INGREDIENTS } from '../ai/ingredient-db';
import type { OnboardingMealGroup } from '../onboarding/pair-catalog';

export type ColdStartFactorKey = AdditionFactorKey;

export interface ColdStartFactorSignal {
  factor: ColdStartFactorKey;
  /** Learned affinity in [-1, 1]; 0 = no evidence yet. */
  affinity: number;
  confidence: ConfidenceState;
}

export interface ColdStartProfileInput {
  coldStartFactors: ColdStartFactorSignal[];
  mealGroupAffinities: Record<string, number>;
  /** 0..1 average confidence across diagnosed factors. */
  profileConfidence: number;
  mealGroup: OnboardingMealGroup | 'other';
}

export interface SignalCandidate {
  id: string;
  type?: string | null;
  additions?: Array<{ name: string }>;
  estimatedTime?: number;
}

// Weighted additive tuning targets (spec §7). Sum = 1.
export const COLD_START_WEIGHTS = { w1: 0.3, w2: 0.2, w3: 0.25, w4: 0.15, w5: 0.1 } as const;

// Recommendation-safety gate (spec §7): below this confidence, lean safe.
export const SAFETY_GATE_THRESHOLD = 0.4;
export const SAFETY_PICK_MAX_MINUTES = 15;
export const SAFETY_PICK_BOOST = 0.08;
// Diversity/freshness guardrail (spec §8): strong candidates win regardless.
export const STRONG_AFFINITY = 0.7;
export const STRONG_MEAL_CONTEXT = 0.6;
export const STRONG_PRACTICALITY = 0.6;
export const STRONG_PREFERENCE_FLOOR = 0.85;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Map a learned affinity [-1,1] onto the [0,1] score space. */
export function normalize(value: number): number {
  return clamp01((value + 1) / 2);
}

const MEAL_GROUP_KEYWORDS: Array<{ group: OnboardingMealGroup; keywords: string[] }> = [
  {
    group: 'rice_based',
    keywords: ['rice', 'risotto', 'biryani', 'paella', 'pilaf', 'congee', 'sushi', 'fried rice'],
  },
  {
    group: 'noodle',
    keywords: [
      'noodle',
      'pasta',
      'ramen',
      'udon',
      'spaghetti',
      'macaroni',
      'penne',
      'lo mein',
      'vermicelli',
    ],
  },
  {
    group: 'breakfast_bowl',
    keywords: ['oatmeal', 'oats', 'cereal', 'muesli', 'granola', 'porridge', 'breakfast bowl'],
  },
  {
    group: 'soup',
    keywords: ['soup', 'stew', 'bisque', 'chowder', 'minestrone', 'pozole'],
  },
  {
    group: 'yogurt_bowl',
    keywords: ['yogurt', 'yoghurt', 'curd', 'smoothie bowl'],
  },
  {
    group: 'potato',
    keywords: ['potato', 'fries', 'chips', 'baked potato', 'mashed potato', 'hash brown'],
  },
];

/** Meal-group of the analyzed meal for the generic meal-context prior. */
export function deriveMealGroup(foods: string[]): OnboardingMealGroup | 'other' {
  for (const food of foods) {
    const f = food.toLowerCase();
    for (const { group, keywords } of MEAL_GROUP_KEYWORDS) {
      if (keywords.some((keyword) => f.includes(keyword))) return group;
    }
  }
  return 'other';
}

export type AdditionRoleClass =
  | 'protein'
  | 'fibre_volume'
  | 'crunch'
  | 'fat_rich'
  | 'fresh'
  | 'seasoning'
  | 'comfort'
  | 'unknown';

/** Pair-catalog additions resolve directly; everything else hits the ingredient DB. */
const CATALOG_ROLE_CLASS: Record<string, AdditionRoleClass> = {
  'scrambled egg': 'protein',
  'sesame oil + furikake': 'seasoning',
  'leftover chicken': 'protein',
  'soft-cooked egg': 'protein',
  'banana + peanut butter': 'comfort',
  'frozen berries': 'fresh',
  'grilled cheese on the side': 'fat_rich',
  'white beans + spinach': 'fibre_volume',
  'granola + honey': 'crunch',
  'smashed berries + chia': 'crunch',
  'cheese + sour cream': 'fat_rich',
  'beans + chili seasoning': 'fibre_volume',
  'hot sauce + lime': 'seasoning',
  'sliced avocado': 'fat_rich',
};

export function roleClassForAddition(name: string): AdditionRoleClass {
  const n = name.trim().toLowerCase();
  if (CATALOG_ROLE_CLASS[n]) return CATALOG_ROLE_CLASS[n];
  const record = INGREDIENTS.find(
    (item) => item.name === n || item.aliases.some((alias) => alias === n || alias.includes(n)),
  );
  if (record) {
    const first = record.components[0];
    if (first === 'protein') return 'protein';
    if (first === 'fiber_sources') return 'fibre_volume';
    if (first === 'healthy_fat_sources') {
      return /seed|nut|peanut|granola/.test(record.name) ? 'crunch' : 'fat_rich';
    }
  }
  return 'unknown';
}

export type RoleFamily = 'PROTEIN' | 'CRUNCH' | 'FIBRE_VOLUME' | 'UNKNOWN';

export function roleFamily(roleClass: AdditionRoleClass): RoleFamily {
  if (roleClass === 'protein') return 'PROTEIN';
  if (roleClass === 'crunch') return 'CRUNCH';
  if (roleClass === 'fibre_volume' || roleClass === 'fresh') return 'FIBRE_VOLUME';
  return 'UNKNOWN';
}

type CoarseMealFamily = 'starchy_savory' | 'sweet_breakfast' | 'soupy' | 'other';

function coarseMealFamily(mealGroup: OnboardingMealGroup | 'other'): CoarseMealFamily {
  if (mealGroup === 'rice_based' || mealGroup === 'noodle' || mealGroup === 'potato') {
    return 'starchy_savory';
  }
  if (mealGroup === 'breakfast_bowl' || mealGroup === 'yogurt_bowl') return 'sweet_breakfast';
  if (mealGroup === 'soup') return 'soupy';
  return 'other';
}

/** Spec §6: meal_group x addition_role -> prior_compatibility (tiny static deltas). */
const GENERIC_MEAL_PRIOR: Record<CoarseMealFamily, Partial<Record<AdditionRoleClass, number>>> = {
  starchy_savory: {
    protein: 0.05,
    fibre_volume: 0.03,
    seasoning: 0.02,
    fat_rich: 0.02,
    crunch: 0.01,
    fresh: 0.01,
    comfort: 0,
  },
  sweet_breakfast: {
    fresh: 0.05,
    crunch: 0.04,
    comfort: 0.03,
    fat_rich: 0.02,
    fibre_volume: 0.02,
    protein: 0.01,
    seasoning: -0.02,
  },
  soupy: {
    fibre_volume: 0.05,
    seasoning: 0.03,
    protein: 0.04,
    comfort: 0.03,
    fat_rich: 0.02,
    fresh: 0.02,
    crunch: 0.01,
  },
  other: {},
};

/** Generic compatibility of an addition role with a meal group (user-independent). */
export function genericMealPrior(
  mealGroup: OnboardingMealGroup | 'other',
  roleClass: AdditionRoleClass,
): number {
  return GENERIC_MEAL_PRIOR[coarseMealFamily(mealGroup)][roleClass] ?? 0;
}

/** Spec §8: 0 -> none, 1 -> tiny, 2 -> moderate, 3+ -> strong but temporary. */
export function recencyPenalty(appearances: number): number {
  if (appearances <= 0) return 0;
  if (appearances === 1) return -0.05;
  if (appearances === 2) return -0.15;
  return -0.25;
}

export function recentAppearances(candidate: SignalCandidate, recentlyShown: string[]): number {
  const pool = new Set(recentlyShown.map((name) => name.toLowerCase()));
  return (candidate.additions ?? []).filter((addition) => pool.has(addition.name.toLowerCase()))
    .length;
}

export function familyCounts(recentlyShown: string[]): Record<RoleFamily, number> {
  const counts: Record<RoleFamily, number> = { PROTEIN: 0, CRUNCH: 0, FIBRE_VOLUME: 0, UNKNOWN: 0 };
  for (const name of recentlyShown) {
    counts[roleFamily(roleClassForAddition(name))] += 1;
  }
  return counts;
}

/** Soft reward (0..0.15) for role families under-shown recently. */
export function familyBenefit(family: RoleFamily, counts: Record<RoleFamily, number>): number {
  if (family === 'UNKNOWN') return 0;
  const seen = counts[family];
  const total = counts.PROTEIN + counts.CRUNCH + counts.FIBRE_VOLUME;
  if (total === 0) return 0.15;
  return 0.15 * (1 - seen / total);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * How well a candidate exercises the user's diagnosed factor affinities.
 * Each factor term is affinity x "fit" (0..1), averaged across the five
 * factors; NaN-safe - every undefined factor affinity reads as 0.
 */
export function factorAffinityForCandidate(
  candidate: SignalCandidate,
  profile: ColdStartProfileInput,
  missingComponents: string[],
  recentlyShown: string[],
): number {
  const byFactor = new Map(profile.coldStartFactors.map((f) => [f.factor, f.affinity]));
  const aff = (factor: ColdStartFactorKey): number => byFactor.get(factor) ?? 0;

  const classes = (candidate.additions ?? []).map((addition) =>
    roleClassForAddition(addition.name),
  );
  const families = classes.map(roleFamily);
  const has = (family: RoleFamily): boolean => families.includes(family);

  const missing = new Set(missingComponents);
  const nutFit =
    missing.size === 0
      ? 0.5
      : ((missing.has('protein') && has('PROTEIN') ? 1 : 0) +
          (missing.has('fiber_sources') && has('FIBRE_VOLUME') ? 1 : 0) +
          (missing.has('healthy_fat_sources') && (has('FIBRE_VOLUME') || has('CRUNCH')) ? 1 : 0)) /
        Math.max(1, missing.size);

  const senFit = has('CRUNCH') || has('FIBRE_VOLUME') ? 0.8 : 0.4;
  const satFit = has('PROTEIN') || has('CRUNCH') ? 0.8 : 0.5;
  const modFit = candidate.type === 'substitution' ? 0.8 : 0.3;
  const expFit =
    (candidate.additions ?? []).length > 0 &&
    (candidate.additions ?? []).some((addition) =>
      recentlyShown.includes(addition.name.toLowerCase()),
    )
      ? 0.2
      : 0.7;

  const terms = [
    aff('nutritional') * nutFit,
    aff('sensory') * senFit,
    aff('satisfaction') * satFit,
    aff('modification') * modFit,
    aff('exploration') * expFit,
  ];

  return clamp(terms.reduce((sum, term) => sum + term, 0) / 5, -1, 1);
}

const CONFIDENCE_VALUE: Record<ConfidenceState, number> = {
  unknown: 0,
  inferred: 0.5,
  confirmed: 1,
};

export function profileConfidenceFromFactors(
  factors: Array<{ confidence: ConfidenceState }>,
): number {
  if (factors.length === 0) return 0;
  return (
    factors.reduce((sum, factor) => sum + CONFIDENCE_VALUE[factor.confidence], 0) / factors.length
  );
}

/**
 * Normalize free-text feedback modifications into canonical, deduped,
 * lowercase ingredient names for the behavioral-override hook.
 */
export function normalizeIngredientNames(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const name = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z\s-]/g, '');
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Additions the user has recently been recommended, from persisted
 * Rescue.selectedRecommendation rows - the anti-fatigue input (V1 source).
 */
export function additionsFromRescues(
  rescues: Array<{ selectedRecommendation: unknown }>,
): string[] {
  const names = new Set<string>();
  for (const row of rescues) {
    const selected = row.selectedRecommendation as {
      candidate?: { additions?: Array<{ name?: string }> };
    } | null;
    for (const addition of selected?.candidate?.additions ?? []) {
      const name = addition?.name?.trim().toLowerCase();
      if (name) names.add(name);
    }
  }
  return [...names];
}
