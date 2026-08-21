/**
 * Curated ingredient knowledge base.
 *
 * Deliberately in-code rather than a database service: Phase 2 needs a
 * reliable, versioned source of truth for (a) candidate generation,
 * (b) allergen/diet filtering, (c) the heuristic LLM fallback. A few dozen
 * well-chosen staples cover the vast majority of "rescue my meal" cases;
 * growing this into an external service is a later-phase decision.
 *
 * All names are canonical lowercase; aliases map colloquial terms.
 */
import type {
  BudgetLevel,
  ComponentKey,
  DietaryRestriction,
  IngredientState,
} from '@meal-rescue/shared-types';

export type AllergenKey =
  'peanuts' | 'tree_nuts' | 'dairy' | 'eggs' | 'gluten' | 'soy' | 'fish' | 'shellfish';

export interface IngredientRecord {
  name: string;
  aliases: string[];
  /** Nutritional components this ingredient provides. */
  components: ComponentKey[];
  costLevel: BudgetLevel;
  prepTimeMinutes: number;
  cookingSteps: number;
  requiredEquipment: string[];
  state: IngredientState;
  substitutes: string[];
  allergens: AllergenKey[];
  /** Diets this ingredient is INCOMPATIBLE with (empty = fits everything). */
  excludesDiets: DietaryRestriction[];
}

const P = 'protein' as const;
const F = 'fiber_sources' as const;
const FAT = 'healthy_fat_sources' as const;
const C = 'carbohydrates' as const;

export const INGREDIENTS: IngredientRecord[] = [
  // --- Proteins -----------------------------------------------------------
  {
    name: 'egg',
    aliases: ['eggs', 'scrambled egg', 'fried egg', 'boiled egg', 'omelet'],
    components: [P],
    costLevel: 'low',
    prepTimeMinutes: 4,
    cookingSteps: 2,
    requiredEquipment: ['pan'],
    state: 'raw',
    substitutes: ['tofu', 'cottage cheese'],
    allergens: ['eggs'],
    excludesDiets: ['vegan'],
  },
  {
    name: 'canned tuna',
    aliases: ['tuna', 'tinned tuna'],
    components: [P, FAT],
    costLevel: 'low',
    prepTimeMinutes: 1,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['canned chickpeas', 'cottage cheese'],
    allergens: ['fish'],
    excludesDiets: ['vegan', 'vegetarian'],
  },
  {
    name: 'rotisserie chicken',
    aliases: ['cooked chicken', 'grilled chicken', 'chicken breast'],
    components: [P],
    costLevel: 'medium',
    prepTimeMinutes: 3,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'cooked',
    substitutes: ['canned chickpeas', 'firm tofu', 'canned tuna'],
    allergens: [],
    excludesDiets: ['vegan', 'vegetarian'],
  },
  {
    name: 'canned chickpeas',
    aliases: ['chickpeas', 'garbanzo beans', 'chana'],
    components: [P, F],
    costLevel: 'low',
    prepTimeMinutes: 2,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['canned black beans', 'firm tofu', 'edamame'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'canned black beans',
    aliases: ['black beans', 'frijoles negros'],
    components: [P, F],
    costLevel: 'low',
    prepTimeMinutes: 2,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['canned chickpeas', 'red kidney beans'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'firm tofu',
    aliases: ['tofu', 'bean curd'],
    components: [P],
    costLevel: 'low',
    prepTimeMinutes: 5,
    cookingSteps: 2,
    requiredEquipment: ['pan'],
    state: 'raw',
    substitutes: ['edamame', 'tempeh', 'egg'],
    allergens: ['soy'],
    excludesDiets: [],
  },
  {
    name: 'edamame',
    aliases: ['soy beans', 'green soybeans'],
    components: [P, F],
    costLevel: 'low',
    prepTimeMinutes: 3,
    cookingSteps: 1,
    requiredEquipment: ['pot'],
    state: 'raw',
    substitutes: ['firm tofu', 'green peas'],
    allergens: ['soy'],
    excludesDiets: [],
  },
  {
    name: 'greek yogurt',
    aliases: ['yogurt', 'curd', 'dahi'],
    components: [P],
    costLevel: 'low',
    prepTimeMinutes: 0,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['cottage cheese', 'hummus'],
    allergens: ['dairy'],
    excludesDiets: ['vegan'],
  },
  {
    name: 'cottage cheese',
    aliases: ['paneer', 'queso fresco'],
    components: [P],
    costLevel: 'low',
    prepTimeMinutes: 0,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['greek yogurt', 'firm tofu'],
    allergens: ['dairy'],
    excludesDiets: ['vegan'],
  },
  {
    name: 'peanut butter',
    aliases: ['pb', 'groundnut paste'],
    components: [P, FAT],
    costLevel: 'low',
    prepTimeMinutes: 1,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['almond butter', 'sunflower seed butter'],
    allergens: ['peanuts'],
    excludesDiets: [],
  },

  // --- Fiber / vegetables -------------------------------------------------
  {
    name: 'spinach',
    aliases: ['baby spinach', 'palak'],
    components: [F],
    costLevel: 'low',
    prepTimeMinutes: 2,
    cookingSteps: 1,
    requiredEquipment: ['pan'],
    state: 'raw',
    substitutes: ['kale', 'frozen mixed vegetables', 'cucumber'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'frozen mixed vegetables',
    aliases: ['mixed vegetables', 'frozen veggies', 'frozen peas'],
    components: [F],
    costLevel: 'low',
    prepTimeMinutes: 4,
    cookingSteps: 1,
    requiredEquipment: ['pot'],
    state: 'processed',
    substitutes: ['spinach', 'cucumber', 'tomato'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'tomato',
    aliases: ['tomatoes', 'cherry tomatoes'],
    components: [F],
    costLevel: 'low',
    prepTimeMinutes: 2,
    cookingSteps: 0,
    requiredEquipment: ['knife'],
    state: 'raw',
    substitutes: ['cucumber', 'bell pepper'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'cucumber',
    aliases: ['cucumbers'],
    components: [F],
    costLevel: 'low',
    prepTimeMinutes: 2,
    cookingSteps: 0,
    requiredEquipment: ['knife'],
    state: 'raw',
    substitutes: ['tomato', 'carrot'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'carrot',
    aliases: ['carrots', 'gajar'],
    components: [F],
    costLevel: 'low',
    prepTimeMinutes: 3,
    cookingSteps: 0,
    requiredEquipment: ['knife'],
    state: 'raw',
    substitutes: ['cucumber', 'bell pepper'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'bell pepper',
    aliases: ['capsicum', 'sweet pepper'],
    components: [F],
    costLevel: 'low',
    prepTimeMinutes: 3,
    cookingSteps: 0,
    requiredEquipment: ['knife'],
    state: 'raw',
    substitutes: ['tomato', 'carrot'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'broccoli',
    aliases: [],
    components: [F],
    costLevel: 'low',
    prepTimeMinutes: 5,
    cookingSteps: 2,
    requiredEquipment: ['pot'],
    state: 'raw',
    substitutes: ['frozen mixed vegetables', 'spinach'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'apple',
    aliases: ['apples', 'seb'],
    components: [F],
    costLevel: 'low',
    prepTimeMinutes: 1,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'raw',
    substitutes: ['banana', 'pear', 'berries'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'banana',
    aliases: ['bananas', 'kela'],
    components: [F, C],
    costLevel: 'low',
    prepTimeMinutes: 0,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'raw',
    substitutes: ['apple', 'berries'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'berries',
    aliases: ['strawberries', 'blueberries', 'strawberry', 'blueberry'],
    components: [F],
    costLevel: 'medium',
    prepTimeMinutes: 1,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'raw',
    substitutes: ['apple', 'banana'],
    allergens: [],
    excludesDiets: [],
  },

  // --- Healthy fats -------------------------------------------------------
  {
    name: 'avocado',
    aliases: ['avocados'],
    components: [FAT, F],
    costLevel: 'medium',
    prepTimeMinutes: 2,
    cookingSteps: 0,
    requiredEquipment: ['knife'],
    state: 'raw',
    substitutes: ['olive oil', 'peanut butter', 'nuts and seeds'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'olive oil',
    aliases: ['oil', 'extra virgin olive oil'],
    components: [FAT],
    costLevel: 'low',
    prepTimeMinutes: 0,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['avocado', 'nuts and seeds'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'nuts and seeds',
    aliases: ['almonds', 'walnuts', 'cashews', 'pumpkin seeds', 'sunflower seeds', 'mixed nuts'],
    components: [FAT, P],
    costLevel: 'medium',
    prepTimeMinutes: 0,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'raw',
    substitutes: ['seeds mix', 'peanut butter'],
    allergens: ['tree_nuts'],
    excludesDiets: [],
  },
  {
    name: 'almond butter',
    aliases: [],
    components: [FAT, P],
    costLevel: 'medium',
    prepTimeMinutes: 1,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['peanut butter', 'sunflower seed butter'],
    allergens: ['tree_nuts'],
    excludesDiets: [],
  },
  {
    name: 'sunflower seed butter',
    aliases: ['seed butter'],
    components: [FAT, P],
    costLevel: 'medium',
    prepTimeMinutes: 1,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['peanut butter', 'tahini'],
    allergens: [],
    excludesDiets: [],
  },

  // --- Carbs / bases ------------------------------------------------------
  {
    name: 'instant noodles',
    aliases: ['ramen', 'maggi', 'cup noodles', 'instant ramen'],
    components: [C],
    costLevel: 'low',
    prepTimeMinutes: 5,
    cookingSteps: 2,
    requiredEquipment: ['pot'],
    state: 'processed',
    substitutes: [],
    allergens: ['gluten'],
    excludesDiets: [],
  },
  {
    name: 'bread',
    aliases: ['toast', 'slice of bread', 'sandwich bread', 'roti', 'tortilla'],
    components: [C],
    costLevel: 'low',
    prepTimeMinutes: 2,
    cookingSteps: 1,
    requiredEquipment: ['toaster'],
    state: 'processed',
    substitutes: [],
    allergens: ['gluten'],
    excludesDiets: [],
  },
  {
    name: 'rice',
    aliases: ['white rice', 'leftover rice', 'steamed rice', 'brown rice'],
    components: [C],
    costLevel: 'low',
    prepTimeMinutes: 2,
    cookingSteps: 1,
    requiredEquipment: ['pot'],
    state: 'cooked',
    substitutes: [],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'pasta',
    aliases: ['spaghetti', 'macaroni', 'penne', 'noodles'],
    components: [C],
    costLevel: 'low',
    prepTimeMinutes: 10,
    cookingSteps: 3,
    requiredEquipment: ['pot'],
    state: 'processed',
    substitutes: [],
    allergens: ['gluten'],
    excludesDiets: [],
  },
  {
    name: 'potato',
    aliases: ['potatoes', 'aloo'],
    components: [C],
    costLevel: 'low',
    prepTimeMinutes: 8,
    cookingSteps: 3,
    requiredEquipment: ['pot'],
    state: 'raw',
    substitutes: ['rice', 'bread'],
    allergens: [],
    excludesDiets: [],
  },

  // --- Flavor enhancers (cuisine patterns) --------------------------------
  {
    name: 'cheese',
    aliases: ['cheddar', 'mozzarella', 'shredded cheese'],
    components: [P, FAT],
    costLevel: 'low',
    prepTimeMinutes: 1,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['nutritional yeast', 'cottage cheese'],
    allergens: ['dairy'],
    excludesDiets: ['vegan'],
  },
  {
    name: 'salsa',
    aliases: ['pico de gallo'],
    components: [F],
    costLevel: 'low',
    prepTimeMinutes: 0,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['hot sauce', 'tomato'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'hot sauce',
    aliases: ['sriracha', 'chili sauce', 'chili flakes'],
    components: [],
    costLevel: 'low',
    prepTimeMinutes: 0,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['salsa'],
    allergens: [],
    excludesDiets: [],
  },
  {
    name: 'soy sauce',
    aliases: ['shoyu', 'tamari'],
    components: [],
    costLevel: 'low',
    prepTimeMinutes: 0,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['tamari', 'coconut aminos'],
    allergens: ['soy'],
    excludesDiets: [],
  },
  {
    name: 'hummus',
    aliases: ['houmous'],
    components: [P, FAT, F],
    costLevel: 'low',
    prepTimeMinutes: 0,
    cookingSteps: 0,
    requiredEquipment: [],
    state: 'processed',
    substitutes: ['greek yogurt', 'peanut butter'],
    allergens: [],
    excludesDiets: [],
  },
];

/** Cuisine-specific enhancement patterns (candidate generator strategy 2). */
export interface CuisinePattern {
  cuisine: string;
  keywords: string[];
  additions: string[];
  nutritionalImpact: Record<string, 'added' | 'increased'>;
}

export const CUISINE_PATTERNS: CuisinePattern[] = [
  {
    cuisine: 'asian',
    keywords: ['noodles', 'ramen', 'rice', 'stir-fry', 'curry', 'soy'],
    additions: ['edamame', 'spinach'],
    nutritionalImpact: { protein: 'added', fiber_sources: 'added' },
  },
  {
    cuisine: 'mexican',
    keywords: ['taco', 'burrito', 'quesadilla', 'salsa', 'tortilla'],
    additions: ['canned black beans', 'salsa'],
    nutritionalImpact: { protein: 'added', fiber_sources: 'added' },
  },
  {
    cuisine: 'mediterranean',
    keywords: ['falafel', 'hummus', 'pita', 'kebab', 'olive'],
    additions: ['hummus', 'cucumber'],
    nutritionalImpact: { protein: 'added', healthy_fat_sources: 'added' },
  },
  {
    cuisine: 'american',
    keywords: ['burger', 'sandwich', 'toast', 'fries', 'cheese'],
    additions: ['egg', 'tomato'],
    nutritionalImpact: { protein: 'added', fiber_sources: 'added' },
  },
  {
    cuisine: 'indian',
    keywords: ['dal', 'curry', 'roti', 'paratha', 'khichdi', 'poha'],
    additions: ['greek yogurt', 'cucumber'],
    nutritionalImpact: { protein: 'added', fiber_sources: 'added' },
  },
];

const byName = new Map<string, IngredientRecord>();
for (const record of INGREDIENTS) {
  byName.set(record.name, record);
  for (const alias of record.aliases) {
    byName.set(alias, record);
  }
}

/** Exact or alias lookup (case-insensitive). */
export function findIngredient(name: string): IngredientRecord | null {
  return byName.get(name.trim().toLowerCase()) ?? null;
}

/**
 * Best-effort match: exact/alias first, then substring containment.
 * Returns null when nothing plausible matches - callers decide fallback.
 */
export function findBestMatch(name: string): IngredientRecord | null {
  const needle = name.trim().toLowerCase();
  const exact = findIngredient(needle);
  if (exact) return exact;

  let best: IngredientRecord | null = null;
  let bestLength = 0;
  for (const record of INGREDIENTS) {
    const candidates = [record.name, ...record.aliases];
    for (const candidate of candidates) {
      if (
        (needle.includes(candidate) || candidate.includes(needle)) &&
        candidate.length > bestLength
      ) {
        best = record;
        bestLength = candidate.length;
      }
    }
  }
  return best;
}

/** Ingredients providing a given component, sorted cheapest/fastest first. */
export function findByComponent(component: ComponentKey): IngredientRecord[] {
  return INGREDIENTS.filter((r) => r.components.includes(component)).sort(
    (a, b) =>
      a.prepTimeMinutes - b.prepTimeMinutes || costRank(a.costLevel) - costRank(b.costLevel),
  );
}

function costRank(level: BudgetLevel): number {
  return level === 'low' ? 0 : level === 'medium' ? 1 : 2;
}
