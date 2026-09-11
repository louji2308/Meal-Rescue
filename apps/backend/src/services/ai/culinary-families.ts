import type { CulinaryFamily } from '@meal-rescue/shared-types';

export interface CulinaryFamilyDef {
  family: CulinaryFamily;
  label: string;
  /** Ingredients this family treats as "native" (used for ambiguous matching). */
  signatureIngredients: string[];
  /** Generic words that this family commonly cooks (rice, bread, soup...). */
  ambiguousKeywords: string[];
  /** Strong, cuisine-exclusive words - if present, intent is UNMISTAKABLE. */
  explicitMarkers: string[];
  /** Modern/fusion additions the family recognizes. */
  modernTwists: string[];
  /** Authentic/pure additions the family recognizes. */
  traditionalAnchor: string[];
}

export const CULINARY_FAMILIES: CulinaryFamilyDef[] = [
  {
    family: 'indian',
    label: 'Indian',
    signatureIngredients: ['rice', 'dal', 'chickpea', 'curry'],
    ambiguousKeywords: ['rice', 'bread', 'curry', 'soup', 'vegetable'],
    explicitMarkers: [
      'tandoori',
      'naan',
      'roti',
      'paratha',
      'dal',
      'biryani',
      'khichdi',
      'poha',
      'samosa',
    ],
    modernTwists: ['saag paneer pizza', 'butter chicken tacos', 'tandoori quesadilla'],
    traditionalAnchor: ['ghee', 'cumin', 'turmeric', 'dal', 'garam masala'],
  },
  {
    family: 'east_asian',
    label: 'East Asian',
    signatureIngredients: ['rice', 'noodle', 'tofu', 'soy'],
    ambiguousKeywords: ['rice', 'noodle', 'stir-fry', 'soup'],
    explicitMarkers: [
      'chow mein',
      'ramen',
      'sushi',
      'dim sum',
      'pad thai',
      'pho',
      'wonton',
      'teriyaki',
    ],
    modernTwists: ['kimchi fried rice', 'bao buns', 'poke bowl'],
    traditionalAnchor: ['edamame', 'spinach', 'tofu', 'seaweed', 'sesame'],
  },
  {
    family: 'mediterranean',
    label: 'Mediterranean',
    signatureIngredients: ['olive', 'hummus', 'cucumber', 'tomato'],
    ambiguousKeywords: ['salad', 'pita', 'vegetable', 'grilled'],
    explicitMarkers: ['hummus', 'falafel', 'gyro', 'souvlaki', 'tabbouleh', 'tahini'],
    modernTwists: ['hummus toast', 'falafel bowl', 'zilla salad'],
    traditionalAnchor: ['cucumber', 'tomato', 'olive oil', 'hummus', 'feta'],
  },
  {
    family: 'mexican',
    label: 'Mexican',
    signatureIngredients: ['tortilla', 'salsa', 'beans', 'avocado'],
    ambiguousKeywords: ['taco', 'burrito', 'soup', 'rice'],
    explicitMarkers: ['taco', 'burrito', 'quesadilla', 'enchilada', 'tamale', 'elote', 'pozole'],
    modernTwists: ['taco bowl', 'burrito bowl', 'street corn salad'],
    traditionalAnchor: ['canned black beans', 'salsa', 'avocado', 'corn'],
  },
  {
    family: 'american',
    label: 'American',
    signatureIngredients: ['toast', 'cheese', 'burger', 'fries'],
    ambiguousKeywords: ['sandwich', 'burger', 'toast', 'grilled'],
    explicitMarkers: ['burger patty', 'mac and cheese', 'grilled cheese', 'barbecue'],
    modernTwists: ['loaded fries', 'breakfast bowl', 'chicken and waffles'],
    traditionalAnchor: ['egg', 'tomato', 'cheese', 'bacon'],
  },
  {
    family: 'middle_eastern',
    label: 'Middle Eastern',
    signatureIngredients: ['chickpea', 'olive', 'pita', 'rice'],
    ambiguousKeywords: ['rice', 'bread', 'grilled', 'salad'],
    explicitMarkers: ['shawarma', 'kebab', 'fattoush', 'tabbouleh', 'hummus', 'mujadara'],
    modernTwists: ['shawarma bowl', 'pita sandwich', 'falafel crunch wrap'],
    traditionalAnchor: ['chickpea', 'olive', 'cumin', 'yogurt', 'cucumber'],
  },
  {
    family: 'italian',
    label: 'Italian',
    signatureIngredients: ['bread', 'cheese', 'tomato', 'pasta'],
    ambiguousKeywords: ['pasta', 'bread', 'salad', 'soup'],
    explicitMarkers: ['pizza', 'spaghetti', 'risotto', 'lasagna', 'carbonara', 'ciabatta'],
    modernTwists: ['pizza bowl', 'pesto pasta', 'caprese salad'],
    traditionalAnchor: ['tomato', 'basil', 'parmesan', 'olive oil'],
  },
  {
    family: 'african',
    label: 'African',
    signatureIngredients: ['rice', 'okra', 'tomato'],
    ambiguousKeywords: ['rice', 'stew', 'soup'],
    explicitMarkers: ['jollof', 'injera', 'tagine', 'fufu', 'suya', 'egusi'],
    modernTwists: ['jollof bowl', 'piri piri wrap'],
    traditionalAnchor: ['rice', 'palm oil', 'peanut', 'plantain'],
  },
  {
    family: 'caribbean',
    label: 'Caribbean',
    signatureIngredients: ['rice', 'plantain', 'beans'],
    ambiguousKeywords: ['rice', 'peas', 'stew'],
    explicitMarkers: ['jerk', 'roti', 'sofrito', 'callaloo', 'ackee'],
    modernTwists: ['jerk bowl', 'plantain tacos', 'roti rolls'],
    traditionalAnchor: ['plantain', 'coconut', 'scotch bonnet', 'rice'],
  },
  {
    family: 'thai',
    label: 'Thai',
    signatureIngredients: ['rice', 'noodle', 'coconut', 'curry'],
    ambiguousKeywords: ['curry', 'rice', 'noodle', 'soup'],
    explicitMarkers: ['pad thai', 'green curry', 'red curry', 'som tum', 'pad see ew', 'larb'],
    modernTwists: ['thai peanut bowl', 'coconut curry ramen'],
    traditionalAnchor: ['coconut milk', 'lemongrass', 'basil', 'rice'],
  },
  {
    family: 'none',
    label: 'General',
    signatureIngredients: [],
    ambiguousKeywords: [],
    explicitMarkers: [],
    modernTwists: [],
    traditionalAnchor: [],
  },
];

const familyByFamily = new Map(CULINARY_FAMILIES.map((f) => [f.family, f]));

/** Only EXPLICIT, cuisine-exclusive words. Returns 'none' when the meal is generic. */
export function detectCuisineIntent(foodNames: string[]): CulinaryFamily | 'none' {
  const names = foodNames.map((n) => n.toLowerCase()).join(' ');
  let best: CulinaryFamily | 'none' = 'none';
  let bestLen = 0;
  for (const def of CULINARY_FAMILIES) {
    for (const marker of def.explicitMarkers) {
      if (names.includes(marker) && marker.length > bestLen) {
        best = def.family;
        bestLen = marker.length;
      }
    }
  }
  return best;
}

/** For ambiguous meals: pick the family among plausible ones weighted by user affinities. */
export function matchAmbiguousFamily(
  foodNames: string[],
  affinities: Map<CulinaryFamily, number>,
): CulinaryFamily | 'none' {
  const names = foodNames.map((n) => n.toLowerCase()).join(' ');
  const plausible = new Set<CulinaryFamily>();
  for (const def of CULINARY_FAMILIES) {
    const hitSignature = def.signatureIngredients.some((s) => names.includes(s));
    const hitAmbiguous = def.ambiguousKeywords.some((k) => names.includes(k));
    if (hitSignature || hitAmbiguous) plausible.add(def.family);
  }
  if (plausible.size === 0) return 'none';
  let best: CulinaryFamily = 'none';
  let bestScore = -Infinity;
  for (const fam of plausible) {
    const score = affinities.get(fam) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = fam;
    }
  }
  return best;
}

export function getCulinaryFamily(family: CulinaryFamily): CulinaryFamilyDef {
  return familyByFamily.get(family) ?? familyByFamily.get('none')!;
}
