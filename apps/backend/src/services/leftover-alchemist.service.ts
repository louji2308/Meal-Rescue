import type {
  EffortLevel,
  FoodComponent,
  LeftoverAlchemistRequest,
  LeftoverAlchemistResponse,
  PickedImage,
  Transformation,
} from '@meal-rescue/shared-types';

import { findIngredient } from './ai/ingredient-db';
import { createLlmClient } from './ai/llm-factory';

/**
 * LeftoverAlchemistService - "Photograph leftovers -> Transform what exists"
 *
 * Takes an image (or description) of leftovers, identifies usable components,
 * generates up to 3 transformations ranked by effort.
 */
export class LeftoverAlchemistService {
  private readonly llm = createLlmClient();

  async alchemize(request: LeftoverAlchemistRequest): Promise<LeftoverAlchemistResponse> {
    const { image, description, userId: _userId } = request;

    // Identify components from image/description
    const components = await this.identifyComponents(image, description);

    // Generate transformations using the identified components
    const transformations = this.generateTransformations(components);

    // Rank by effort (low first)
    const effortRanking = [...transformations]
      .sort((a, b) => this.effortValue(a.effort) - this.effortValue(b.effort))
      .map((t) => t.effort);

    return {
      identifiedComponents: components,
      transformations,
      effortRanking,
    };
  }

  private async identifyComponents(
    image: PickedImage | undefined,
    description: string | undefined,
  ): Promise<FoodComponent[]> {
    // In a real implementation, this would call the vision model
    // For now, parse from description or use the ingredient DB

    const text = description ?? '';
    const components: FoodComponent[] = [];

    // Simple keyword extraction from description
    const knownIngredients = [
      'rice',
      'chicken',
      'beef',
      'pork',
      'tofu',
      'eggs',
      'pasta',
      'noodles',
      'potatoes',
      'bread',
      'tortillas',
      'vegetables',
      'broccoli',
      'carrots',
      'spinach',
      'peppers',
      'onions',
      'garlic',
      'tomatoes',
      'cheese',
      'beans',
      'lentils',
      'rice',
      'quinoa',
      'salmon',
      'tuna',
      'shrimp',
    ];

    for (const ingredient of knownIngredients) {
      if (text.toLowerCase().includes(ingredient)) {
        const record = findIngredient(ingredient);
        components.push({
          name: ingredient,
          quantity: 'some',
          state: record?.components.includes('protein') ? 'cooked' : 'raw',
        });
      }
    }

    // Also try to extract from image metadata if available
    // (In production, this would call the vision service)

    return components.length > 0
      ? components
      : [{ name: 'mixed leftovers', quantity: 'some', state: 'cooked' }];
  }

  private generateTransformations(components: FoodComponent[]): Transformation[] {
    const names = components.map((c) => c.name.toLowerCase());
    const hasProtein = names.some((n) =>
      [
        'chicken',
        'beef',
        'pork',
        'tofu',
        'eggs',
        'salmon',
        'tuna',
        'shrimp',
        'beans',
        'lentils',
      ].includes(n),
    );
    const hasCarb = names.some((n) =>
      ['rice', 'pasta', 'noodles', 'potatoes', 'bread', 'tortillas', 'quinoa'].includes(n),
    );
    const hasVeg = names.some((n) =>
      [
        'vegetables',
        'broccoli',
        'carrots',
        'spinach',
        'peppers',
        'onions',
        'garlic',
        'tomatoes',
      ].includes(n),
    );

    const transformations: Transformation[] = [];

    // Bowl format - always possible
    transformations.push({
      name: 'Leftover Bowl',
      format: 'bowl',
      ingredients: names,
      instructions: [
        'Reheat protein and carb components separately',
        'Steam or microwave vegetables',
        'Layer in bowl: carb base, protein, vegetables',
        'Add sauce or dressing of choice',
      ],
      estimatedTimeMinutes: 5,
      effort: 'low',
      description: 'Quick assembly - just reheat and layer',
    });

    // Wrap format - if has tortilla/bread or can buy
    transformations.push({
      name: 'Leftover Wrap',
      format: 'wrap',
      ingredients: [...names, 'tortilla or flatbread'],
      instructions: [
        'Warm tortilla/flatbread',
        'Spread any sauce or hummus',
        'Add protein, carb, and vegetables in center',
        'Roll tightly and toast seam-side down',
      ],
      estimatedTimeMinutes: 8,
      effort: 'low',
      description: 'Handheld - great for eating on the go',
    });

    // Skillet format - if has protein + veg
    if (hasProtein && hasVeg) {
      transformations.push({
        name: 'Crispy Skillet Hash',
        format: 'skillet',
        ingredients: names,
        instructions: [
          'Dice all components into small pieces',
          'Heat oil in large skillet over medium-high',
          'Add carb base first, press down to crisp (3-4 min)',
          'Add protein and vegetables, stir-fry until heated through',
          'Optional: top with fried egg',
        ],
        estimatedTimeMinutes: 12,
        effort: 'medium',
        description: 'Crispy textures, deeper flavor from browning',
      });
    }

    // Soup format - if has liquid potential
    if (hasCarb || hasProtein) {
      transformations.push({
        name: 'Leftover Soup',
        format: 'soup',
        ingredients: [...names, 'broth or water', 'seasonings'],
        instructions: [
          'Simmer broth with aromatics (onion, garlic)',
          'Add harder vegetables first (carrots, potatoes)',
          'Add protein and softer vegetables',
          'Add pre-cooked carbs last (just to heat)',
          'Season and simmer 5 minutes',
        ],
        estimatedTimeMinutes: 15,
        effort: 'low',
        description: 'Comforting, stretches leftovers further',
      });
    }

    // Salad format - if has fresh veg + protein
    if (hasProtein && hasVeg) {
      transformations.push({
        name: 'Leftover Salad',
        format: 'salad',
        ingredients: names,
        instructions: [
          'Chop all components into bite-sized pieces',
          'Toss with greens if available',
          'Add dressing (vinaigrette, yogurt-based, etc.)',
          'Top with nuts/seeds for crunch',
        ],
        estimatedTimeMinutes: 5,
        effort: 'low',
        description: 'Fresh, no cooking required',
      });
    }

    // Bake format - if has carb + cheese/protein
    if (hasCarb && (hasProtein || names.includes('cheese'))) {
      transformations.push({
        name: 'Leftover Bake',
        format: 'bake',
        ingredients: [...names, 'cheese', 'breadcrumbs (optional)'],
        instructions: [
          'Preheat oven to 375°F (190°C)',
          'Mix components in baking dish',
          'Top with cheese and breadcrumbs',
          'Bake 15-20 min until bubbly and golden',
        ],
        estimatedTimeMinutes: 25,
        effort: 'medium',
        description: 'Crowd-pleaser, makes a full meal',
      });
    }

    return transformations.slice(0, 3); // MAX 3 per product rule
  }

  private effortValue(effort: EffortLevel): number {
    return effort === 'low' ? 0 : effort === 'medium' ? 1 : 2;
  }
}
