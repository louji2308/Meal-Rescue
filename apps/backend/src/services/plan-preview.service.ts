import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';

import type { SubscriptionTier, UUID, MealSlot } from '@meal-rescue/shared-types';

import { User } from '../database/models/user.model';
import { MealPlan } from '../database/models/meal-plan.model';
import { MealEvent } from '../database/models/meal-event.model';
import { Household } from '../database/models/household.model';
import { AppError, ErrorCategory } from '../lib/errors';

/**
 * Interfaces for plan preview data structures
 */
export interface PlannedMeal {
  id: UUID;
  name: string;
  recipeName: string;
  ingredients: string[];
  servings: number;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  mealSlot: MealSlot;
}

export interface PlannedDay {
  dateKey: string;
  meals: PlannedMeal[];
}

export interface PlanPreview {
  id: UUID;
  userId: UUID;
  days: PlannedDay[];
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'confirmed' | 'expired';
}

export interface PlanPreviewResponse {
  previewId: UUID;
  days: PlannedDay[];
  expiresAt: Date;
  daysUsed: number;
  daysRemaining: number;
  tier: SubscriptionTier;
  requiresPayment: boolean;
  message: string;
}

export interface PlanLimitInfo {
  tier: SubscriptionTier;
  daysUsed: number;
  daysRemaining: number;
}

/**
 * PlanPreviewService - manages in-memory plan previews with TTL
 *
 * When the backend generates a meal plan, it stores it temporarily (15min TTL)
 * so the mobile app can show it in a popup for user review before saving.
 */
export class PlanPreviewService {
  private static readonly PREVIEW_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly FREE_PLAN_DAY_LIMIT = 3;

  private readonly store = new Map<string, PlanPreview>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Start the cleanup interval that removes expired previews
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredPreviews();
    }, PlanPreviewService.CLEANUP_INTERVAL_MS);

    // Allow Node.js to exit even if interval is running
    this.cleanupInterval.unref();
  }

  /**
   * Remove all expired previews from the store
   */
  private cleanupExpiredPreviews(): void {
    const now = new Date();
    for (const [id, preview] of this.store.entries()) {
      if (preview.expiresAt <= now || preview.status !== 'pending') {
        this.store.delete(id);
      }
    }
  }

  /**
   * Check the plan limit for a user
   */
  async checkPlanLimit(userId: UUID): Promise<PlanLimitInfo> {
    const user = await User.findByPk(userId, {
      attributes: ['subscriptionTier', 'planDaysUsed'],
    });

    if (!user) {
      throw AppError.notFound('User');
    }

    const tier = user.subscriptionTier;
    const daysUsed = user.planDaysUsed ?? 0;
    const daysRemaining =
      tier === 'pro' ? Number.POSITIVE_INFINITY : Math.max(0, PlanPreviewService.FREE_PLAN_DAY_LIMIT - daysUsed);

    return { tier, daysUsed, daysRemaining };
  }

  /**
   * Generate a plan preview and store it temporarily
   */
  async generatePreview(
    userId: UUID,
    planningResult: { days: PlannedDay[]; daysPlanned: number }
  ): Promise<PlanPreviewResponse> {
    const previewId = randomUUID() as UUID;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PlanPreviewService.PREVIEW_TTL_MS);

    const days = planningResult.days;

    const preview: PlanPreview = {
      id: previewId,
      userId,
      days,
      createdAt: now,
      expiresAt,
      status: 'pending',
    };

    this.store.set(previewId, preview);

    // Get current limit info
    const limitInfo = await this.checkPlanLimit(userId);

    const daysPlanned = planningResult.daysPlanned;
    const requiresPayment = limitInfo.tier === 'free' && limitInfo.daysRemaining < daysPlanned;
    const message = requiresPayment
      ? 'Free plan limit exceeded. Upgrade to Pro to confirm this plan.'
      : 'Plan preview generated. Review and confirm to save.';

    return {
      previewId,
      days,
      expiresAt,
      daysUsed: limitInfo.daysUsed,
      daysRemaining: limitInfo.daysRemaining,
      tier: limitInfo.tier,
      requiresPayment,
      message,
    };
  }

  /**
   * Get a preview by ID
   */
  getPreview(previewId: UUID): PlanPreview | undefined {
    const preview = this.store.get(previewId);
    
    // Check if preview exists and is still valid
    if (!preview) {
      return undefined;
    }

    if (preview.expiresAt <= new Date() || preview.status !== 'pending') {
      this.store.delete(previewId);
      return undefined;
    }

    return preview;
  }

  /**
   * Confirm a plan preview, optionally with edits
   */
  async confirmPreview(
    previewId: UUID,
    edits?: string
  ): Promise<{ success: boolean; preview: PlanPreview }> {
    const preview = this.getPreview(previewId);

    if (!preview) {
      throw AppError.notFound('Plan preview');
    }

    // Check plan limit before confirming
    const limitInfo = await this.checkPlanLimit(preview.userId);

    const daysCount = preview.days.length;
    if (limitInfo.daysRemaining < daysCount && limitInfo.tier === 'free') {
      throw new AppError({
        category: ErrorCategory.FORBIDDEN,
        code: 'PLAN_LIMIT_EXCEEDED',
        message: 'Free plan day limit exceeded. Upgrade to Pro for unlimited planning.',
        statusCode: 403,
        recoverable: false,
        suggestedAction: 'Upgrade to Pro plan',
      });
    }

    // Get household for the user
    const user = await User.findByPk(preview.userId, {
      include: [{ model: Household, as: 'households', required: false }],
    });

    if (!user) {
      throw AppError.notFound('User');
    }

    const households = (user as { households?: Household[] }).households;
    const household = households?.[0];
    if (!household) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found for user',
        statusCode: 404,
      });
    }

    const householdId = household.id;

    // Determine weekStart from the first day
    const weekStart = preview.days[0]?.dateKey;
    if (!weekStart) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_PLAN_DATA',
        message: 'Plan has no days',
        statusCode: 400,
      });
    }

    // Supersede any existing plans for this household/week
    const previousPlans = await MealPlan.findAll({
      where: {
        householdId,
        weekStart,
        status: { [Op.in]: ['proposed', 'confirmed', 'declined'] },
      },
    });
    const previousIds = previousPlans.map((p) => p.id);
    if (previousIds.length > 0) {
      await MealEvent.destroy({
        where: { planId: { [Op.in]: previousIds }, kind: 'plan' },
      });
      await MealPlan.update(
        { status: 'superseded' },
        { where: { id: { [Op.in]: previousIds } } },
      );
    }

    // Create the MealPlan
    const planId = randomUUID();
    const _plan = await MealPlan.create({
      id: planId,
      householdId,
      ownerId: preview.userId,
      status: 'confirmed',
      weekStart,
      source: 'plan_week',
      createdAt: new Date(),
    });

    // Create MealEvent rows for each meal
    for (const day of preview.days) {
      for (const meal of day.meals) {
        await MealEvent.create({
          id: meal.id,
          householdId,
          planId,
          userId: preview.userId,
          dateKey: day.dateKey,
          mealSlot: meal.mealSlot,
          kind: 'plan',
          concept: meal.name,
          conceptType: 'recipe',
          state: 'CONFIRMED',
          slotStatus: 'LOCKED',
          flexible: false,
          ingredients: meal.ingredients,
          reasons: edits ? [edits] : undefined,
          effort: meal.prepTimeMinutes > 30 ? 'high' : meal.prepTimeMinutes > 15 ? 'medium' : 'low',
          rawText: edits ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Mark preview as confirmed
    preview.status = 'confirmed';
    this.store.set(previewId, preview);

    // Increment user's planDaysUsed
    await User.update(
      { planDaysUsed: User.sequelize!.literal(`planDaysUsed + ${daysCount}`) },
      { where: { id: preview.userId } }
    );

    return {
      success: true,
      preview,
    };
  }

  /**
   * Clean up resources (for testing or shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// Export a singleton instance
export const planPreviewService = new PlanPreviewService();
