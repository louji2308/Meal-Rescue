import { randomUUID } from 'node:crypto';

import type { UUID } from '@meal-rescue/shared-types';
import { z } from 'zod';

import { env } from '../config/env';
import type { Db } from '../database/models';
import type { LlmClient } from './ai/llm-client';
import type { KitchenVisionContext } from './ai/prompts';
import { VisionService } from './ai/vision.service';
import { PantryService, canonicalizeIngredientName } from './pantry.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CaptureSource = 'CAMERA' | 'PHOTO' | 'MANUAL';
export type ItemType = 'INGREDIENT' | 'PREPARED_MEAL' | 'LEFTOVER' | 'PACKAGED_FOOD';
export type ItemState = 'RAW' | 'COOKED' | 'READY_TO_EAT' | 'UNKNOWN';
export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CapturedItem {
  id: string;
  displayName: string;
  itemType: ItemType;
  state: ItemState;
  quantity: number | null;
  unit: string | null;
  /** Approx. people this prepared meal / leftover feeds. Null otherwise. */
  servings: number | null;
  confidence: number;
  confidenceTier: ConfidenceTier;
  source: CaptureSource;
  estimatedExpiryDays: number | null;
  duplicateOf?: {
    id: string;
    currentQuantity: number | null;
    currentUnit: string | null;
  };
  clarification?: {
    question: string;
    options: string[];
  };
}

export interface CaptureResult {
  items: CapturedItem[];
  summary: {
    total: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    duplicates: number;
  };
  imageBase64?: string;
}

export interface CaptureConfirmRequest {
  items: Array<{
    id: string;
    accepted: boolean;
    displayName?: string;
    itemType?: ItemType;
    state?: ItemState;
    quantity?: number | null;
    unit?: string | null;
    servings?: number | null;
    estimatedExpiryDays?: number | null;
    duplicateAction?: 'UPDATE' | 'ADD_MORE' | 'SKIP';
  }>;
}

export interface CaptureConfirmResult {
  added: number;
  updated: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Expiry inference lookup — maps ingredient names to estimated shelf life
// ---------------------------------------------------------------------------

const EXPIRY_DAYS: Record<string, number> = {
  // Dairy
  milk: 7, 'whole milk': 7, '2% milk': 7, yogurt: 14, 'greek yogurt': 14,
  cheese: 21, cheddar: 21, mozzarella: 14, butter: 30, cream: 7,
  'sour cream': 14, 'cream cheese': 14,

  // Eggs
  egg: 28, eggs: 28,

  // Meat
  'chicken breast': 2, chicken: 2, 'ground beef': 2, beef: 3, pork: 3,
  fish: 2, salmon: 2, shrimp: 2, turkey: 3, bacon: 7, sausage: 7,
  'deli meat': 5, ham: 7,

  // Produce — vegetables
  tomato: 5, tomatoes: 5, onion: 21, onions: 21, garlic: 30, potato: 21,
  potatoes: 21, carrot: 21, carrots: 21, cucumber: 7, lettuce: 5,
  spinach: 3, broccoli: 5, 'bell pepper': 7, 'green beans': 5, corn: 3,
  celery: 14, mushroom: 5, mushrooms: 5, zucchini: 5, avocado: 3,

  // Produce — fruits
  apple: 14, apples: 14, banana: 5, bananas: 5, orange: 14, oranges: 14,
  lemon: 21, limes: 21, strawberry: 3, strawberries: 3, blueberry: 5,
  grapes: 7, mango: 5, peach: 3,

  // Grains / pantry
  bread: 5, 'sliced bread': 5, rice: 365, 'white rice': 365, 'brown rice': 180,
  pasta: 365, spaghetti: 365, flour: 180, sugar: 365, oats: 180,
  cereal: 90, 'tortilla': 14, tortillas: 14,

  // Condiments
  'soy sauce': 365, ketchup: 90, mustard: 90, mayo: 60, 'olive oil': 365,
  vinegar: 365, 'hot sauce': 365, sriracha: 365,

  // Leftovers (default short shelf life)
  leftover: 3, biryani: 3, curry: 3, 'stir fry': 3, soup: 4, stew: 3,
  'fried rice': 3, 'pasta dish': 3,
};

// ---------------------------------------------------------------------------
// Default units / quantities per item type
// ---------------------------------------------------------------------------

const DEFAULT_UNITS: Record<string, { unit: string; quantity: number }> = {
  egg: { unit: 'pcs', quantity: 6 },
  eggs: { unit: 'pcs', quantity: 6 },
  milk: { unit: 'L', quantity: 1 },
  'whole milk': { unit: 'L', quantity: 1 },
  yogurt: { unit: 'g', quantity: 500 },
  cheese: { unit: 'g', quantity: 200 },
  butter: { unit: 'g', quantity: 250 },
  tomato: { unit: 'pcs', quantity: 3 },
  tomatoes: { unit: 'pcs', quantity: 3 },
  onion: { unit: 'pcs', quantity: 2 },
  onions: { unit: 'pcs', quantity: 2 },
  garlic: { unit: 'pcs', quantity: 1 },
  potato: { unit: 'pcs', quantity: 4 },
  potatoes: { unit: 'pcs', quantity: 4 },
  carrot: { unit: 'pcs', quantity: 3 },
  carrots: { unit: 'pcs', quantity: 3 },
  rice: { unit: 'g', quantity: 500 },
  pasta: { unit: 'g', quantity: 500 },
  bread: { unit: 'pcs', quantity: 1 },
  apple: { unit: 'pcs', quantity: 3 },
  banana: { unit: 'pcs', quantity: 4 },
  chicken: { unit: 'g', quantity: 500 },
  'chicken breast': { unit: 'g', quantity: 500 },
  beef: { unit: 'g', quantity: 500 },
  fish: { unit: 'g', quantity: 300 },
  oil: { unit: 'ml', quantity: 500 },
  'olive oil': { unit: 'ml', quantity: 500 },
  water: { unit: 'L', quantity: 1 },
  cucumber: { unit: 'pcs', quantity: 2 },
  lettuce: { unit: 'pcs', quantity: 1 },
  mushroom: { unit: 'g', quantity: 250 },
  mushrooms: { unit: 'g', quantity: 250 },
  lemon: { unit: 'pcs', quantity: 2 },
  lime: { unit: 'pcs', quantity: 2 },
  ginger: { unit: 'g', quantity: 50 },
};

// ---------------------------------------------------------------------------
// Zod schema for LLM response
// ---------------------------------------------------------------------------

const capturedItemSchema = z.object({
  name: z.string().min(1).max(120),
  confidence: z.number().min(0).max(1),
  state: z.enum(['raw', 'cooked', 'processed', 'mixed']),
  estimatedQuantity: z.number().nullable().optional(),
  unit: z.string().max(30).nullable().optional(),
  itemType: z.enum(['INGREDIENT', 'PREPARED_MEAL', 'LEFTOVER', 'PACKAGED_FOOD']),
});

const captureResponseSchema = z.object({
  items: z.array(capturedItemSchema).max(30),
});

// ---------------------------------------------------------------------------
// AI prompt for text parsing (DeepSeek via OpenRouter)
// ---------------------------------------------------------------------------

const CAPTURE_TEXT_PROMPT = `You are a kitchen text parser. Convert this natural-language description of food items into structured data.

Input examples:
- "4 eggs, some leftover rice and half an onion"
- "2 eggs + cucumber + leftover biryani"
- "I have some cooked rice, tomato and yogurt"
- "bought milk, bread, and chicken breast"
- "leftover chicken curry from lunch"

For each item, provide:
- name: canonical food name (lowercase, singular preferred: "egg" not "eggs")
- confidence: 0.0-1.0
- state: "raw", "cooked", "processed", "mixed"
- estimatedQuantity: number if specified (handle "some" → null, "half" → 0.5, "a" → 1), null if unknown
- unit: infer sensible unit — "pcs" for countable items (eggs, tomatoes, onion), "g" for meat/cheese/veg by weight, "L" or "ml" for liquids, "g" for rice/pasta/grains. null if unsure
- itemType: "INGREDIENT" for raw foods, "LEFTOVER" for "leftover X" or "cooked X", "PREPARED_MEAL" for named dishes (biryani, curry, pasta), "PACKAGED_FOOD" for store items

RULES:
- Normalize quantities: "some" → null, "half an onion" → 0.5, "a cup of" → estimate in grams
- "leftover X" → itemType: "LEFTOVER", state: "cooked"
- "cooked X" → state: "cooked"
- Be specific: "biryani" stays "biryani", not "rice dish"
- Infer the most likely unit based on how people buy/store the item
- If input is too vague, return empty items array

Respond ONLY with JSON:
{
  "items": [
    {
      "name": "string",
      "confidence": 0.0-1.0,
      "state": "raw|cooked|processed|mixed",
      "estimatedQuantity": number|null,
      "unit": "string|null",
      "itemType": "INGREDIENT|PREPARED_MEAL|LEFTOVER|PACKAGED_FOOD"
    }
  ]
}`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KitchenCaptureService {
  private readonly vision: VisionService;
  private readonly pantry: PantryService;
  private readonly models: Db['models'];

  constructor(
    llm: LlmClient,
    models: Db['models'],
    redis?: import('ioredis').Redis | null,
    visionLlm: LlmClient = llm,
  ) {
    this.vision = new VisionService(visionLlm, redis ?? null);
    this.pantry = new PantryService(models);
    this.models = models;
  }

  async capture(
    userId: UUID,
    input:
      | { source: 'CAMERA' | 'PHOTO'; imageBase64: string; mimeType?: string }
      | { source: 'MANUAL'; text: string },
    options?: {
      cuisines?: string[];
      context?: KitchenVisionContext;
    },
  ): Promise<CaptureResult> {
    let rawItems: Array<{
      name: string;
      confidence: number;
      state: string;
      estimatedQuantity: number | null;
      unit: string | null;
      itemType: string;
      servings: number | null;
    }>;

    if (input.source === 'CAMERA' || input.source === 'PHOTO') {
      rawItems = await this.processImage(input.imageBase64, options);
    } else {
      rawItems = await this.processText((input as { source: 'MANUAL'; text: string }).text);
    }

    const items: CapturedItem[] = [];
    for (const raw of rawItems) {
      items.push(this.normalizeItem(raw, input.source));
    }

    const existingPantry = await this.pantry.getPantry(userId);
    const existingNames = new Set(
      existingPantry.ingredients.map((i) => i.ingredientName.toLowerCase()),
    );

    for (const item of items) {
      const canonical = canonicalizeIngredientName(item.displayName);
      if (existingNames.has(canonical.toLowerCase())) {
        const existing = existingPantry.ingredients.find(
          (i) => i.ingredientName.toLowerCase() === canonical.toLowerCase(),
        );
        if (existing) {
          item.duplicateOf = {
            id: existing.id,
            currentQuantity: existing.quantity,
            currentUnit: existing.unit,
          };
        }
      }
    }

    const summary = {
      total: items.length,
      highConfidence: items.filter((i) => i.confidenceTier === 'HIGH').length,
      mediumConfidence: items.filter((i) => i.confidenceTier === 'MEDIUM').length,
      lowConfidence: items.filter((i) => i.confidenceTier === 'LOW').length,
      duplicates: items.filter((i) => i.duplicateOf).length,
    };

    return { items, summary, imageBase64: input.source !== 'MANUAL' ? input.imageBase64 : undefined };
  }

  async confirm(userId: UUID, request: CaptureConfirmRequest): Promise<CaptureConfirmResult> {
    let added = 0;
    let updated = 0;
    let skipped = 0;

    const existingPantry = await this.pantry.getPantry(userId);
    const existingByName = new Map(
      existingPantry.ingredients.map((i) => [i.ingredientName.toLowerCase(), i]),
    );

    for (const item of request.items) {
      if (!item.accepted) { skipped++; continue; }
      if (item.duplicateAction === 'SKIP') { skipped++; continue; }

      const name = item.displayName ?? 'Unknown item';
      const kind = this.itemTypeToKind(item.itemType ?? 'INGREDIENT');
      const isFood = item.itemType === 'PREPARED_MEAL' || item.itemType === 'LEFTOVER';
      const canonical = canonicalizeIngredientName(name);
      const existing = existingByName.get(canonical.toLowerCase());

      const expiryDays = item.estimatedExpiryDays;
      const expiresAt = expiryDays != null
        ? new Date(Date.now() + expiryDays * 86400000).toISOString()
        : undefined;

      const upsertBase = {
        ingredientName: name,
        quantity: item.quantity ?? undefined,
        unit: item.unit ?? undefined,
        kind,
        expiresAt,
        ...(isFood
          ? {
              dishName: name,
              servings: item.servings ?? 2,
              madeAt: new Date().toISOString(),
            }
          : {}),
      };

      if (existing && item.duplicateAction === 'UPDATE') {
        await this.pantry.upsertItem(userId, {
          ...upsertBase,
          mergeQuantity: false,
        });
        updated++;
      } else if (existing && item.duplicateAction === 'ADD_MORE') {
        await this.pantry.upsertItem(userId, {
          ...upsertBase,
          mergeQuantity: true,
        });
        updated++;
      } else {
        await this.pantry.upsertItem(userId, upsertBase);
        added++;
      }
    }

    return { added, updated, skipped };
  }

  // --- Private helpers ---

  private async processImage(
    imageBase64: string,
    options?: { cuisines?: string[]; context?: KitchenVisionContext },
  ): Promise<Array<{
    name: string;
    confidence: number;
    state: string;
    estimatedQuantity: number | null;
    unit: string | null;
    itemType: string;
    servings: number | null;
  }>> {
    const buffer = Buffer.from(imageBase64, 'base64');
    const result = await this.vision.analyzeKitchenImage(buffer, {
      cuisines: options?.cuisines,
      context: options?.context,
    });

    // Kitchen analyzer JSON style: two destinations. leftovers[] map to
    // pantry leftovers; kitchen[] map to pantry ingredients/packaged items.
    // No recipe decomposition - a dish is one entry, never its ingredients.
    const items: Array<{
      name: string;
      confidence: number;
      state: string;
      estimatedQuantity: number | null;
      unit: string | null;
      itemType: string;
      servings: number | null;
    }> = [];

    for (const leftover of result.leftovers) {
      items.push({
        name: leftover.name,
        confidence: leftover.confidence,
        state: leftover.state === 'packaged' ? 'processed' : leftover.state === 'unknown' ? 'unknown' : leftover.state,
        estimatedQuantity: null,
        unit: this.inferUnit(leftover.name),
        itemType: 'LEFTOVER',
        servings: 2,
      });
    }

    for (const item of result.kitchen) {
      items.push({
        name: item.name,
        confidence: item.confidence,
        state: item.state === 'packaged' ? 'processed' : item.state === 'unknown' ? 'unknown' : item.state,
        estimatedQuantity: null,
        unit: this.inferUnit(item.name),
        itemType: item.itemType === 'PACKAGED_FOOD' ? 'PACKAGED_FOOD' : 'INGREDIENT',
        servings: null,
      });
    }

    return items;
  }

  private async processText(
    text: string,
  ): Promise<Array<{
    name: string;
    confidence: number;
    state: string;
    estimatedQuantity: number | null;
    unit: string | null;
    itemType: string;
    servings: number | null;
  }>> {
    if (env.OPENROUTER_API_KEY) {
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
              model: 'deepseek/deepseek-chat-v3-0324:free',
              messages: [
                { role: 'system', content: CAPTURE_TEXT_PROMPT },
                { role: 'user', content: text },
              ],
              temperature: 0.2,
              max_tokens: 1000,
            }),
          },
        );

        if (response.ok) {
          const data = (await response.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          const content = data.choices?.[0]?.message?.content ?? '{}';
          const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = captureResponseSchema.parse(JSON.parse(cleaned));
          return parsed.items.map((item) => ({
            name: item.name,
            confidence: item.confidence,
            state: item.state,
            estimatedQuantity: item.estimatedQuantity ?? null,
            unit: item.unit ?? this.inferUnit(item.name),
            itemType: item.itemType,
            servings: null,
          }));
        }
      } catch {
        // Fall through to heuristic
      }
    }

    return this.parseTextFallback(text);
  }

  private parseTextFallback(text: string): Array<{
    name: string;
    confidence: number;
    state: string;
    estimatedQuantity: number | null;
    unit: string | null;
    itemType: string;
    servings: number | null;
  }> {
    const items: Array<{
      name: string;
      confidence: number;
      state: string;
      estimatedQuantity: number | null;
      unit: string | null;
      itemType: string;
      servings: number | null;
    }> = [];

    const parts = text.split(/[,+]|\band\b/i).map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      const lower = part.toLowerCase();
      let quantity: number | null = null;
      let name = lower;
      let state = 'unknown';
      let itemType = 'INGREDIENT';

      const qtyMatch = lower.match(/^(\d+(?:\.\d+)?)\s+/);
      if (qtyMatch) {
        quantity = parseFloat(qtyMatch[1]!);
        name = lower.slice(qtyMatch[0].length);
      }

      if (name.startsWith('half ')) {
        quantity = 0.5;
        name = name.slice(5);
      } else if (name.startsWith('a ') || name.startsWith('an ')) {
        quantity = 1;
        name = name.replace(/^(a|an)\s+/, '');
      }

      if (lower.includes('leftover')) {
        state = 'cooked';
        itemType = 'LEFTOVER';
        name = name.replace('leftover', '').trim();
      } else if (lower.includes('cooked')) {
        state = 'cooked';
        name = name.replace('cooked', '').trim();
      } else if (lower.includes('raw')) {
        state = 'raw';
        name = name.replace('raw', '').trim();
      }

      if (name.startsWith('some ') || name.startsWith('a little ')) {
        quantity = null;
        name = name.replace(/^(some|a little)\s+/, '');
      }

      if (name.length > 0) {
        items.push({
          name,
          confidence: 0.7,
          state,
          estimatedQuantity: quantity,
          unit: this.inferUnit(name),
          itemType,
          servings: null,
        });
      }
    }

    return items;
  }

  private normalizeItem(
    raw: {
      name: string;
      confidence: number;
      state: string;
      estimatedQuantity: number | null;
      unit: string | null;
      itemType: string;
      servings: number | null;
    },
    source: CaptureSource,
  ): CapturedItem {
    const canonical = canonicalizeIngredientName(raw.name);
    const lookupName = canonical.toLowerCase();
    const confidenceTier: ConfidenceTier =
      raw.confidence >= 0.8 ? 'HIGH' : raw.confidence >= 0.5 ? 'MEDIUM' : 'LOW';

    // Infer expiry from lookup table
    const estimatedExpiryDays = this.inferExpiry(lookupName, raw.itemType);

    // Apply default quantity/unit if not specified
    let quantity = raw.estimatedQuantity;
    let unit = raw.unit;
    if (quantity == null && unit == null) {
      const defaults = DEFAULT_UNITS[lookupName];
      if (defaults) {
        quantity = defaults.quantity;
        unit = defaults.unit;
      }
    } else if (unit == null) {
      unit = this.inferUnit(lookupName);
    }

    const isFood = raw.itemType === 'PREPARED_MEAL' || raw.itemType === 'LEFTOVER';

    return {
      id: randomUUID(),
      displayName: this.titleCase(raw.name),
      itemType: raw.itemType as ItemType,
      state: this.mapState(raw.state),
      quantity,
      unit,
      servings: isFood ? raw.servings ?? 2 : null,
      confidence: raw.confidence,
      confidenceTier,
      source,
      estimatedExpiryDays,
      clarification:
        confidenceTier === 'LOW'
          ? {
              question: `Not sure about this one — is it ${raw.name}?`,
              options: [raw.name, 'Something else'],
            }
          : undefined,
    };
  }

  private inferExpiry(name: string, itemType: string): number | null {
    // Leftovers always short
    if (itemType === 'LEFTOVER') return EXPIRY_DAYS.leftover ?? 3;

    // Direct lookup
    if (EXPIRY_DAYS[name] != null) return EXPIRY_DAYS[name];

    // Partial match — check if any key is contained in the name
    for (const [key, days] of Object.entries(EXPIRY_DAYS)) {
      if (name.includes(key) || key.includes(name)) return days;
    }

    // Default by type
    if (itemType === 'PACKAGED_FOOD') return 30;
    if (itemType === 'PREPARED_MEAL') return 3;
    return 7; // generic produce/ingredient
  }

  private inferUnit(name: string): string {
    const lookup = name.toLowerCase();
    if (DEFAULT_UNITS[lookup]?.unit) return DEFAULT_UNITS[lookup]!.unit;

    // Liquid keywords
    if (/\b(milk|water|juice|oil|vinegar|sauce|broth|cream)\b/.test(lookup)) return 'ml';

    // Grain/weight keywords
    if (/\b(rice|pasta|flour|sugar|oats|cereal|cheese|meat|chicken|beef|fish|tofu)\b/.test(lookup)) return 'g';

    // Countable keywords
    if (/\b(egg|tomato|onion|potato|carrot|apple|banana|lemon|lime|cucumber|pepper|clove)\b/.test(lookup)) return 'pcs';

    return 'g';
  }

  private itemTypeToKind(itemType: ItemType): 'pantry' | 'leftover' {
    return itemType === 'LEFTOVER' || itemType === 'PREPARED_MEAL' ? 'leftover' : 'pantry';
  }

  private mapState(raw: string): ItemState {
    switch (raw.toLowerCase()) {
      case 'raw': return 'RAW';
      case 'cooked': return 'COOKED';
      case 'processed': return 'READY_TO_EAT';
      case 'mixed': return 'UNKNOWN';
      default: return 'UNKNOWN';
    }
  }

  private parseQuantity(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const match = raw.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]!) : null;
  }

  private titleCase(s: string): string {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
