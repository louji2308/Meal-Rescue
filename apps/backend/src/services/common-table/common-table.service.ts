import { randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';

import type {
  CommonTableCompleteRequest,
  CommonTableFeedbackRequest,
  CommonTableFeedbackResponse,
  CommonTableRequest,
  CommonTableResult,
  CommonTableStatus,
  FinishResultStatus,
  HouseholdMemberProfile,
  SharedMealPlan,
  UUID,
} from '@meal-rescue/shared-types';
import { ErrorCategory } from '@meal-rescue/shared-types';

import { sequelize } from '../../database';
import type { Db } from '../../database/models';
import { toPlan } from '../../database/models/shared-meal.model';
import { AppError } from '../../lib/errors';
import type { LlmClient } from '../ai/llm-client';
import { VisionService } from '../ai/vision.service';
import { CommonTableAiService } from './common-table-ai.service';
import { ConvergenceEngineService, toSharedMealPlan } from './convergence-engine.service';
import { HouseholdConstraintService } from './household-constraint.service';
import { HouseholdMemberService } from './household-member.service';
import { HouseholdTasteService } from './household-taste.service';
import { HouseholdService } from './household.service';
import { TableEventService } from './table-event.service';
import { TableOutcomeService } from './table-outcome.service';

/**
 * CommonTableService — orchestration root for a shared common-table session.
 *
 * One deterministic engine decides WHAT is cooked; AI is only allowed to
 * polish naming/copy AFTER the plan is built and is never allowed to change
 * the ingredient set. The plan + split point + per-member finishes are
 * persisted so the client can leave and come back mid-cook.
 */
export class CommonTableService {
  private readonly models: Db['models'];
  private readonly households: HouseholdService;
  private readonly members: HouseholdMemberService;
  private readonly taste: HouseholdTasteService;
  private readonly constraints: HouseholdConstraintService;
  private readonly engine: ConvergenceEngineService;
  private readonly ai: CommonTableAiService;
  private readonly outcomes: TableOutcomeService;
  private readonly events: TableEventService;
  private readonly vision: VisionService;

  constructor(models: Db['models'], llm: LlmClient, redis: Redis | null = null) {
    this.models = models;
    this.households = new HouseholdService(models);
    this.members = new HouseholdMemberService(models);
    this.taste = new HouseholdTasteService(models);
    this.constraints = new HouseholdConstraintService();
    this.engine = new ConvergenceEngineService(this.constraints);
    this.ai = new CommonTableAiService(llm);
    this.outcomes = new TableOutcomeService(models);
    this.events = new TableEventService(models);
    this.vision = new VisionService(llm, redis);
  }

  /**
   * Core endpoint: household → selected members → resolved taste contexts →
   * ingredient intake → deterministic convergence → persisted plan.
   */
  async converge(userId: UUID, request: CommonTableRequest): Promise<CommonTableResult> {
    const household = await this.households.getOrCreateForUser(userId);
    const allMembers = await this.members.listForHousehold(household.id);

    // Resolve which members eat at this table.
    const requested = new Set(request.memberIds ?? []);
    const selected =
      requested.size > 0
        ? allMembers.filter((m) => requested.has(m.id) && m.active !== false)
        : allMembers.filter((m) => m.active !== false);

    if (selected.length === 0) {
      throw AppError.badRequest('MEMBER_REQUIRED', 'Select at least one household member');
    }
    const memberIds = selected.map((m) => m.id);

    const contexts = await this.taste.buildContext(memberIds);

    // Ingredient intake.
    const ingredients = await this.resolveIngredients(userId, request);
    const source = request.imageBase64
      ? 'image'
      : (request.ingredientSource ?? (ingredients.length > 0 ? 'text' : 'any'));

    const convergence = this.engine.converge({
      members: contexts,
      providedIngredients: ingredients,
      source,
      effort: request.effort ?? 'normal',
      timeMinutes: request.timeMinutes,
      shoppingAllowed: request.shoppingAllowed ?? false,
    });

    let plan: SharedMealPlan | null = null;
    if (convergence.winner) {
      plan = toSharedMealPlan(convergence.winner);
      plan = await this.ai.polish(plan);
    }

    const sharedMealId = plan
      ? await this.persistPlan(household.id, userId, selected, plan, convergence.blockedIngredients)
      : null;

    await this.recordSessionEvents(sharedMealId, request, convergence);

    return {
      sharedMealId: sharedMealId ?? randomUUID(),
      status: plan ? 'converged' : 'failed',
      householdId: household.id,
      memberIds,
      converged: plan !== null,
      plan,
      fallback: convergence.fallback,
      blockedIngredients: convergence.blockedIngredients,
    };
  }

  async get(userId: UUID, sharedMealId: UUID): Promise<CommonTableResult> {
    const meal = await this.models.SharedMeal.findByPk(sharedMealId);
    if (!meal || meal.ownerId !== userId) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'SHARED_MEAL_NOT_FOUND',
        message: 'Shared meal not found',
        statusCode: 404,
        recoverable: true,
      });
    }

    const memberRows = await this.models.SharedMealMember.findAll({
      where: { sharedMealId },
    });

    return {
      sharedMealId: meal.id,
      status: meal.status,
      householdId: meal.householdId,
      memberIds: memberRows.map((r) => r.memberId),
      converged: meal.status !== 'failed',
      plan: meal.status === 'failed' ? null : toPlan(meal),
      fallback: meal.survey && meal.survey.fallback ? meal.survey.fallback : null,
      blockedIngredients: meal.blockedIngredients ?? [],
      finishStatuses: memberRows.map((r) => ({
        memberId: r.memberId,
        status: r.status as FinishResultStatus,
      })),
    };
  }

  async startCooking(userId: UUID, sharedMealId: UUID): Promise<CommonTableResult> {
    return this.transition(userId, sharedMealId, 'cooking');
  }

  async splitReached(userId: UUID, sharedMealId: UUID): Promise<CommonTableResult> {
    return this.transition(userId, sharedMealId, 'split');
  }

  async complete(
    userId: UUID,
    sharedMealId: UUID,
    request: CommonTableCompleteRequest,
  ): Promise<{ sharedMealId: UUID; status: CommonTableStatus }> {
    const meal = await this.models.SharedMeal.findByPk(sharedMealId);
    if (!meal || meal.ownerId !== userId) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'SHARED_MEAL_NOT_FOUND',
        message: 'Shared meal not found',
        statusCode: 404,
        recoverable: true,
      });
    }

    const statusById = new Map((request.finishResults ?? []).map((r) => [r.memberId, r.status]));

    await sequelize.transaction(async (transaction) => {
      const rows = await this.models.SharedMealMember.findAll({
        where: { sharedMealId },
        transaction,
      });
      for (const row of rows) {
        const next = statusById.get(row.memberId);
        if (next) await row.update({ status: next }, { transaction });
      }
      await meal.update({ status: 'completed', completedAt: new Date() }, { transaction });
    });

    await this.events.record(sharedMealId, 'common_table_completed');
    return { sharedMealId, status: 'completed' };
  }

  async feedback(
    userId: UUID,
    sharedMealId: UUID,
    request: CommonTableFeedbackRequest,
  ): Promise<CommonTableFeedbackResponse> {
    await this.outcomes.record(userId, sharedMealId, request);
    return { recorded: true };
  }

  // -------------------------------------------------------------------------

  private async transition(
    userId: UUID,
    sharedMealId: UUID,
    status: Extract<CommonTableStatus, 'cooking' | 'split'>,
  ): Promise<CommonTableResult> {
    const meal = await this.models.SharedMeal.findByPk(sharedMealId);
    if (!meal || meal.ownerId !== userId) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'SHARED_MEAL_NOT_FOUND',
        message: 'Shared meal not found',
        statusCode: 404,
        recoverable: true,
      });
    }

    if (meal.status === 'completed' || meal.status === 'failed') {
      return this.get(userId, sharedMealId);
    }

    await meal.update({ status });
    await this.events.record(
      sharedMealId,
      status === 'cooking' ? 'common_table_started_cooking' : 'common_table_split_reached',
    );
    return this.get(userId, sharedMealId);
  }

  private async resolveIngredients(userId: UUID, request: CommonTableRequest): Promise<string[]> {
    if (request.imageBase64) {
      const buffer = Buffer.from(request.imageBase64, 'base64');
      const analysis = await this.vision.analyzeImage(buffer);
      return (analysis.ingredients ?? []).map((i) => i.name);
    }

    if (request.ingredientSource === 'kitchen') {
      const pantryRows = await this.models.Pantry.findAll({
        where: { userId },
        attributes: ['ingredientName'],
      });
      const pantryNames = pantryRows.map((r) => r.ingredientName);
      return [...new Set([...pantryNames, ...(request.ingredients ?? [])])];
    }

    return request.ingredients ?? [];
  }

  private async persistPlan(
    householdId: UUID,
    ownerId: UUID,
    selected: HouseholdMemberProfile[],
    plan: SharedMealPlan,
    blockedIngredients: string[],
  ): Promise<UUID> {
    const sharedMealId = randomUUID();

    await sequelize.transaction(async (transaction) => {
      await this.models.SharedMeal.create(
        {
          id: sharedMealId,
          householdId,
          ownerId,
          status: 'converged',
          baseName: plan.baseName,
          baseDescription: plan.baseDescription,
          estimatedMinutes: plan.estimatedMinutes,
          effort: plan.effort,
          equipment: plan.equipment,
          splitPointIndex: plan.splitPointIndex,
          sharedSteps: plan.sharedSteps,
          branchSteps: plan.branchSteps,
          finishes: plan.finishes,
          ingredients: plan.ingredients,
          blockedIngredients,
        },
        { transaction },
      );

      for (const member of selected) {
        await this.models.SharedMealMember.create(
          {
            sharedMealId,
            memberId: member.id,
            memberName: member.displayName,
            role: member.relationship,
            status: 'pending',
          },
          { transaction },
        );
      }
    });

    return sharedMealId;
  }

  private async recordSessionEvents(
    sharedMealId: UUID | null,
    request: CommonTableRequest,
    convergence: ReturnType<ConvergenceEngineService['converge']>,
  ): Promise<void> {
    if (!sharedMealId) return;
    await this.events.record(sharedMealId, 'common_table_started');
    await this.events.record(sharedMealId, 'common_table_household_selected', {
      memberCount: request.memberIds?.length ?? 0,
    });
    await this.events.record(sharedMealId, 'common_table_input_received', {
      source: request.imageBase64
        ? 'image'
        : (request.ingredientSource ?? (request.ingredients?.length ? 'text' : 'any')),
    });
    await this.events.record(sharedMealId, 'common_table_convergence_generated', {
      converged: convergence.converged,
      evaluated: convergence.evaluated,
    });
    if (convergence.converged) {
      await this.events.record(sharedMealId, 'common_table_split_point_generated');
    }
  }
}
