import { randomUUID } from 'node:crypto';

import type {
  CulinaryCompassSeed,
  CulinaryFamily,
  DetectedFood,
  FoodPersonality,
  FoodPersonalityTrait,
  MemoryReason,
  TasteJournalEntry,
  TasteMemoryEntry,
} from '@meal-rescue/shared-types';

import type { Db } from '../database/models';
import {
  CULINARY_FAMILIES,
  detectCuisineIntent,
  matchAmbiguousFamily,
} from './ai/culinary-families';

/**
 * TasteMemoryService - per-context taste learning.
 *
 * "I don't like spice" does NOT mean "I reject all spice." Every signal is
 * recorded against the context that produced it (cuisine, meal time, or
 * intervention pattern). A user can love spice in tacos and avoid it in
 * curries simultaneously - two rows, no contradiction.
 *
 * Also derives the Food Personality and writes Taste Journal entries.
 */
export class TasteMemoryService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  private fundingCuisine(detectedFoods: DetectedFood[] | undefined): string | null {
    if (!detectedFoods || detectedFoods.length === 0) return null;
    const names = detectedFoods.map((f) => f.name.toLowerCase()).join(' ');
    if (/noodle|ramen|rice|stir-fry|curry|soy/.test(names)) return 'asian';
    if (/taco|burrito|quesadilla|salsa|tortilla/.test(names)) return 'mexican';
    if (/burger|sandwich|toast|fries|cheese/.test(names)) return 'american';
    if (/falafel|hummus|pita|kebab|olive/.test(names)) return 'mediterranean';
    if (/dal|roti|paratha|khichdi|poha/.test(names)) return 'indian';
    return null;
  }

  private mealtimeContext(hour = new Date().getHours()): {
    contextType: string;
    contextValue: string;
  } {
    if (hour >= 5 && hour < 11) return { contextType: 'meal_time', contextValue: 'morning' };
    if (hour >= 11 && hour < 15) return { contextType: 'meal_time', contextValue: 'lunch' };
    if (hour >= 15 && hour < 21) return { contextType: 'meal_time', contextValue: 'dinner' };
    return { contextType: 'meal_time', contextValue: 'late_night' };
  }

  async recordFeedback(
    userId: string,
    rescue: {
      selectedRecommendation: Record<string, unknown>;
      userDecision: string;
      constraints?: Record<string, unknown>;
      detectedFoods?: DetectedFood[];
    },
    satisfaction: string,
  ): Promise<TasteJournalEntry[]> {
    const entries: TasteJournalEntry[] = [];
    const candidate = (rescue.selectedRecommendation.candidate as
      | {
          additions?: Array<{ name: string }>;
          substitutions?: Array<{ replacement: { name: string } }>;
        }
      | undefined) ?? { additions: [], substitutions: [] };

    const ingredients = [
      ...(candidate.additions ?? []).map((a) => a.name.toLowerCase()),
      ...(candidate.substitutions ?? []).map((s) => s.replacement.name.toLowerCase()),
    ];

    const cuisine = this.fundingCuisine(rescue.detectedFoods);
    const mealTime = this.mealtimeContext();
    const context = cuisine
      ? { contextType: 'cuisine', contextValue: cuisine }
      : { contextType: mealTime.contextType, contextValue: mealTime.contextValue };

    const delta = satisfaction === 'better' ? 0.35 : satisfaction === 'not_for_me' ? -0.4 : 0;

    for (const ingredient of ingredients) {
      const entry = await this.applySignal({
        userId,
        ingredient,
        contextType: context.contextType,
        contextValue: context.contextValue,
        affinityDelta: delta,
        confidenceDelta: 0.2,
        source: 'feedback',
      });
      if (entry) entries.push(this.describeLearn(userId, ingredient, entry, satisfaction));
    }
    return entries;
  }

  async recordDecision(
    userId: string,
    decision: string,
    rescue: {
      selectedRecommendation: Record<string, unknown>;
      detectedFoods?: DetectedFood[];
    },
  ): Promise<void> {
    const candidate = (rescue.selectedRecommendation.candidate as
      | {
          additions?: Array<{ name: string }>;
          substitutions?: Array<{ replacement: { name: string } }>;
        }
      | undefined) ?? { additions: [], substitutions: [] };
    const ingredients = [
      ...(candidate.additions ?? []).map((a) => a.name.toLowerCase()),
      ...(candidate.substitutions ?? []).map((s) => s.replacement.name.toLowerCase()),
    ];
    const cuisine = this.fundingCuisine(rescue.detectedFoods);
    const mealTime = this.mealtimeContext();
    const context = cuisine
      ? { contextType: 'cuisine', contextValue: cuisine }
      : { contextType: mealTime.contextType, contextValue: mealTime.contextValue };

    const delta =
      decision === 'accepted' || decision === 'swapped' ? 0.3 : decision === 'rejected' ? -0.35 : 0;
    const source = decision === 'swapped' ? 'swap' : decision === 'accepted' ? 'accept' : 'reject';

    for (const ingredient of ingredients) {
      await this.applySignal({
        userId,
        ingredient,
        contextType: context.contextType,
        contextValue: context.contextValue,
        affinityDelta: delta,
        confidenceDelta: 0.12,
        source,
      });
    }
  }

  private async applySignal(args: {
    userId: string;
    ingredient: string;
    contextType: string;
    contextValue: string;
    affinityDelta: number;
    confidenceDelta: number;
    source: string;
  }): Promise<TasteMemoryEntry | null> {
    const where = {
      userId: args.userId,
      ingredient: args.ingredient,
      contextType: args.contextType,
      contextValue: args.contextValue,
    };
    const existing = await this.models.TasteMemory.findOne({ where });

    if (existing) {
      const affinity = clamp01(Number(existing.get().affinity) + args.affinityDelta);
      const confidence = Math.min(1, Number(existing.get().confidence) + args.confidenceDelta);
      existing.get().affinity = affinity;
      existing.get().confidence = confidence;
      existing.get().observationCount += 1;
      existing.get().source = args.source;
      existing.get().lastUpdated = new Date();
      await existing.save();
      return existing.get() as unknown as TasteMemoryEntry;
    }

    const created = await this.models.TasteMemory.create({
      id: randomUUID(),
      userId: args.userId,
      ingredient: args.ingredient,
      contextType: args.contextType,
      contextValue: args.contextValue,
      affinity: Math.max(-0.5, Math.min(0.5, args.affinityDelta)),
      confidence: Math.min(0.5 + args.confidenceDelta, 1),
      observationCount: 1,
      source: args.source,
      lastUpdated: new Date(),
    });
    return created as unknown as TasteMemoryEntry;
  }

  private describeLearn(
    userId: string,
    ingredient: string,
    entry: TasteMemoryEntry,
    satisfaction: string,
  ): TasteJournalEntry {
    const context = entry.contextType === 'cuisine' ? ` in ${entry.contextValue} dishes` : '';
    const tone =
      satisfaction === 'better'
        ? `Noted: you enjoyed ${ingredient}${context}.`
        : satisfaction === 'not_for_me'
          ? `Noted: you steered away from ${ingredient}${context}.`
          : `Noted: you were neutral on ${ingredient}${context}.`;
    return { id: randomUUID(), createdAt: new Date().toISOString(), text: tone, kind: 'learned' };
  }

  async getTasteProfile(userId: string): Promise<TasteMemoryEntry[]> {
    const rows = await this.models.TasteMemory.findAll({
      where: { userId },
      order: [['confidence', 'DESC']],
    });
    return rows.map((row) => row.get() as unknown as TasteMemoryEntry);
  }

  async getJournal(userId: string): Promise<TasteJournalEntry[]> {
    const profile = await this.getTasteProfile(userId);
    const entries: TasteJournalEntry[] = [];

    // Onboarding-learned meal-add preferences (contextType: addition_*).
    // Surface these first so a fresh user sees what they picked in the
    // "finish a meal" comparisons, grouped by the factor each option tests.
    const factorContexts: Array<{ context: string; label: string; emoji: string }> = [
      { context: 'addition_nutritional', label: 'Balance', emoji: '📗' },
      { context: 'addition_sensory', label: 'Texture & Flavor', emoji: '✨' },
      { context: 'addition_satisfaction', label: 'Satisfaction', emoji: '😌' },
      { context: 'addition_modification', label: 'Keeps it Interesting', emoji: '🔁' },
      { context: 'addition_exploration', label: 'Adventurous', emoji: '🧭' },
    ];
    for (const { context, label, emoji } of factorContexts) {
      const cells = profile
        .filter((m) => m.contextType === context && m.contextValue === 'overall')
        .sort(
          (a, b) =>
            Math.abs(b.affinity) - Math.abs(a.affinity) ||
            new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
        );
      if (cells.length === 0) continue;
      const liked = cells
        .filter((m) => m.affinity >= 0.2)
        .slice(0, 3)
        .map((m) => m.ingredient);
      const avoided = cells
        .filter((m) => m.affinity <= -0.2)
        .slice(0, 3)
        .map((m) => m.ingredient);
      const latest = cells[0]!;
      if (liked.length > 0) {
        entries.push({
          id: randomUUID(),
          createdAt: latest.lastUpdated,
          text: `${emoji} For ${label.toLowerCase()}, you gravitate toward ${liked.join(', ')}.`,
          kind: 'preference',
        });
      }
      if (avoided.length > 0) {
        entries.push({
          id: randomUUID(),
          createdAt: latest.lastUpdated,
          text: `${emoji} On ${label.toLowerCase()}, you tend to steer clear of ${avoided.join(', ')}.`,
          kind: 'preference',
        });
      }
    }

    // Culture axis (tradition vs modern), learned from the Culinary Compass.
    const tradition = await this.getTraditionVsModern(userId);
    if (tradition !== 0) {
      entries.push({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        text:
          tradition >= 0
            ? `You've been enjoying modern twists lately.`
            : `You tend to reach for pure, traditional plates.`,
        kind: 'culture',
      });
    }

    // Ingredient-level learnings from rescue feedback (cuisine/meal context).
    const ingredients = profile.filter(
      (m) =>
        m.contextType === 'cuisine' ||
        m.contextType === 'meal_time' ||
        m.contextType === 'meal_pattern',
    );
    for (const m of ingredients.slice(0, 20)) {
      entries.push({
        id: randomUUID(),
        createdAt: m.lastUpdated,
        text:
          m.affinity >= 0.2
            ? `You lean toward ${m.ingredient}${
                m.contextType === 'cuisine' ? ` in ${m.contextValue} dishes` : ''
              }.`
            : m.affinity <= -0.2
              ? `You steer clear of ${m.ingredient}${
                  m.contextType === 'cuisine' ? ` in ${m.contextValue} dishes` : ''
                }.`
              : `Still deciding on ${m.ingredient}.`,
        kind: 'learned',
      });
    }

    // Sort: newest learnings first for a natural diary feel.
    return entries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async buildPersonality(userId: string): Promise<FoodPersonality | null> {
    const profile = await this.getTasteProfile(userId);
    if (profile.length === 0) return null;

    const traits: FoodPersonalityTrait[] = [];
    const spiceRange = profile.filter((m) => /spice|chili|hot|pepper/i.test(m.ingredient));
    const creamRange = profile.filter((m) =>
      /cream|yogurt|cheese|butter|avocado/i.test(m.ingredient),
    );
    const freshRange = profile.filter((m) =>
      /herb|cilantro|spinach|tomato|cucumber|salad/i.test(m.ingredient),
    );
    const variety = new Set(profile.map((m) => m.ingredient)).size;

    if (spiceRange.length >= 2 && avgAffinity(spiceRange) >= 0.4) {
      traits.push({
        id: 'spice',
        label: 'Spice Adventurer',
        description: 'You love heat when it fits the meal.',
        strength: avgAffinity(spiceRange),
      });
    } else if (spiceRange.length >= 1 && avgAffinity(spiceRange) <= -0.4) {
      traits.push({
        id: 'mild',
        label: 'Mild & Steady',
        description: 'You prefer gentler flavor, in the right context.',
        strength: Math.abs(avgAffinity(spiceRange)),
      });
    }
    if (creamRange.length >= 2 && avgAffinity(creamRange) >= 0.4) {
      traits.push({
        id: 'cream',
        label: 'Comfort Seeker',
        description: 'Rich, creamy textures land well for you.',
        strength: avgAffinity(creamRange),
      });
    }
    if (freshRange.length >= 2) {
      traits.push({
        id: 'fresh',
        label: 'Fresh Palate',
        description: 'Bright, fresh produce tends to win you over.',
        strength: Math.min(1, 0.4 + 0.1 * freshRange.length),
      });
    }
    if (variety >= 8) {
      traits.push({
        id: 'curious',
        label: 'Curious Taster',
        description: 'You keep trying new things - we love that.',
        strength: Math.min(1, 0.3 + 0.05 * variety),
      });
    }

    if (traits.length === 0) return null;
    const top = traits[0]!.label;
    return {
      traits,
      bio: `You lean ${top} — and we remember the details.`,
    } satisfies FoodPersonality;
  }

  async buildPreferenceSnapshot(
    userId: string,
  ): Promise<{ favoriteFoods?: string[]; avoidedFoods?: string[] }> {
    const profile = await this.getTasteProfile(userId);
    if (profile.length === 0) return {};
    // Culture dimensions are not individual ingredients - they steer candidate
    // generation separately, so exclude them from the ingredient snapshot.
    const ingredients = profile.filter(
      (m) => m.contextType !== 'cuisine_family' && m.contextType !== 'tradition_vs_modern',
    );
    const favorites = ingredients
      .filter((m) => m.affinity >= 0.5 && m.confidence >= 0.5)
      .map((m) => m.ingredient);
    const avoided = ingredients
      .filter((m) => m.affinity <= -0.5 && m.confidence >= 0.5)
      .map((m) => m.ingredient);
    return {
      favoriteFoods: favorites.length ? [...new Set(favorites)] : undefined,
      avoidedFoods: avoided.length ? [...new Set(avoided)] : undefined,
    };
  }

  async seedCompass(userId: string, seed: CulinaryCompassSeed): Promise<void> {
    if (seed.family !== 'none') {
      await this.applySignal({
        userId,
        ingredient: seed.family,
        contextType: 'cuisine_family',
        contextValue: seed.family,
        affinityDelta: 0.8,
        confidenceDelta: 0.5,
        source: 'profile',
      });
    }
    await this.applySignal({
      userId,
      ingredient: 'tradition',
      contextType: 'tradition_vs_modern',
      contextValue: 'overall',
      affinityDelta: seed.traditionVsModern,
      confidenceDelta: 0.5,
      source: 'profile',
    });
  }

  async getCuisineAffinities(userId: string): Promise<Map<CulinaryFamily, number>> {
    const profile = await this.getTasteProfile(userId);
    const cuisines = profile.filter((m) => m.contextType === 'cuisine_family');
    const map = new Map<CulinaryFamily, number>();
    for (const c of cuisines) {
      if (isCulinaryFamily(c.contextValue)) {
        // Blend affinity with confidence: low-confidence priors count less.
        map.set(c.contextValue, c.affinity * Math.min(1, c.confidence));
      }
    }
    return map;
  }

  async getTraditionVsModern(userId: string): Promise<number> {
    const profile = await this.getTasteProfile(userId);
    const row = profile.find((m) => m.contextType === 'tradition_vs_modern');
    return row ? row.affinity : 0;
  }

  async recordCultureContext(
    userId: string,
    rescue: { selectedRecommendation: Record<string, unknown> },
    decision: string,
  ): Promise<void> {
    const candidate = (rescue.selectedRecommendation.candidate as
      | {
          additions?: Array<{ name: string }>;
          substitutions?: Array<{ replacement: { name: string } }>;
        }
      | undefined) ?? { additions: [], substitutions: [] };
    const foodNames = [
      ...(candidate.additions ?? []).map((a) => a.name),
      ...(candidate.substitutions ?? []).map((s) => s.replacement.name),
    ];
    const intent = detectCuisineIntent(foodNames);
    if (intent !== 'none') {
      await this.applySignal({
        userId,
        ingredient: intent,
        contextType: 'cuisine_family',
        contextValue: intent,
        affinityDelta: decision === 'accepted' || decision === 'swapped' ? 0.3 : -0.25,
        confidenceDelta: 0.12,
        source: decision === 'swapped' ? 'swap' : decision === 'accepted' ? 'accept' : 'reject',
      });
      return;
    }
    const affinities = await this.getCuisineAffinities(userId);
    const family = matchAmbiguousFamily(foodNames, affinities);
    if (family !== 'none') {
      await this.applySignal({
        userId,
        ingredient: family,
        contextType: 'cuisine_family',
        contextValue: family,
        affinityDelta: decision === 'accepted' || decision === 'swapped' ? 0.2 : -0.15,
        confidenceDelta: 0.08,
        source: decision === 'swapped' ? 'swap' : decision === 'accepted' ? 'accept' : 'reject',
      });
    }
  }

  async findResonanceMemory(
    userId: string,
    candidates: Array<{
      additions: Array<{ name: string }>;
      substitutions: Array<{ replacement: { name: string } }>;
    }>,
  ): Promise<MemoryReason | undefined> {
    const profile = await this.getTasteProfile(userId);
    if (profile.length === 0) return undefined;
    const names = new Set(
      candidates.flatMap((c) => [
        ...c.additions.map((a) => a.name.toLowerCase()),
        ...c.substitutions.map((s) => s.replacement.name.toLowerCase()),
      ]),
    );
    const resonance = profile.find(
      (m) => names.has(m.ingredient) && m.confidence >= 0.6 && Math.abs(m.affinity) >= 0.3,
    );
    if (!resonance) return undefined;
    return {
      ingredient: resonance.ingredient,
      contextValue: resonance.contextValue,
      affinity: resonance.affinity,
      confidence: resonance.confidence,
    };
  }
}

function clamp01(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

const CULINARY_FAMILY_SET = new Set<string>(CULINARY_FAMILIES.map((f) => f.family));

function isCulinaryFamily(value: string): value is CulinaryFamily {
  return CULINARY_FAMILY_SET.has(value);
}

function avgAffinity(rows: TasteMemoryEntry[]): number {
  return rows.reduce((sum, r) => sum + r.affinity, 0) / rows.length;
}
