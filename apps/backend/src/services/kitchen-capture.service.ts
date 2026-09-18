import { randomUUID } from 'node:crypto';

import type { UUID } from '@meal-rescue/shared-types';

import { env } from '../config/env';
import type { Db } from '../database/models';
import { AppError, ErrorCategory } from '../lib/errors';
import type { LlmClient } from './ai/llm-client';
import { VisionService } from './ai/vision.service';
import { TextExtractionService } from './ai/text-extraction.service';
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
  confidence: number;
  confidenceTier: ConfidenceTier;
  source: CaptureSource;
  /** If this item matches an existing pantry item */
  duplicateOf?: {
    id: string;
    currentQuantity: number | null;
    currentUnit: string | null;
  };
  /** User clarification needed */
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
    duplicateAction?: 'UPDATE' | 'ADD_MORE' | 'SKIP';
  }>;
}

export interface CaptureConfirmResult {
  added: number;
  updated: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Capture prompt for combined vision + kitchen context
// ---------------------------------------------------------------------------

const CAPTURE_VISION_PROMPT = `You are a kitchen vision AI. Analyze this image and identify ALL food items visible.

For each item, provide:
- name: specific food name (e.g., "eggs" not "food")
- confidence: 0.0-1.0 how sure you are
- state: "raw" (uncooked ingredient), "cooked" (prepared), "processed" (packaged), "mixed"
- estimatedQuantity: number if countable, null if uncertain
- unit: "pieces", "cups", "grams", "ml", etc. if determinable, null otherwise
- itemType: "INGREDIENT" (raw food item), "PREPARED_MEAL" (cooked dish), "LEFTOVER" (previously cooked), "PACKAGED_FOOD" (store-bought package)

RULES:
- Be specific: "eggs" not "protein source"
- Count visible items when possible (6 eggs, 3 tomatoes)
- If something is ambiguous, lower confidence and suggest what it might be
- Do NOT invent items you cannot see
- For leftovers, note "leftover" in the name if context suggests it
- For packaged items, note the brand if visible

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

const CAPTURE_TEXT_PROMPT = `You are a kitchen text parser. Convert this natural-language description of food items into structured data.

Input examples:
- "4 eggs, some leftover rice and half an onion"
- "2 eggs + cucumber + leftover biryani"
- "I have some cooked rice, tomato and yogurt"
- "whatever is in my fridge"
- "leftover chicken curry from lunch"

For each item, provide:
- name: canonical food name
- confidence: 0.0-1.0
- state: "raw", "cooked", "processed", "mixed"
- estimatedQuantity: number if specified (handle "some", "a little", "half" as approximate), null if unknown
- unit: "pieces", "cups", "grams", etc. if inferable, null otherwise
- itemType: "INGREDIENT", "PREPARED_MEAL", "LEFTOVER", "PACKAGED_FOOD"

RULES:
- Normalize quantities: "some" → null quantity, "half an onion" → 0.5
- "leftover X" → itemType: "LEFTOVER", state: "cooked"
- "cooked X" → state: "cooked"
- "raw X" → state: "raw"
- Be specific: "biryani" → "biryani", not "rice dish"
- If input is too vague ("whatever is in my fridge"), return empty items array

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
// Zod schema for LLM response
// ---------------------------------------------------------------------------

import { z } from 'zod';

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
// Service
// ---------------------------------------------------------------------------

export class KitchenCaptureService {
  private readonly vision: VisionService;
  private readonly textExtraction: TextExtractionService;
  private readonly pantry: PantryService;
  private readonly models: Db['models'];

  constructor(
    llm: LlmClient,
    models: Db['models'],
    redis?: import('ioredis').Redis | null,
  ) {
    this.vision = new VisionService(llm, redis);
    this.textExtraction = new TextExtractionService(llm);
    this.pantry = new PantryService(models);
    this.models = models;
  }

  /**
   * Process a camera/photo capture or natural-language text input
   * into structured kitchen items with confidence tiers.
   */
  async capture(
    userId: UUID,
    input:
      | { source: 'CAMERA' | 'PHOTO'; imageBase64: string; mimeType?: string }
      | { source: 'MANUAL'; text: string },
  ): Promise<CaptureResult> {
    let rawItems: Array<{
      name: string;
      confidence: number;
      state: string;
      estimatedQuantity: number | null;
      unit: string | null;
      itemType: string;
    }>;

    if (input.source === 'CAMERA' || input.source === 'PHOTO') {
      rawItems = await this.processImage(input.imageBase64, input.mimeType ?? 'image/jpeg');
    } else {
      rawItems = await this.processText(input.text);
    }

    // Normalize and classify
    const items: CapturedItem[] = [];
    for (const raw of rawItems) {
      const normalized = this.normalizeItem(raw, input.source);
      items.push(normalized);
    }

    // Check for duplicates against existing pantry
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

    return {
      items,
      summary,
      imageBase64: input.source !== 'MANUAL' ? input.imageBase64 : undefined,
    };
  }

  /**
   * Save confirmed items to the pantry.
   */
  async confirm(userId: UUID, request: CaptureConfirmRequest): Promise<CaptureConfirmResult> {
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of request.items) {
      if (!item.accepted) {
        skipped++;
        continue;
      }

      if (item.duplicateAction === 'SKIP') {
        skipped++;
        continue;
      }

      const name = item.displayName ?? 'Unknown item';
      const kind = this.itemTypeToKind(item.itemType ?? 'INGREDIENT');

      if (item.duplicateOf && item.duplicateAction === 'UPDATE') {
        await this.pantry.upsertItem(userId, {
          ingredientName: name,
          quantity: item.quantity ?? undefined,
          unit: item.unit ?? undefined,
          kind,
          mergeQuantity: false,
        });
        updated++;
      } else if (item.duplicateOf && item.duplicateAction === 'ADD_MORE') {
        await this.pantry.upsertItem(userId, {
          ingredientName: name,
          quantity: item.quantity ?? undefined,
          unit: item.unit ?? undefined,
          kind,
          mergeQuantity: true,
        });
        updated++;
      } else {
        await this.pantry.upsertItem(userId, {
          ingredientName: name,
          quantity: item.quantity ?? undefined,
          unit: item.unit ?? undefined,
          kind,
        });
        added++;
      }
    }

    return { added, updated, skipped };
  }

  // --- Private helpers ---

  private async processImage(
    imageBase64: string,
    mimeType: string,
  ): Promise<Array<{
    name: string;
    confidence: number;
    state: string;
    estimatedQuantity: number | null;
    unit: string | null;
    itemType: string;
  }>> {
    const buffer = Buffer.from(imageBase64, 'base64');
    const result = await this.vision.analyzeImage(buffer);

    // Map vision result to capture items
    const items: Array<{
      name: string;
      confidence: number;
      state: string;
      estimatedQuantity: number | null;
      unit: string | null;
      itemType: string;
    }> = [];

    // Use ingredients as primary (they have state + quantity)
    for (const ing of result.ingredients) {
      items.push({
        name: ing.name,
        confidence: ing.confidence,
        state: ing.state,
        estimatedQuantity: this.parseQuantity(ing.estimatedQuantity),
        unit: this.parseUnit(ing.estimatedQuantity),
        itemType: this.inferItemType(ing.name, ing.state),
      });
    }

    // Add any foods not already covered by ingredients
    const ingredientNames = new Set(items.map((i) => i.name.toLowerCase()));
    for (const food of result.foods) {
      if (!ingredientNames.has(food.name.toLowerCase())) {
        items.push({
          name: food.name,
          confidence: food.confidence,
          state: 'unknown',
          estimatedQuantity: null,
          unit: null,
          itemType: this.inferItemType(food.name, 'unknown'),
        });
      }
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
  }>> {
    // Use the LLM directly for text parsing since TextExtractionService
    // returns a different shape than what we need
    if (!env.OPENAI_API_KEY) {
      return this.parseTextFallback(text);
    }

    try {
      const response = await fetch(
        `${env.OPENAI_BASE_URL ?? 'https://openrouter.ai/api/v1'}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
            ...(env.OPENAI_TEXT_MODEL?.startsWith('z-ai/') ? {} : {}),
          },
          body: JSON.stringify({
            model: env.OPENAI_TEXT_MODEL ?? 'openrouter/free',
            messages: [
              { role: 'system', content: CAPTURE_TEXT_PROMPT },
              { role: 'user', content: text },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: 1000,
            ...(env.OPENAI_TEXT_MODEL?.startsWith('z-ai/') ? { reasoning: { enabled: false } } : {}),
          }),
        },
      );

      if (!response.ok) throw new Error(`LLM error: ${response.status}`);
      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? '{}';
      const parsed = captureResponseSchema.parse(JSON.parse(content));
      return parsed.items;
    } catch {
      return this.parseTextFallback(text);
    }
  }

  private parseTextFallback(text: string): Array<{
    name: string;
    confidence: number;
    state: string;
    estimatedQuantity: number | null;
    unit: string | null;
    itemType: string;
  }> {
    // Simple regex-based fallback for common patterns
    const items: Array<{
      name: string;
      confidence: number;
      state: string;
      estimatedQuantity: number | null;
      unit: string | null;
      itemType: string;
    }> = [];

    // Split on commas, +, and
    const parts = text.split(/[,+]|\band\b/i).map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      const lower = part.toLowerCase();
      let quantity: number | null = null;
      let name = lower;
      let state = 'unknown';
      let itemType = 'INGREDIENT';

      // Parse quantity prefixes
      const qtyMatch = lower.match(/^(\d+(?:\.\d+)?)\s+/);
      if (qtyMatch) {
        quantity = parseFloat(qtyMatch[1]);
        name = lower.slice(qtyMatch[0].length);
      }

      // Handle "half", "quarter", etc.
      if (name.startsWith('half ')) {
        quantity = 0.5;
        name = name.slice(5);
      } else if (name.startsWith('a ') || name.startsWith('an ')) {
        quantity = 1;
        name = name.replace(/^(a|an)\s+/, '');
      }

      // Detect state
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

      // Detect "some", "a little"
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
          unit: null,
          itemType,
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
    },
    source: CaptureSource,
  ): CapturedItem {
    const confidenceTier: ConfidenceTier =
      raw.confidence >= 0.8 ? 'HIGH' : raw.confidence >= 0.5 ? 'MEDIUM' : 'LOW';

    return {
      id: randomUUID(),
      displayName: this.titleCase(raw.name),
      itemType: raw.itemType as ItemType,
      state: this.mapState(raw.state),
      quantity: raw.estimatedQuantity,
      unit: raw.unit,
      confidence: raw.confidence,
      confidenceTier,
      source,
      clarification:
        confidenceTier === 'LOW'
          ? {
              question: `Not sure about this one — is it ${raw.name}?`,
              options: [raw.name, 'Something else'],
            }
          : undefined,
    };
  }

  private mapState(raw: string): ItemState {
    switch (raw.toLowerCase()) {
      case 'raw':
        return 'RAW';
      case 'cooked':
        return 'COOKED';
      case 'processed':
        return 'READY_TO_EAT';
      case 'mixed':
        return 'UNKNOWN';
      default:
        return 'UNKNOWN';
    }
  }

  private inferItemType(name: string, state: string): string {
    const lower = name.toLowerCase();

    // Leftover indicators
    if (lower.includes('leftover') || lower.includes('from lunch') || lower.includes('from dinner')) {
      return 'LEFTOVER';
    }

    // Prepared meal indicators
    if (
      lower.includes('curry') ||
      lower.includes('stir fry') ||
      lower.includes('pasta') ||
      lower.includes('biryani') ||
      lower.includes('soup') ||
      lower.includes('stew') ||
      lower.includes('casserole')
    ) {
      return state === 'cooked' ? 'PREPARED_MEAL' : 'INGREDIENT';
    }

    // Packaged indicators
    if (
      lower.includes('package') ||
      lower.includes('box') ||
      lower.includes('can of') ||
      lower.includes('bottle')
    ) {
      return 'PACKAGED_FOOD';
    }

    return 'INGREDIENT';
  }

  private itemTypeToKind(itemType: ItemType): 'pantry' | 'leftover' {
    return itemType === 'LEFTOVER' ? 'leftover' : 'pantry';
  }

  private parseQuantity(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const match = raw.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  private parseUnit(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower.includes('cup')) return 'cups';
    if (lower.includes('gram')) return 'grams';
    if (lower.includes('ml')) return 'ml';
    if (lower.includes('piece') || lower.includes('pcs')) return 'pieces';
    if (lower.includes('kg')) return 'kg';
    return null;
  }

  private titleCase(s: string): string {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
