import type {
  FridgeNegotiateRequest,
  FridgeNegotiateResponse,
  HungerLevel,
  MealRecommendation,
} from '@meal-rescue/shared-types';

import { type IngredientRecord, findBestMatch } from './ai/ingredient-db';
import { createLlmClient } from './ai/llm-factory';
import { reasoningSchema } from './ai/llm-schemas';

/**
 * FridgeNegotiatorService - "I'm hungry, here's what I have"
 *
 * Composes complete meals around the ingredients you already own using
 * format templates (fried rice, scramble, toast, pasta toss, ...). Returns
 * up to 3 distinct meals ranked by how much of your food they use.
 * Missing ingredients are honest staples only - never the meal itself.
 */

const CARBS = ['rice', 'instant noodles', 'pasta', 'bread', 'potato'];
const PROTEINS = [
  'egg',
  'canned tuna',
  'rotisserie chicken',
  'canned chickpeas',
  'canned black beans',
  'firm tofu',
  'edamame',
  'greek yogurt',
  'cottage cheese',
  'cheese',
  'peanut butter',
  'nuts and seeds',
  'hummus',
];
const VEGGIES = [
  'spinach',
  'frozen mixed vegetables',
  'tomato',
  'cucumber',
  'carrot',
  'bell pepper',
  'broccoli',
  'avocado',
  'salsa',
];
const FRUITS = ['banana', 'apple', 'berries'];

interface ComposedMeal extends MealRecommendation {
  score: number;
}

export class FridgeNegotiatorService {
  private readonly llm = createLlmClient();

  async negotiate(request: FridgeNegotiateRequest): Promise<FridgeNegotiateResponse> {
    const { availableIngredients, timeMinutes, hungerLevel } = request;

    // Normalize to known KB entries; unknown items stay as freeform names
    // so "chicken breast" still lands on rotisserie chicken etc.
    const matched = new Map<string, IngredientRecord>();
    for (const item of availableIngredients) {
      const record = findBestMatch(item);
      if (record) matched.set(record.name, record);
    }
    const available = [...matched.values()];
    const availableNames = new Set(available.map((r) => r.name));

    const maxTime = Math.max(5, timeMinutes);
    const snack = hungerLevel === 'snack';

    const meals: Array<ComposedMeal | null> = [];
    if (matched.has('rice')) meals.push(this.friedRice(matched, availableNames, snack));
    if (matched.has('instant noodles')) meals.push(this.loadedNoodles(matched, availableNames));
    if (matched.has('egg')) meals.push(this.eggScramble(matched, availableNames, maxTime, snack));
    if (matched.has('bread')) meals.push(this.breadMeal(matched, availableNames, snack));
    if (matched.has('pasta')) meals.push(this.pastaToss(matched, availableNames));
    if (matched.has('potato')) meals.push(this.potatoHash(matched, availableNames));
    if (snack) {
      meals.push(...this.snackPlates(matched, availableNames));
    } else {
      meals.push(this.proteinBowl(matched, availableNames));
      meals.push(this.yogurtBowl(matched, availableNames));
    }

    const viable = meals
      .filter((meal): meal is ComposedMeal => meal !== null)
      .filter((meal) => meal.estimatedTimeMinutes <= maxTime)
      .sort((a, b) => b.score - a.score || a.estimatedTimeMinutes - b.estimatedTimeMinutes);

    const recommendations: MealRecommendation[] = this.diversify(viable).slice(0, 3);
    const allMissing = [...new Set(recommendations.flatMap((r) => r.missingIngredients))];
    const reasoning = await this.generateReasoning(
      availableIngredients,
      hungerLevel,
      timeMinutes,
      recommendations.length,
    );

    return { recommendations, reasoning, missingIngredients: allMissing };
  }

  /** Prefer meals that use different primary formats/ingredients. */
  private diversify(sorted: ComposedMeal[]): ComposedMeal[] {
    const picked: ComposedMeal[] = [];
    for (const meal of sorted) {
      const overlap = meal.usesPantryItems.filter((item) =>
        picked.some((p) => p.usesPantryItems.includes(item)),
      ).length;
      if (picked.length < 3 && overlap < Math.ceil(meal.usesPantryItems.length / 2)) {
        picked.push(meal);
      }
    }
    // Fill remaining slots with the best-scoring leftovers.
    for (const meal of sorted) {
      if (picked.length >= 3) break;
      if (!picked.includes(meal)) picked.push(meal);
    }
    return picked;
  }

  private finalize(
    name: string,
    used: IngredientRecord[],
    extraIngredients: string[],
    steps: string[],
    needsStaples: string[],
    availableNames: Set<string>,
    scoreBase: number,
  ): ComposedMeal | null {
    if (used.length === 0 && extraIngredients.length === 0) return null;

    const usedNames = used.map((r) => r.name);
    const allIngredients = [...usedNames, ...extraIngredients];
    const missing = needsStaples.filter((s) => !availableNames.has(s));

    const totalSteps = used.reduce((sum, r) => sum + r.cookingSteps, 0);
    const effort = totalSteps === 0 ? 'low' : totalSteps <= 3 ? 'medium' : 'high';
    const time = Math.max(2, ...used.map((r) => r.prepTimeMinutes));

    return {
      name,
      ingredients: allIngredients,
      instructions: steps,
      estimatedTimeMinutes: time,
      effort,
      missingIngredients: missing,
      usesPantryItems: usedNames,
      nutritionNote: this.nutritionNote(used),
      score:
        scoreBase +
        used.length * 10 +
        (used.some((r) => PROTEINS.includes(r.name)) ? 4 : 0) +
        (used.some((r) => VEGGIES.includes(r.name)) ? 3 : 0),
    };
  }

  private nutritionNote(used: IngredientRecord[]): string | undefined {
    const hasProtein = used.some((r) => PROTEINS.includes(r.name));
    const hasFiber = used.some((r) => VEGGIES.includes(r.name));
    const hasFat = used.some((r) => r.components.includes('healthy_fat_sources'));
    if (hasProtein && hasFiber && hasFat) return 'Balanced: protein, fiber, and healthy fats.';
    if (hasProtein && hasFiber) return 'Good protein and fiber.';
    if (hasProtein) return 'Protein-rich.';
    if (hasFiber) return 'Fiber-rich.';
    return undefined;
  }

  private friedRice(
    matched: Map<string, IngredientRecord>,
    availableNames: Set<string>,
    snack: boolean,
  ): ComposedMeal | null {
    const rice = matched.get('rice')!;
    const protein =
      PROTEINS.map((n) => matched.get(n)).find((r): r is IngredientRecord => !!r) ?? null;
    const veg = VEGGIES.map((n) => matched.get(n)).find((r): r is IngredientRecord => !!r) ?? null;
    const soy = matched.get('soy sauce');

    const used = [rice, protein, veg].filter((r): r is IngredientRecord => !!r);
    const steps = [
      'Heat a little oil in a pan over medium-high heat.',
      ...(veg ? [`Cook the ${veg.name} for 2 minutes.`] : []),
      ...(protein ? [`Add ${protein.name} and cook until done.`] : []),
      `Stir in the rice${soy ? ` and ${soy.name}` : ''}; fry 3-4 minutes.`,
      snack ? 'Serve a small bowl.' : 'Season and serve hot.',
    ];

    return this.finalize(
      `${protein ? `${this.title(protein.name)} fried rice` : 'Quick fried rice'}${
        veg ? ` with ${veg.name}` : ''
      }`,
      used,
      ['cooking oil'],
      steps,
      ['cooking oil'],
      availableNames,
      8,
    );
  }

  private loadedNoodles(
    matched: Map<string, IngredientRecord>,
    availableNames: Set<string>,
  ): ComposedMeal | null {
    const noodles = matched.get('instant noodles')!;
    const protein =
      PROTEINS.map((n) => matched.get(n)).find((r): r is IngredientRecord => !!r) ?? null;
    const veg = VEGGIES.map((n) => matched.get(n)).find((r): r is IngredientRecord => !!r) ?? null;

    const used = [noodles, protein, veg].filter((r): r is IngredientRecord => !!r);
    const steps = [
      'Cook the noodles per the packet (save the seasoning).',
      ...(protein ? [`In the last 2 minutes, stir in ${protein.name}.`] : []),
      ...(veg ? [`Add ${veg.name} and simmer 1 minute more.`] : []),
      'Season with the packet and serve.',
    ];

    return this.finalize(
      `Loaded ${protein ? `${protein.name} ` : ''}noodles${veg ? ` with ${veg.name}` : ''}`,
      used,
      [],
      steps,
      [],
      availableNames,
      6,
    );
  }

  private eggScramble(
    matched: Map<string, IngredientRecord>,
    availableNames: Set<string>,
    maxTime: number,
    snack: boolean,
  ): ComposedMeal | null {
    const egg = matched.get('egg')!;
    const veg = VEGGIES.filter((n) => n !== 'salsa')
      .map((n) => matched.get(n))
      .filter((r): r is IngredientRecord => !!r)
      .slice(0, 2);
    const carb =
      CARBS.filter((n) => n !== 'bread')
        .map((n) => matched.get(n))
        .find((r): r is IngredientRecord => !!r) ?? null;

    const used = [egg, ...veg, ...(carb && !snack ? [carb] : [])].filter(
      (r): r is IngredientRecord => !!r,
    );
    if (used.reduce((sum, r) => sum + r.prepTimeMinutes, 0) > maxTime) return null;

    const steps = [
      'Beat the eggs with a pinch of salt.',
      ...(veg.length > 0
        ? [`Sauté the ${veg.map((v) => v.name).join(' and ')} in butter or oil, 2-3 minutes.`]
        : []),
      'Pour in the eggs and scramble over low heat until just set.',
      ...(carb && !snack ? [`Serve over ${carb.name}.`] : ['Serve on its own.']),
    ];

    return this.finalize(
      `Veggie egg scramble${carb && !snack ? ` on ${carb.name}` : ''}`,
      used,
      ['butter or oil'],
      steps,
      ['butter or oil'],
      availableNames,
      7,
    );
  }

  private breadMeal(
    matched: Map<string, IngredientRecord>,
    availableNames: Set<string>,
    snack: boolean,
  ): ComposedMeal | null {
    const bread = matched.get('bread')!;
    const protein =
      PROTEINS.filter((n) => n !== 'nuts and seeds')
        .map((n) => matched.get(n))
        .find((r): r is IngredientRecord => !!r) ?? null;
    const veg = VEGGIES.map((n) => matched.get(n)).find((r): r is IngredientRecord => !!r) ?? null;

    if (!protein && !veg) return null;
    const used = [bread, protein, veg].filter((r): r is IngredientRecord => !!r);
    const isSpread = protein && ['peanut butter', 'hummus'].includes(protein.name);

    const steps = isSpread
      ? [`Toast the bread, then spread ${protein!.name} on top.`]
      : [
          'Toast the bread.',
          ...(protein ? [`Layer on ${protein!.name}.`] : []),
          ...(veg ? [`Top with ${veg.name}.`] : []),
          'Season and press into a sandwich.',
        ];

    const kind = isSpread ? 'toast' : snack ? 'sandwich' : 'toasted sandwich';
    return this.finalize(
      `${this.title(isSpread ? protein!.name : (protein?.name ?? veg!.name))} ${kind}${
        !isSpread && veg ? ` with ${veg.name}` : ''
      }`,
      used,
      [],
      steps,
      [],
      availableNames,
      5,
    );
  }

  private pastaToss(
    matched: Map<string, IngredientRecord>,
    availableNames: Set<string>,
  ): ComposedMeal | null {
    const pasta = matched.get('pasta')!;
    const protein =
      PROTEINS.map((n) => matched.get(n)).find((r): r is IngredientRecord => !!r) ?? null;
    const veg = VEGGIES.map((n) => matched.get(n)).find((r): r is IngredientRecord => !!r) ?? null;

    if (!protein && !veg) return null;
    const used = [pasta, protein, veg].filter((r): r is IngredientRecord => !!r);
    const steps = [
      'Boil the pasta until al dente.',
      ...(protein ? [`Warm or cook the ${protein.name} in a pan.`] : []),
      ...(veg ? [`Toss in ${veg.name} for the last minute.`] : []),
      'Drain, combine everything with a splash of olive oil, and serve.',
    ];

    return this.finalize(
      `${this.title(protein?.name ?? veg!.name)} pasta`,
      used,
      [],
      steps,
      [],
      availableNames,
      5,
    );
  }

  private potatoHash(
    matched: Map<string, IngredientRecord>,
    availableNames: Set<string>,
  ): ComposedMeal | null {
    const potato = matched.get('potato')!;
    const protein =
      ['egg', 'canned chickpeas', 'canned black beans', 'cheese']
        .map((n) => matched.get(n))
        .find((r): r is IngredientRecord => !!r) ?? null;
    const veg = VEGGIES.map((n) => matched.get(n))
      .filter((r): r is IngredientRecord => !!r)
      .slice(0, 2);

    const used = [potato, protein, ...veg].filter((r): r is IngredientRecord => !!r);
    const steps = [
      'Dice the potato small (faster cooking).',
      'Fry in oil over medium heat, stirring, until golden - about 8 minutes.',
      ...(veg.length > 0 ? [`Add ${veg.map((v) => v.name).join(' and ')}; cook 2 minutes.`] : []),
      ...(protein ? [`Stir in ${protein!.name} and heat through.`] : []),
      'Season generously and serve.',
    ];

    return this.finalize(
      `${protein ? `${this.title(protein.name)} ` : ''}potato hash${
        veg.length > 0 ? ` with veggies` : ''
      }`,
      used,
      ['cooking oil'],
      steps,
      ['cooking oil'],
      availableNames,
      5,
    );
  }

  private proteinBowl(
    matched: Map<string, IngredientRecord>,
    availableNames: Set<string>,
  ): ComposedMeal | null {
    const proteins = PROTEINS.map((n) => matched.get(n))
      .filter((r): r is IngredientRecord => !!r)
      .slice(0, 2);
    const veg = VEGGIES.map((n) => matched.get(n))
      .filter((r): r is IngredientRecord => !!r)
      .slice(0, 2);
    if (proteins.length === 0) return null;

    const used = [...proteins, ...veg];
    const steps = [
      proteins.some((p) => p.cookingSteps > 0)
        ? 'Cook any raw items first (pan or pot, few minutes).'
        : 'No cooking needed.',
      `Arrange the ${proteins.map((p) => p.name).join(', ')} in a bowl.`,
      ...(veg.length > 0 ? [`Add the ${veg.map((v) => v.name).join(' and ')} alongside.`] : []),
      'Dress with oil or sauce of choice.',
    ];

    return this.finalize(
      `${this.title(proteins[0]!.name)} power bowl`,
      used,
      [],
      steps,
      [],
      availableNames,
      4,
    );
  }

  private yogurtBowl(
    matched: Map<string, IngredientRecord>,
    availableNames: Set<string>,
  ): ComposedMeal | null {
    const base = matched.get('greek yogurt') ?? matched.get('cottage cheese') ?? null;
    if (!base) return null;
    const fruit = FRUITS.map((n) => matched.get(n))
      .filter((r): r is IngredientRecord => !!r)
      .slice(0, 1);
    const nuts = matched.get('nuts and seeds');
    const used = [base, ...fruit, ...(nuts ? [nuts] : [])];

    const steps = [
      `Spoon the ${base.name} into a bowl.`,
      ...(fruit.length > 0 ? [`Top with sliced ${fruit[0]!.name}.`] : []),
      ...(nuts ? ['Scatter nuts/seeds over the top.'] : []),
      'Eat immediately.',
    ];

    return this.finalize(
      `${this.title(base.name)} bowl with ${fruit[0]?.name ?? 'toppings'}`,
      used,
      [],
      steps,
      [],
      availableNames,
      4,
    );
  }

  private snackPlates(
    matched: Map<string, IngredientRecord>,
    availableNames: Set<string>,
  ): ComposedMeal[] {
    const plates: ComposedMeal[] = [];

    const hummus = matched.get('hummus');
    const dipper =
      VEGGIES.map((n) => matched.get(n)).find((r): r is IngredientRecord => !!r) ?? null;
    if (hummus && dipper) {
      const meal = this.finalize(
        `${dipper.name} sticks with hummus`,
        [hummus, dipper],
        [],
        [`Cut the ${dipper.name} into sticks.`, 'Serve with hummus for dipping.'],
        [],
        availableNames,
        3,
      );
      if (meal) plates.push(meal);
    }

    const pb = matched.get('peanut butter');
    const fruit = FRUITS.map((n) => matched.get(n)).find((r): r is IngredientRecord => !!r);
    if (pb && fruit) {
      const meal = this.finalize(
        `${fruit.name} with peanut butter`,
        [pb, fruit],
        [],
        [`Slice the ${fruit.name}.`, 'Dip or spread with peanut butter.'],
        [],
        availableNames,
        3,
      );
      if (meal) plates.push(meal);
    }

    const tuna = matched.get('canned tuna');
    const crackerVeg = matched.get('cucumber') ?? matched.get('tomato');
    if (tuna) {
      const meal = this.finalize(
        crackerVeg ? `Tuna ${crackerVeg.name} bites` : 'Simple tuna plate',
        [tuna, ...(crackerVeg ? [crackerVeg] : [])],
        [],
        [
          'Drain the tuna.',
          ...(crackerVeg ? [`Slice the ${crackerVeg.name} and top with tuna.`] : []),
          'Season and eat straight away.',
        ],
        [],
        availableNames,
        3,
      );
      if (meal) plates.push(meal);
    }

    return plates;
  }

  private title(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  private async generateReasoning(
    available: string[],
    hungerLevel: HungerLevel | undefined,
    timeMinutes: number,
    count: number,
  ): Promise<string> {
    const userContent = `User has: ${available.join(', ')}. Time: ${timeMinutes}min. Hunger: ${hungerLevel ?? 'meal'}.
Generated ${count} meals from their ingredients. Write a brief, friendly explanation of why these work well.`;

    try {
      const result = await this.llm.completeJson<{ reasoning: string }>({
        systemPrompt:
          'You are a helpful meal planning assistant. Write brief, friendly explanations.',
        userContent,
        schema: reasoningSchema,
        modelName: 'fridge-negotiator-reasoning',
      });
      return result.data.reasoning || 'These meals make great use of what you have on hand.';
    } catch {
      return count > 0
        ? `Found ${count} meals from what you have - ready in about ${timeMinutes} minutes.`
        : "Couldn't match those ingredients to a recipe yet - try adding a staple like rice, bread, or eggs.";
    }
  }
}
