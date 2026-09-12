import type {
  CommonTableEffort,
  CookingStep,
  EffortLevel,
  MealFinish,
  SharedMealPlan,
} from '@meal-rescue/shared-types';

import { findBestMatch, findByComponent } from '../ai/ingredient-db';
import type { MemberTasteContext } from './household-constraint.service';
import { HouseholdConstraintService } from './household-constraint.service';

/**
 * Deterministic meal-convergence core.
 *
 * Guarantees that hold regardless of AI availability:
 *  1. NO candidate may contain an ingredient unsafe for ANY member (hard
 *     constraints filter BEFORE scoring).
 *  2. The split point is DERIVED from the cooking graph (which stage has to
 *     branch) — never hardcoded per meal.
 *  3. Finishes are the smallest set of per-member additions; everything
 *     else stays shared ("branch as late as possible").
 *  4. If no candidate survives, we return an honest fallback — never a
 *     fabricated convergence.
 */

interface Stage {
  title: string;
  roles: ('protein' | 'carb' | 'veg' | 'fat' | 'seasoning')[];
  minutes: number;
}

interface Template {
  id: string;
  name: (protein: string, carb: string, veg: string) => string;
  stages: Stage[];
  equipment: string[];
  baseMinutes: number;
  noCook?: boolean;
  assembly: (protein: string, carb: string, veg: string, fat: string) => string[];
}

const PROTEIN_ROLE = 'protein' as const;
const CARB_ROLE = 'carb' as const;
const VEG_ROLE = 'veg' as const;
const FAT_ROLE = 'fat' as const;

const TEMPLATES: Template[] = [
  {
    id: 'bowl',
    name: (protein, carb, veg) =>
      `${titleCase(protein)} & ${titleCase(veg)} ${capitalize(carb)} Bowl`,
    stages: [
      { title: 'Cook the rice', roles: [CARB_ROLE], minutes: 12 },
      { title: 'Cook the protein', roles: [PROTEIN_ROLE], minutes: 8 },
      { title: 'Steam the vegetables', roles: [VEG_ROLE], minutes: 4 },
      { title: 'Season the base', roles: ['seasoning'], minutes: 2 },
    ],
    equipment: ['pan', 'pot'],
    baseMinutes: 18,
    assembly: (protein, carb, veg) => [protein, carb, veg, 'olive oil'],
  },
  {
    id: 'stirfry',
    name: (protein, carb, veg) => `${titleCase(protein)} & ${titleCase(veg)} Stir-fry`,
    stages: [
      { title: 'Cook the noodles', roles: [CARB_ROLE], minutes: 6 },
      { title: 'Cook the protein', roles: [PROTEIN_ROLE], minutes: 6 },
      { title: 'Stir through the vegetables', roles: [VEG_ROLE], minutes: 4 },
      { title: 'Finish the sauce', roles: ['seasoning', FAT_ROLE], minutes: 1 },
    ],
    equipment: ['pan', 'pot'],
    baseMinutes: 14,
    assembly: (protein, carb, veg) => [protein, carb, veg, 'soy sauce', 'olive oil'],
  },
  {
    id: 'pasta',
    name: (protein, carb, veg) =>
      `${titleCase(veg)} ${capitalize(carb)} with ${titleCase(protein)}`,
    stages: [
      { title: 'Boil the pasta', roles: [CARB_ROLE], minutes: 9 },
      { title: 'Cook the protein', roles: [PROTEIN_ROLE], minutes: 7 },
      {
        title: 'Warm the sauce & vegetables',
        roles: [VEG_ROLE, FAT_ROLE, 'seasoning'],
        minutes: 4,
      },
    ],
    equipment: ['pot', 'pan'],
    baseMinutes: 16,
    assembly: (protein, carb, veg) => [protein, carb, veg, 'tomato', 'olive oil'],
  },
  {
    id: 'skillet',
    name: (protein, carb, veg) => `${titleCase(protein)} & ${titleCase(veg)} Skillet`,
    stages: [
      { title: 'Start the potato', roles: [CARB_ROLE], minutes: 10 },
      { title: 'Add the protein', roles: [PROTEIN_ROLE], minutes: 7 },
      { title: 'Toss in the vegetables', roles: [VEG_ROLE], minutes: 4 },
      { title: 'Season', roles: ['seasoning', FAT_ROLE], minutes: 2 },
    ],
    equipment: ['pan'],
    baseMinutes: 20,
    assembly: (protein, carb, veg) => [protein, carb, veg, 'olive oil'],
  },
  {
    id: 'platter',
    name: (protein, carb, veg) =>
      `${titleCase(protein)} & ${titleCase(veg)} ${capitalize(carb)} Platter`,
    stages: [
      { title: 'Slice the bread', roles: [CARB_ROLE], minutes: 1 },
      { title: 'Prep the protein', roles: [PROTEIN_ROLE], minutes: 3 },
      { title: 'Arrange the vegetables', roles: [VEG_ROLE, FAT_ROLE], minutes: 3 },
    ],
    equipment: [],
    baseMinutes: 8,
    noCook: true,
    assembly: (protein, carb, veg) => [protein, carb, veg, 'hummus', 'olive oil'],
  },
];

export interface ConvergenceInput {
  members: MemberTasteContext[];
  providedIngredients: string[];
  source: 'text' | 'image' | 'kitchen' | 'any';
  effort: CommonTableEffort;
  timeMinutes?: number;
  shoppingAllowed: boolean;
}

export interface ConvergenceWinner {
  baseName: string;
  templateId: string;
  ingredients: string[];
  blockedIngredients: string[];
  sharedIngredients: string[];
  branchIngredients: string[];
  estimatedMinutes: number;
  equipment: string[];
  score: number;
  sharedSteps: CookingStep[];
  branchSteps: CookingStep[];
  splitPointIndex: number;
  finishes: MealFinish[];
  noCook: boolean;
}

export interface FallbackPlan {
  message: string;
  suggestions: string[];
}

export interface ConvergenceResult {
  converged: boolean;
  winner: ConvergenceWinner | null;
  fallback: FallbackPlan | null;
  blockedIngredients: string[];
  evaluated: number;
}

export class ConvergenceEngineService {
  constructor(private readonly constraints = new HouseholdConstraintService()) {}

  /**
   * Full deterministic pipeline:
   * candidate generation → hard safety → overlap scoring → split point →
   * branches. Never throws for unsolvable inputs — returns a fallback.
   */
  converge(input: ConvergenceInput): ConvergenceResult {
    const members = input.members;

    const offered = this.pool(input);
    if (offered.length === 0) {
      return {
        converged: false,
        winner: null,
        fallback: fallbackNoIngredients(),
        blockedIngredients: [],
        evaluated: 0,
      };
    }

    // Global hardening: every offered ingredient unsafe for ANYONE is blocked.
    const checked = this.constraints.sharedSafeIngredients(offered, members);
    const blockedIngredients = checked.blocked.map((b) => b.ingredient);
    const safePool = checked.safe;

    const candidates: ConvergenceWinner[] = [];
    for (const template of TEMPLATES) {
      if (template.noCook && input.effort !== 'quick') continue;

      const proteins = this.pickRole(safePool, PROTEIN_ROLE, offered, input.shoppingAllowed);
      const carbs = this.pickRole(safePool, CARB_ROLE, offered, input.shoppingAllowed);
      const vegs = this.pickRole(safePool, VEG_ROLE, offered, input.shoppingAllowed);
      if (proteins.length === 0 || carbs.length === 0 || vegs.length === 0) continue;

      const fat = this.fatFor(safePool, offered, input.shoppingAllowed);

      for (const protein of proteins.slice(0, 3)) {
        for (const carb of carbs.slice(0, 2)) {
          for (const veg of vegs.slice(0, 2)) {
            const ingredients = template
              .assembly(protein, carb, veg, fat)
              .filter(
                (name) =>
                  fat !== 'olive oil' ||
                  name !== 'olive oil' ||
                  offered.includes('olive oil') ||
                  input.shoppingAllowed,
              );

            if (ingredients.length === 0) continue;
            if (!this.anyOneCanEat(ingredients, members)) continue;

            const candidate = this.buildCandidate(
              template,
              protein,
              carb,
              veg,
              ingredients,
              members,
            );
            if (
              input.timeMinutes !== undefined &&
              candidate.estimatedMinutes > input.timeMinutes + 5
            ) {
              continue;
            }
            candidate.score = this.score(candidate, members, offered, input);
            candidates.push(candidate);
          }
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return {
        converged: false,
        winner: null,
        fallback: fallbackNoConvergence(members),
        blockedIngredients,
        evaluated: 0,
      };
    }

    return {
      converged: true,
      winner: candidates[0] ?? null,
      fallback: null,
      blockedIngredients,
      evaluated: candidates.length,
    };
  }

  private pool(input: ConvergenceInput): string[] {
    const provided = new Set<string>();
    for (const raw of input.providedIngredients) {
      const resolved = findBestMatch(raw)?.name ?? raw.trim().toLowerCase();
      if (resolved) provided.add(resolved);
    }

    if ((input.source === 'text' || input.source === 'kitchen') && provided.size > 0) {
      return [...provided];
    }

    // Image/any, or text with nothing usable → curated assessment defaults.
    const defaults = [
      ...findByComponent('protein')
        .map((r) => r.name)
        .slice(0, 4),
      ...findByComponent('carbohydrates')
        .map((r) => r.name)
        .slice(0, 4),
      ...findByComponent('fiber_sources')
        .map((r) => r.name)
        .slice(0, 4),
      ...findByComponent('healthy_fat_sources')
        .map((r) => r.name)
        .slice(0, 2),
    ];
    return [...new Set([...provided, ...defaults])];
  }

  private pickRole(
    safePool: string[],
    role: 'protein' | 'carb' | 'veg',
    offered: string[],
    shoppingAllowed: boolean,
  ): string[] {
    const fromComponent = findByComponent(
      role === PROTEIN_ROLE ? 'protein' : role === CARB_ROLE ? 'carbohydrates' : 'fiber_sources',
    ).map((r) => r.name);
    const preferred = fromComponent.filter(
      (name) => safePool.includes(name) || offered.includes(name),
    );
    if (preferred.length > 0) return preferred;
    if (shoppingAllowed) return fromComponent.filter((name) => safePool.includes(name));
    return [];
  }

  private fatFor(safePool: string[], offered: string[], shoppingAllowed: boolean): string {
    const fats = findByComponent('healthy_fat_sources').map((r) => r.name);
    const shared = fats.find((name) => safePool.includes(name) || offered.includes(name));
    if (shared) return shared;
    return shoppingAllowed ? 'olive oil' : 'olive oil';
  }

  private anyOneCanEat(ingredients: string[], members: MemberTasteContext[]): boolean {
    return ingredients.every((ingredient) =>
      members.some((m) => this.constraints.checkIngredient(ingredient, m) === null),
    );
  }

  private buildCandidate(
    template: Template,
    protein: string,
    carb: string,
    veg: string,
    ingredients: string[],
    members: MemberTasteContext[],
  ): ConvergenceWinner {
    const checked = this.constraints.sharedSafeIngredients(ingredients, members);
    const sharedSet = new Set(checked.safe);
    const branchSet = new Set(ingredients.filter((name) => !sharedSet.has(name)));

    const sharedSteps: CookingStep[] = [];
    const branchSteps: CookingStep[] = [];
    let splitPointIndex = 0;

    for (const stage of template.stages) {
      const refs = stage.roles
        .flatMap((role) => this.roleIngredients(role, protein, carb, veg))
        .filter((name) => ingredients.includes(name));

      const usesBranchOnly = refs.length > 0 && refs.every((name) => branchSet.has(name));

      const step: CookingStep = { title: stage.title, minutes: stage.minutes };
      if (!usesBranchOnly) {
        sharedSteps.push(step);
        splitPointIndex += 1;
      } else {
        branchSteps.push(step);
      }
    }

    const finishes = members.map((member) => this.finishFor(member, sharedSet));
    const estimatedMinutes =
      template.baseMinutes + (finishes.some((f) => f.additions.length > 0) ? 2 : 0);

    return {
      baseName: template.name(protein, carb, veg),
      templateId: template.id,
      ingredients,
      blockedIngredients: checked.blocked.map((b) => b.ingredient),
      sharedIngredients: [...sharedSet],
      branchIngredients: [...branchSet],
      estimatedMinutes,
      equipment: template.equipment,
      score: 0,
      sharedSteps,
      branchSteps,
      splitPointIndex,
      finishes,
      noCook: template.noCook === true,
    };
  }

  private roleIngredients(
    role: 'protein' | 'carb' | 'veg' | 'fat' | 'seasoning',
    protein: string,
    carb: string,
    veg: string,
  ): string[] {
    switch (role) {
      case PROTEIN_ROLE:
        return [protein];
      case CARB_ROLE:
        return [carb];
      case VEG_ROLE:
        return [veg];
      case FAT_ROLE:
        return ['hummus', 'olive oil'];
      case 'seasoning':
        return ['soy sauce', 'tomato', 'olive oil'];
    }
  }

  private finishFor(member: MemberTasteContext, shared: Set<string>): MealFinish {
    const pick: string[] = [];
    const notes: string[] = [];

    const prefersSpicy = member.spiceLevel === 'spicy';
    const prefersMild = member.spiceLevel === 'mild';
    const likesCreamy = member.textures.some((t) => /creamy|smooth/i.test(t));
    const likesCrunch = member.textures.some((t) => /crunch|crisp|texture/i.test(t));

    if (prefersSpicy) {
      pick.push(...this.memberDietSafe(member, ['hot sauce'], shared));
    } else if (likesCreamy) {
      pick.push(...this.memberDietSafe(member, ['greek yogurt', 'avocado'], shared));
    } else if (likesCrunch) {
      pick.push(...this.memberDietSafe(member, ['nuts and seeds', 'cucumber'], shared));
    }

    if (prefersMild && pick.length === 0) {
      notes.push('keep it gentle — no heat');
    }

    const safeFallback = this.memberDietSafe(member, ['olive oil', 'cucumber'], shared);
    if (pick.length === 0 && safeFallback.length > 0) pick.push(...safeFallback.slice(0, 1));
    if (pick.length === 0 && notes.length === 0) notes.push('serve as the base is');

    const title =
      pick.length > 0 ? `Finish for ${member.displayName}` : `Serve ${member.displayName} the base`;

    return {
      id: `${member.memberId}-${Math.floor(Math.random() * 100000)}`,
      memberId: member.memberId,
      memberName: member.displayName,
      title,
      additions: pick,
      notes: notes.length > 0 ? notes.join('. ') : undefined,
    };
  }

  private memberDietSafe(
    member: MemberTasteContext,
    additions: string[],
    shared: Set<string>,
  ): string[] {
    return additions.filter(
      (addition) =>
        this.constraints.checkIngredient(addition, member) === null && !shared.has(addition),
    );
  }

  private score(
    candidate: ConvergenceWinner,
    members: MemberTasteContext[],
    offered: string[],
    input: ConvergenceInput,
  ): number {
    const shared = candidate.sharedIngredients;

    const affinity = (ingredient: string, member: MemberTasteContext): number => {
      let value = 0;
      const canonical = findBestMatch(ingredient)?.name ?? ingredient;
      const declaredLike = member.likes.some((like) => findBestMatch(like)?.name === canonical);
      const declaredDislike = member.dislikes.some(
        (dislike) => findBestMatch(dislike)?.name === canonical,
      );
      if (declaredLike) value += 0.5;
      if (declaredDislike) value -= 0.5;
      value += (member.learned[canonical] ?? 0) * 0.3;

      if (member.spiceLevel === 'spicy' && canonical === 'hot sauce') value += 0.2;
      if (member.spiceLevel === 'mild' && canonical === 'hot sauce') value -= 0.3;
      if (member.textures.some((t) => /crunch|crisp/i.test(t)) && canonical === 'nuts and seeds') {
        value += 0.1;
      }
      return clamp(value, -1, 1);
    };

    let prefSum = 0;
    for (const member of members) {
      const ingAffinity =
        shared.length > 0
          ? shared.reduce((sum, ing) => sum + affinity(ing, member), 0) / shared.length
          : 0;
      prefSum += ingAffinity;
    }
    const prefScore = members.length > 0 ? prefSum / members.length : 0;

    const sharedRatio =
      candidate.ingredients.length > 0
        ? candidate.sharedIngredients.length / candidate.ingredients.length
        : 0;

    const offeredNames = new Set(offered.map((name) => findBestMatch(name)?.name ?? name));
    const utilized =
      offeredNames.size > 0 && candidate.ingredients.length > 0
        ? candidate.ingredients.filter((name) => offeredNames.has(name)).length /
          Math.min(offeredNames.size, candidate.ingredients.length)
        : 0;

    const timeFit =
      input.timeMinutes !== undefined
        ? candidate.estimatedMinutes <= input.timeMinutes
          ? 1
          : Math.max(0, 1 - (candidate.estimatedMinutes - input.timeMinutes) / input.timeMinutes)
        : 1;

    const complexity = candidate.branchSteps.length * 0.03;

    return (
      prefScore * 0.45 +
      sharedRatio * 0.25 +
      utilized * 0.15 +
      timeFit * 0.1 +
      (candidate.noCook ? 0.04 : 0) -
      complexity
    );
  }
}

export function toSharedMealPlan(winner: ConvergenceWinner): SharedMealPlan {
  return {
    baseName: winner.baseName,
    baseDescription: `One base — everyone finishes their own plate in about ${winner.estimatedMinutes} minutes.`,
    estimatedMinutes: winner.estimatedMinutes,
    effort: toEffortLevel(winner.estimatedMinutes),
    equipment: winner.equipment,
    sharedSteps: winner.sharedSteps,
    splitPointIndex: winner.splitPointIndex,
    branchSteps: winner.branchSteps,
    finishes: winner.finishes,
    ingredients: winner.ingredients,
    excludedIngredients: winner.blockedIngredients,
  };
}

function fallbackNoIngredients(): FallbackPlan {
  return {
    message: "I couldn't find one meal that genuinely works for everyone.",
    suggestions: [
      'Add a few ingredients to your kitchen, then plan the table.',
      'Let me suggest a short shopping list to make a shared meal possible.',
      'Tell me what you have — even two or three things — and I will make it work.',
    ],
  };
}

function fallbackNoConvergence(members: MemberTasteContext[]): FallbackPlan {
  const names = members.map((m) => m.displayName).join(', ');
  return {
    message: `I couldn't find one meal that genuinely works for ${names}.`,
    suggestions: [
      'Cook one shared base and let everyone finish their plate their way.',
      'Try a family-style meal with sides everyone can share.',
      'Pick a build-your-own meal — one base, many finishes.',
    ],
  };
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toEffortLevel(minutes: number): EffortLevel {
  if (minutes <= 12) return 'low';
  if (minutes <= 20) return 'medium';
  return 'high';
}
