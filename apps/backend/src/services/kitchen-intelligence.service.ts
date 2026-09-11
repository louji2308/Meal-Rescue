import type {
  PantryItem,
  UUID,
} from '@meal-rescue/shared-types';

import { env } from '../config/env';
import type { PantryService } from './pantry.service';

// Food lifecycle states based on time-based rules
export type FoodState = 'fresh' | 'opened' | 'leftover' | 'use_soon' | 'gone';

export interface KitchenItem extends PantryItem {
  state: FoodState;
  stateReason: string;
  daysActive: number;
  usesSinceAdded: number;
}

export interface KitchenSignal {
  id: string;
  type: 'use_first' | 'almost_a_meal' | 'expiring_soon' | 'low_stock' | 'unused_long';
  title: string;
  description: string;
  items: string[];
  priority: 'urgent' | 'high' | 'medium' | 'low';
  actionLabel?: string;
  actionPayload?: string;
}

export interface KitchenOpportunity {
  id: string;
  name: string;
  description: string;
  ingredients: string[];
  effort: 'low' | 'medium' | 'high';
  estimatedMinutes: number;
  whyGood: string;
}

export interface WhatCanIMakeResponse {
  ideas: Array<{
    name: string;
    ingredients: string[];
    missingEssentials: string[];
    effort: 'low' | 'medium' | 'high';
    estimatedMinutes: number;
    description: string;
  }>;
}

export interface KitchenDashboard {
  items: KitchenItem[];
  signals: KitchenSignal[];
  opportunities: KitchenOpportunity[];
  stats: {
    totalItems: number;
    expiringCount: number;
    useSoonCount: number;
    freshCount: number;
    leftoverCount: number;
  };
}

export interface FoodIdentification {
  name: string;
  confidence: number;
  estimatedExpiryDays?: number;
  category: string;
  state: 'raw' | 'cooked' | 'leftover' | 'packaged';
}

export interface IdentifyResponse {
  foods: FoodIdentification[];
  summary: string;
}

/**
 * Kitchen Intelligence Service — the brain of the Kitchen tab.
 *
 * Uses OpenRouter (DeepSeek V4 Flash) for reasoning and a free vision model
 * for food identification from camera.
 */
export class KitchenIntelligenceService {
  private readonly pantryService: PantryService;

  constructor(pantryService: PantryService) {
    this.pantryService = pantryService;
  }

  /**
   * Get full kitchen dashboard state with signals and opportunities.
   */
  async getDashboard(userId: UUID): Promise<KitchenDashboard> {
    const pantry = await this.pantryService.getPantry(userId);
    const items = pantry.ingredients.map((item) => this.toKitchenItem(item));
    const signals = this.generateSignals(items);
    const opportunities = this.generateOpportunities(items);
    const stats = this.computeStats(items);

    return { items, signals, opportunities, stats };
  }

  /**
   * Identify food from an image using OpenRouter free vision model.
   */
  async identifyFood(
    imageBase64: string,
    mimeType: string,
  ): Promise<IdentifyResponse> {
    if (!env.OPENROUTER_API_KEY) {
      return this.identifyFoodFallback();
    }

    try {
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemma-3-27b-it:free',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Analyze this food image and identify every food item visible. For each item return:
- name (string): common English name
- confidence (number 0-1): how confident you are
- estimatedExpiryDays (number): estimated days until this goes bad if stored properly
- category (string): "produce", "dairy", "protein", "grain", "condiment", "leftover", "snack", "beverage", "other"
- state (string): "raw", "cooked", "leftover", or "packaged"

Return JSON: { "foods": [...], "summary": "Brief description of what you see" }
Return ONLY valid JSON, no markdown fences.`,
                  },
                  {
                    type: 'image_url',
                    image_url: { url: `data:${mimeType};base64,${imageBase64}` },
                  },
                ],
              },
            ],
            max_tokens: 500,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      const parsed = JSON.parse(content) as IdentifyResponse;
      return parsed;
    } catch {
      return this.identifyFoodFallback();
    }
  }

  /**
   * "What can I make?" — kitchen intelligence using DeepSeek V4 Flash.
   */
  async whatCanIMake(
    userId: UUID,
    preferences?: { cuisine?: string; timeAvailable?: number },
  ): Promise<WhatCanIMakeResponse> {
    const pantry = await this.pantryService.getPantry(userId);
    const itemNames = pantry.ingredients.map((i) => i.ingredientName);

    if (itemNames.length === 0) {
      return { ideas: [] };
    }

    if (!env.OPENROUTER_API_KEY) {
      return this.whatCanIMakeFallback(itemNames);
    }

    try {
      const prompt = `You are a creative home cook. Based on these ingredients I have at home:
${itemNames.join(', ')}

${preferences?.cuisine ? `I'm in the mood for ${preferences.cuisine} food. ` : ''}
${preferences?.timeAvailable ? `I have about ${preferences.timeAvailable} minutes to cook. ` : ''}

Give me 3 meal ideas I can make RIGHT NOW with what I have. For each idea:
- name: creative but clear dish name
- ingredients: which of my ingredients it uses
- missingEssentials: common pantry staples I might need (salt, oil, etc - NOT major ingredients)
- effort: "low", "medium", or "high"
- estimatedMinutes: how long it takes
- description: one sentence description

Return JSON: { "ideas": [...] }
Return ONLY valid JSON, no markdown fences.`;

      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat-v3-0324:free',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1000,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      const parsed = JSON.parse(content) as WhatCanIMakeResponse;
      return parsed;
    } catch {
      return this.whatCanIMakeFallback(itemNames);
    }
  }

  // --- Private helpers ---

  private toKitchenItem(item: PantryItem): KitchenItem {
    const now = new Date();
    const addedAt = new Date(item.addedAt);
    const daysActive = Math.floor(
      (now.getTime() - addedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    let state: FoodState = 'fresh';
    let stateReason = 'Recently added';

    if (item.kind === 'leftover') {
      state = 'leftover';
      const origin = item.madeAt ? new Date(item.madeAt) : addedAt;
      const daysSinceMade = Math.floor(
        (now.getTime() - origin.getTime()) / (1000 * 60 * 60 * 24),
      );
      stateReason =
        daysSinceMade <= 0
          ? 'Made today'
          : `Made ${daysSinceMade} day${daysSinceMade === 1 ? '' : 's'} ago`;
    } else if (item.isExpiringSoon) {
      state = 'use_soon';
      stateReason = `Expires in ${item.daysUntilExpiry} day${item.daysUntilExpiry === 1 ? '' : 's'}`;
    } else if (daysActive > 5) {
      state = 'leftover';
      stateReason = `Added ${daysActive} days ago`;
    } else if (daysActive > 2) {
      state = 'opened';
      stateReason = `Added ${daysActive} days ago`;
    }

    return {
      ...item,
      state,
      stateReason,
      daysActive,
      usesSinceAdded: 0,
    };
  }

  private generateSignals(items: KitchenItem[]): KitchenSignal[] {
    const signals: KitchenSignal[] = [];

    // Use First signals — expiring items
    const useFirst = items.filter((i) => i.state === 'use_soon');
    if (useFirst.length > 0) {
      signals.push({
        id: 'use-first',
        type: 'use_first',
        title: 'Use these first',
        description: `${useFirst.length} item${useFirst.length > 1 ? 's' : ''} expiring soon`,
        items: useFirst.map((i) => i.ingredientName),
        priority: 'urgent',
      });
    }

    // Almost a Meal signals — items that could combine
    const proteins = items.filter(
      (i) =>
        i.state !== 'gone' &&
        ['chicken', 'beef', 'pork', 'tofu', 'eggs', 'salmon', 'tuna', 'shrimp', 'beans', 'lentils'].some(
          (p) => i.ingredientName.toLowerCase().includes(p),
        ),
    );
    const carbs = items.filter(
      (i) =>
        i.state !== 'gone' &&
        ['rice', 'pasta', 'noodles', 'bread', 'tortillas', 'quinoa', 'potatoes'].some(
          (c) => i.ingredientName.toLowerCase().includes(c),
        ),
    );
    const vegs = items.filter(
      (i) =>
        i.state !== 'gone' &&
        ['broccoli', 'spinach', 'carrots', 'peppers', 'onions', 'tomatoes', 'salad', 'lettuce'].some(
          (v) => i.ingredientName.toLowerCase().includes(v),
        ),
    );

    if (proteins.length > 0 && carbs.length > 0) {
      signals.push({
        id: 'almost-meal',
        type: 'almost_a_meal',
        title: 'Almost a meal',
        description: 'You have protein + carbs — just need a sauce or veggie',
        items: [
          proteins[0]!.ingredientName,
          carbs[0]!.ingredientName,
          ...(vegs.length > 0 ? [vegs[0]!.ingredientName] : []),
        ],
        priority: 'high',
        actionLabel: 'See ideas',
        actionPayload: 'what-can-i-make',
      });
    }

    // Unused for too long
    const unused = items.filter(
      (i) => i.state !== 'gone' && i.daysActive > 7,
    );
    if (unused.length > 0) {
      signals.push({
        id: 'unused-long',
        type: 'unused_long',
        title: 'Forgotten items',
        description: `${unused.length} item${unused.length > 1 ? 's' : ''} haven't been used in a while`,
        items: unused.map((i) => i.ingredientName),
        priority: 'low',
      });
    }

    return signals;
  }

  private generateOpportunities(items: KitchenItem[]): KitchenOpportunity[] {
    const active = items.filter((i) => i.state !== 'gone');
    const opportunities: KitchenOpportunity[] = [];

    // Leftover transformation opportunity
    const leftovers = items.filter((i) => i.state === 'leftover');
    if (leftovers.length >= 2) {
      opportunities.push({
        id: 'transform-leftovers',
        name: 'Leftover makeover',
        description: 'Turn leftover ingredients into a fresh meal',
        ingredients: leftovers.map((i) => i.ingredientName),
        effort: 'low',
        estimatedMinutes: 10,
        whyGood: `${leftovers.length} leftovers about to go to waste`,
      });
    }

    // Bowl/salad opportunity
    const hasGreens = active.some((i) =>
      ['salad', 'lettuce', 'spinach', 'kale', 'arugula'].some((g) =>
        i.ingredientName.toLowerCase().includes(g),
      ),
    );
    if (hasGreens && active.length >= 3) {
      opportunities.push({
        id: 'kitchen-sink-salad',
        name: 'Kitchen sink salad',
        description: 'Throw everything into a big bowl with dressing',
        ingredients: active.slice(0, 5).map((i) => i.ingredientName),
        effort: 'low',
        estimatedMinutes: 5,
        whyGood: 'Use up greens before they wilt',
      });
    }

    // Quick stir-fry opportunity
    const proteins = active.filter((i) =>
      ['chicken', 'beef', 'pork', 'tofu', 'eggs', 'salmon', 'tuna', 'shrimp', 'beans', 'lentils'].some(
        (p) => i.ingredientName.toLowerCase().includes(p),
      ),
    );
    const vegs = active.filter((i) =>
      ['broccoli', 'spinach', 'carrots', 'peppers', 'onions', 'tomatoes', 'salad', 'lettuce'].some(
        (v) => i.ingredientName.toLowerCase().includes(v),
      ),
    );
    const hasSoyOrSauce = active.some((i) =>
      ['soy sauce', 'teriyaki', 'oyster sauce', 'hot sauce'].some((s) =>
        i.ingredientName.toLowerCase().includes(s),
      ),
    );
    if (proteins.length > 0 && vegs.length > 0 && hasSoyOrSauce) {
      opportunities.push({
        id: 'quick-stir-fry',
        name: 'Quick stir-fry',
        description: 'Protein + veggies + sauce = dinner in minutes',
        ingredients: [proteins[0]!.ingredientName, vegs[0]!.ingredientName],
        effort: 'medium',
        estimatedMinutes: 15,
        whyGood: 'Everything you need is already here',
      });
    }

    return opportunities;
  }

  private computeStats(items: KitchenItem[]) {
    return {
      totalItems: items.length,
      expiringCount: items.filter((i) => i.state === 'use_soon').length,
      useSoonCount: items.filter((i) => i.state === 'use_soon').length,
      freshCount: items.filter((i) => i.state === 'fresh').length,
      leftoverCount: items.filter((i) => i.kind === 'leftover').length,
    };
  }

  private identifyFoodFallback(): IdentifyResponse {
    return {
      foods: [
        {
          name: 'food item',
          confidence: 0.3,
          category: 'other',
          state: 'raw',
        },
      ],
      summary: 'Could not identify food. Try a clearer photo or describe it manually.',
    };
  }

  private whatCanIMakeFallback(itemNames: string[]): WhatCanIMakeResponse {
    return {
      ideas: [
        {
          name: 'Simple stir-fry',
          ingredients: itemNames.slice(0, 3),
          missingEssentials: ['oil', 'soy sauce'],
          effort: 'low',
          estimatedMinutes: 15,
          description: 'Heat oil, cook everything together, season to taste',
        },
        {
          name: 'Quick bowl',
          ingredients: itemNames.slice(0, 2),
          missingEssentials: ['salt', 'pepper'],
          effort: 'low',
          estimatedMinutes: 10,
          description: 'Layer ingredients in a bowl, add any sauce you have',
        },
      ],
    };
  }
}
