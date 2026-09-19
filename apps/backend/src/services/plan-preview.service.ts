import { randomUUID } from 'node:crypto';

import type { PlanningResult, SubscriptionTier, UUID } from '@meal-rescue/shared-types';

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
    // In a real implementation, this would fetch from the database
    // For now, we'll return placeholder values based on the user's tier
    // The actual database lookup would be done by the calling service
    return {
      tier: 'free' as SubscriptionTier,
      daysUsed: 0,
      daysRemaining: PlanPreviewService.FREE_PLAN_DAY_LIMIT,
    };
  }

  /**
   * Generate a plan preview and store it temporarily
   */
  async generatePreview(
    userId: UUID,
    planningResult: PlanningResult
  ): Promise<PlanPreviewResponse> {
    const previewId = randomUUID() as UUID;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PlanPreviewService.PREVIEW_TTL_MS);

    // Convert PlanningResult to PlannedDay format
    const days: PlannedDay[] = this.convertPlanningResultToDays(planningResult);

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

    return {
      previewId,
      days,
      expiresAt,
      daysUsed: limitInfo.daysUsed,
      daysRemaining: limitInfo.daysRemaining,
      tier: limitInfo.tier,
    };
  }

  /**
   * Convert PlanningResult to PlannedDay format
   */
  private convertPlanningResultToDays(result: PlanningResult): PlannedDay[] {
    if (!result.plan) {
      return [];
    }

    // This is a simplified conversion - in reality, the PlanningResult structure
    // would need to be properly mapped to PlannedDay format
    // For now, return an empty array as the actual mapping depends on the
    // specific PlanningResult structure from the AI planning service
    return [];
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
    edits?: Partial<PlanPreview>
  ): Promise<{ success: boolean; preview: PlanPreview }> {
    const preview = this.getPreview(previewId);

    if (!preview) {
      throw AppError.notFound('Plan preview');
    }

    // Check plan limit before confirming
    const limitInfo = await this.checkPlanLimit(preview.userId);

    if (limitInfo.daysRemaining <= 0 && limitInfo.tier === 'free') {
      throw new AppError({
        category: ErrorCategory.FORBIDDEN,
        code: 'PLAN_LIMIT_EXCEEDED',
        message: 'Free plan day limit exceeded. Upgrade to Pro for unlimited planning.',
        statusCode: 403,
        recoverable: false,
        suggestedAction: 'Upgrade to Pro plan',
      });
    }

    // Apply edits if provided
    if (edits) {
      Object.assign(preview, edits);
    }

    // Mark as confirmed
    preview.status = 'confirmed';

    // Update the store
    this.store.set(previewId, preview);

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
