import { randomUUID } from 'node:crypto';

import type {
  PantryDeleteResponse,
  PantryGetResponse,
  PantryItem,
  PantryUpsertRequest,
  SuggestedUse,
  UUID,
} from '@meal-rescue/shared-types';

import type { Db } from '../database/models';
import { AppError, ErrorCategory } from '../lib/errors';
import { CandidateGeneratorService } from './candidate-generator.service';

const EXPIRY_SOON_DAYS = 3;
const LOW_STOCK_THRESHOLD = 0.5;

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
        isLowStock: plain.quantity !== null && plain.quantity <= LOW_STOCK_THRESHOLD,
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
    const existing = await this.models.Pantry.findOne({
      where: { userId, ingredientName: payload.ingredientName },
    });

    let row;
    if (existing) {
      const updates: Record<string, unknown> = {};
      if (payload.quantity !== undefined) updates.quantity = payload.quantity;
      if (payload.unit !== undefined) updates.unit = payload.unit;
      if (payload.expiresAt !== undefined)
        updates.expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
      if (payload.usePriority !== undefined) updates.usePriority = payload.usePriority;
      updates.lastUsedAt = new Date();
      await existing.update(updates);
      row = existing;
    } else {
      row = await this.models.Pantry.create({
        id: randomUUID(),
        userId,
        ingredientName: payload.ingredientName,
        quantity: payload.quantity ?? null,
        unit: payload.unit ?? null,
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
      if (item.isLowStock) {
        suggestions.push({
          ingredientName: item.ingredientName,
          reason: 'Running low — consider restocking',
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
      isLowStock:
        (plain.quantity as number | null) !== null &&
        (plain.quantity as number) <= LOW_STOCK_THRESHOLD,
    };
  }
}
