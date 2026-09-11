import { randomUUID } from 'node:crypto';

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
        quantity: plain.quantity ?? null,
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
    const rowName = (
      isLeftover && payload.dishName ? payload.dishName : payload.ingredientName
    ).trim();

    const existing = await this.models.Pantry.findOne({
      where: { userId, ingredientName: rowName },
    });

    let row;
    if (existing) {
      const updates: Record<string, unknown> = {};
      if (payload.quantity !== undefined) updates.quantity = payload.quantity;
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

  async markUsed(userId: UUID, ingredientName: string): Promise<void> {
    const row = await this.models.Pantry.findOne({ where: { userId, ingredientName } });
    if (row) {
      if (row.kind === 'leftover') {
        const servingsLeft = (row.servings as number | null) ?? 1;
        if (servingsLeft <= 1) {
          await row.destroy();
        } else {
          await row.update({ servings: servingsLeft - 1, lastUsedAt: new Date() });
        }
        return;
      }
      const qty = (row.quantity as number | null) ?? 1;
      await row.update({
        lastUsedAt: new Date(),
        quantity: Math.max(0, qty - 1),
      });
    }
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
      quantity: (plain.quantity as number | null) ?? null,
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
