import { randomUUID } from 'node:crypto';

import { Op } from 'sequelize';

import type {
  PantryDeleteResponse,
  PantryGetResponse,
  PantryItem,
  PantryItemKind,
  PantryUpsertRequest,
  SuggestedUse,
  UUID,
} from '@meal-rescue/shared-types';

import type { Db } from '../database/models';
import { AppError, ErrorCategory } from '../lib/errors';
import { CandidateGeneratorService } from './candidate-generator.service';

const EXPIRY_SOON_DAYS = 3;

/**
 * Small alias table mapping colloquial/free-text names (photo-import output,
 * manual typos) onto a single canonical ingredient name. Source of truth for
 * the photo-import merge: "2% Milk", "Whole Milk" and "Milk" all resolve to
 * "milk" so imports accumulate on one row instead of duplicating.
 */
export const CANONICAL_ALIASES: Record<string, string> = {
  milk: 'milk',
  'whole milk': 'milk',
  '2% milk': 'milk',
  '1% milk': 'milk',
  'skim milk': 'milk',
  'low fat milk': 'milk',
  semi_skimmed: 'milk',
  yogurt: 'yogurt',
  yoghurt: 'yogurt',
  'greek yogurt': 'yogurt',
  egg: 'egg',
  eggs: 'egg',
  rice: 'rice',
  'white rice': 'rice',
  'brown rice': 'rice',
  'basmati rice': 'rice',
  'jasmine rice': 'rice',
  'chicken breast': 'chicken breast',
  'breast of chicken': 'chicken breast',
  'boneless chicken breast': 'chicken breast',
  butter: 'butter',
  'unsalted butter': 'butter',
  'salted butter': 'butter',
  tomato: 'tomato',
  tomatoes: 'tomato',
  'cherry tomatoes': 'tomato',
  onion: 'onion',
  onions: 'onion',
  'red onion': 'onion',
  garlic: 'garlic',
  'garlic clove': 'garlic',
  'garlic cloves': 'garlic',
  potato: 'potato',
  potatoes: 'potato',
  carrot: 'carrot',
  carrots: 'carrot',
  apple: 'apple',
  apples: 'apple',
  banana: 'banana',
  bananas: 'banana',
  cheese: 'cheese',
  cheddar: 'cheese',
  mozzarella: 'cheese',
  bread: 'bread',
  'sliced bread': 'bread',
  pasta: 'pasta',
  spaghetti: 'pasta',
  penne: 'pasta',
};

/** Normalize free-text ingredient names to a stable canonical form. */
export function canonicalizeIngredientName(raw: string): string {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return CANONICAL_ALIASES[normalized] ?? normalized;
}

/** Case-insensitive lookup fragment so canonical names merge onto pre-existing rows regardless of stored casing. */
function byCanonicalName(name: string): { [Op.iLike]: string } {
  return { [Op.iLike]: canonicalizeIngredientName(name) };
}

export class PantryService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async getPantry(userId: UUID): Promise<PantryGetResponse> {
    const rows = await this.models.Pantry.findAll({
      where: { userId },
      order: [['addedAt', 'DESC']],
    });

    const now = new Date();
    const items: PantryItem[] = rows.map((row) => {
      const plain = row.get({ plain: true });
      const expiresAt = plain.expiresAt ? new Date(plain.expiresAt) : null;
      const daysUntilExpiry = expiresAt
        ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        id: plain.id,
        ingredientName: plain.ingredientName,
        quantity: plain.quantity != null ? Number(plain.quantity) : null,
        unit: plain.unit ?? null,
        addedAt: plain.addedAt.toISOString(),
        expiresAt: plain.expiresAt?.toISOString() ?? null,
        lastUsedAt: plain.lastUsedAt?.toISOString() ?? null,
        usePriority: plain.usePriority,
        daysUntilExpiry,
        isExpiringSoon:
          daysUntilExpiry !== null && daysUntilExpiry <= EXPIRY_SOON_DAYS && daysUntilExpiry >= 0,
        isLowStock: false,
        kind: plain.kind === 'leftover' ? 'leftover' : 'pantry',
        dishName: plain.dishName ?? null,
        servings: plain.servings ?? null,
        notes: plain.notes ?? null,
        madeAt: plain.madeAt?.toISOString() ?? null,
      };
    });

    const expiringSoon = items.filter((i) => i.isExpiringSoon);
    const lowStock = items.filter((i) => i.isLowStock);
    const suggestedUses = this.generateSuggestedUses(items, userId);

    return {
      ingredients: items,
      expiringSoon,
      lowStock,
      suggestedUses,
    };
  }

  async upsertItem(userId: UUID, payload: PantryUpsertRequest): Promise<PantryItem> {
    const kind: PantryItemKind = payload.kind ?? 'pantry';
    const isLeftover = kind === 'leftover';
    // Leftover rows are addressed by dish name; ingredient_name is mirrored so the
    // unique index, dedup, and intelligence signals still work over a single name.
    const candidateName = (
      isLeftover && payload.dishName ? payload.dishName : payload.ingredientName
    ).trim();
    // Pantry items get canonicalized so photo imports ("2% Milk", "milk") merge
    // onto a single row instead of duplicating. Leftover dish names stay verbatim.
    const rowName = isLeftover ? candidateName : canonicalizeIngredientName(candidateName);

    const existing = await this.models.Pantry.findOne({
      where: { userId, ingredientName: byCanonicalName(rowName) },
    });

    let row;
    if (existing) {
      const updates: Record<string, unknown> = {};
      if (payload.quantity !== undefined) {
        if (payload.mergeQuantity && payload.quantity !== null && !isLeftover) {
          const currentQty = (existing.get('quantity') as number | null) ?? null;
          updates.quantity = currentQty === null ? payload.quantity : currentQty + payload.quantity;
        } else {
          updates.quantity = payload.quantity;
        }
      }
      if (payload.unit !== undefined) updates.unit = payload.unit;
      if (payload.expiresAt !== undefined)
        updates.expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
      if (payload.usePriority !== undefined) updates.usePriority = payload.usePriority;
      if (payload.kind !== undefined) updates.kind = kind;
      if (payload.dishName !== undefined) updates.dishName = payload.dishName?.trim() ?? null;
      if (payload.servings !== undefined) updates.servings = payload.servings;
      if (payload.notes !== undefined) updates.notes = payload.notes;
      if (payload.madeAt !== undefined)
        updates.madeAt = payload.madeAt ? new Date(payload.madeAt) : null;
      updates.lastUsedAt = new Date();
      await existing.update(updates);
      row = existing;
    } else {
      row = await this.models.Pantry.create({
        id: randomUUID(),
        userId,
        ingredientName: rowName,
        kind,
        dishName: isLeftover ? rowName : (payload.dishName?.trim() ?? null),
        quantity: payload.quantity ?? null,
        unit: payload.unit ?? null,
        servings: payload.servings ?? null,
        notes: payload.notes ?? null,
        madeAt: payload.madeAt ? new Date(payload.madeAt) : null,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        usePriority: payload.usePriority ?? 0,
        lastUsedAt: new Date(),
      });
    }

    return this.toPantryItem(row.get({ plain: true }));
  }

  async deleteItem(userId: UUID, itemId: UUID): Promise<PantryDeleteResponse> {
    const deleted = await this.models.Pantry.destroy({
      where: { id: itemId, userId },
    });

    if (!deleted) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'PANTRY_ITEM_NOT_FOUND',
        message: 'Pantry item not found',
        statusCode: 404,
        recoverable: false,
      });
    }

    return { success: true, deletedId: itemId };
  }

  async markUsed(
    userId: UUID,
    ingredientName: string,
  ): Promise<{ success: true; removed: boolean }> {
    const row = await this.models.Pantry.findOne({
      where: { userId, ingredientName: byCanonicalName(ingredientName) },
    });
    if (!row) return { success: true, removed: false };

    if (row.kind === 'leftover') {
      const servingsLeft = (row.servings as number | null) ?? 1;
      if (servingsLeft <= 1) {
        await row.destroy();
        return { success: true, removed: true };
      }
      await row.update({ servings: servingsLeft - 1, lastUsedAt: new Date() });
      return { success: true, removed: false };
    }

    const qty = (row.quantity as number | null) ?? null;
    // Uncounted items (qty null) can't be safely decremented - just touch lastUsedAt.
    if (qty === null) {
      await row.update({ lastUsedAt: new Date() });
      return { success: true, removed: false };
    }
    // Whole item consumed - remove it rather than leaving a stale qty=0 row.
    if (qty <= 1) {
      await row.destroy();
      return { success: true, removed: true };
    }
    await row.update({
      lastUsedAt: new Date(),
      quantity: qty - 1,
    });
    return { success: true, removed: false };
  }

  private generateSuggestedUses(items: PantryItem[], _userId: UUID): SuggestedUse[] {
    const suggestions: SuggestedUse[] = [];

    for (const item of items) {
      if (item.isExpiringSoon) {
        const recipe = this.findRescueUsing(item.ingredientName);
        suggestions.push({
          ingredientName: item.ingredientName,
          reason: `Expires in ${item.daysUntilExpiry} day${item.daysUntilExpiry === 1 ? '' : 's'}`,
          rescuePreview: recipe ? `Try: ${recipe}` : undefined,
        });
      }
      if (item.usePriority > 0) {
        suggestions.push({
          ingredientName: item.ingredientName,
          reason: 'You marked this as a priority to use',
        });
      }
    }

    return suggestions.slice(0, 5);
  }

  private findRescueUsing(ingredient: string): string | undefined {
    const generator = new CandidateGeneratorService();
    const candidates = generator.generateCandidates(
      [{ name: ingredient, confidence: 1 }],
      [{ name: ingredient, confidence: 1, state: 'raw' }],
      { protein: true, fiber_sources: false, healthy_fat_sources: false, carbohydrates: true },
      {},
      {},
      [],
    );
    const top = candidates[0];
    if (top) {
      const parts = [
        ...top.additions.map((a) => a.name),
        ...top.substitutions.map((s) => s.replacement.name),
      ];
      return `Add ${parts.join(' + ')}`;
    }
    return undefined;
  }

  private toPantryItem(plain: Record<string, unknown>): PantryItem {
    const now = new Date();
    const expiresAt = plain.expiresAt ? new Date(plain.expiresAt as string) : null;
    const daysUntilExpiry = expiresAt
      ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      id: plain.id as UUID,
      ingredientName: plain.ingredientName as string,
      quantity: plain.quantity != null ? Number(plain.quantity) : null,
      unit: (plain.unit as string | null) ?? null,
      addedAt: (plain.addedAt as Date).toISOString(),
      expiresAt: plain.expiresAt ? (plain.expiresAt as Date).toISOString() : null,
      lastUsedAt: plain.lastUsedAt ? (plain.lastUsedAt as Date).toISOString() : null,
      usePriority: plain.usePriority as number,
      daysUntilExpiry,
      isExpiringSoon:
        daysUntilExpiry !== null && daysUntilExpiry <= EXPIRY_SOON_DAYS && daysUntilExpiry >= 0,
      isLowStock: false,
      kind: plain.kind === 'leftover' ? 'leftover' : 'pantry',
      dishName: (plain.dishName as string | null) ?? null,
      servings: (plain.servings as number | null) ?? null,
      notes: (plain.notes as string | null) ?? null,
      madeAt: plain.madeAt ? (plain.madeAt as Date).toISOString() : null,
    };
  }
}
