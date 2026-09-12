/**
 * MealMemoryService — the agent orchestrator.
 *
 * Public surface: pure, typed operations the routes expose. Every free-text
 * entry funnels through handleIntent/confirm, which persist a
 * meal_memory_event ledger row and route the resolved intent to a bounded
 * action. All mutations are change-only against the calendar; history
 * (kind='actual') is never rewritten.
 */
import { randomUUID } from 'node:crypto';

import { Op } from 'sequelize';

import type {
  FoodWorldState,
  IntentResolution,
  InventoryReservation,
  MealEvent,
  MealMemoryConfirmResponse,
  MealMemoryCreateRuleRequest,
  MealMemoryDay,
  MealMemoryFeedbackRequest,
  MealMemoryFeedbackResponse,
  MealMemoryIntentResponse,
  MealMemoryMealDetailResponse,
  MealMemoryMoveMealRequest,
  MealMemoryRecordActualRequest,
  MealMemoryRecordActualResponse,
  MealMemoryRememberRequest,
  MealMemoryRememberResponse,
  MealMemoryRulesResponse,
  MealMemorySlotView,
  MealMemoryUpdateMealRequest,
  MealMemoryWeekResponse,
  MealRule,
  MealSlot,
  MemoryActionResult,
  PlanWeekRequest,
  PlanWeekResponse,
  PurchaseSuggestion,
  UUID,
} from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';
import { AppError, ErrorCategory } from '../../lib/errors';
import { HouseholdService } from '../common-table/household.service';
import { AccountingService } from './accounting.service';
import { addDays, dateKeyFor, nextWeekStartFor, weekStartFor } from './date-utils';
import {
  MUTATIONS_ALWAYS_CONFIRMED,
  buildClarificationPrompt,
  classifyIntent,
} from './intent-classifier';
import { toMealEvent } from './mappers';
import { MealMemoryAiService } from './meal-memory-ai.service';
import { MemoryLearningService } from './memory-learning.service';
import { type PlanParams, type PlanStrategy, PlanningEngine } from './planning-engine';
import { WorldStateService } from './world-state.service';

const DEFAULT_WEEK_MEAL_SLOTS: MealSlot[] = ['dinner', 'lunch'];
const DEFAULT_INTENT_MEAL_SLOT: MealSlot = 'dinner';

export class MealMemoryService {
  private readonly models: Db['models'];
  private readonly worldStateService: WorldStateService;
  private readonly planningEngine: PlanningEngine;
  private readonly memoryLearningService: MemoryLearningService;
  private readonly accountingService: AccountingService;
  private readonly householdService: HouseholdService;
  private readonly aiService: MealMemoryAiService | null;

  constructor(deps: {
    models: Db['models'];
    worldStateService: WorldStateService;
    planningEngine: PlanningEngine;
    memoryLearningService: MemoryLearningService;
    accountingService: AccountingService;
    householdService: HouseholdService;
    aiService?: MealMemoryAiService | null;
  }) {
    this.models = deps.models;
    this.worldStateService = deps.worldStateService;
    this.planningEngine = deps.planningEngine;
    this.memoryLearningService = deps.memoryLearningService;
    this.accountingService = deps.accountingService;
    this.householdService = deps.householdService;
    this.aiService = deps.aiService ?? null;
  }

  // -- intent entry -----------------------------------------------------------

  async handleIntent(userId: UUID, text: string): Promise<MealMemoryIntentResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const members = await this.models.HouseholdMember.findAll({
      where: { householdId, active: true },
    });
    const todayKey = dateKeyFor(new Date(), 0);

    let resolution = classifyIntent(text, {
      todayKey,
      memberNames: members.map((m) => m.get('displayName') as string),
    });
    if (this.aiService && !resolution.requiresClarification) {
      resolution = await this.aiService.refineIntent(resolution, text);
    }

    const intentId = randomUUID();
    const readOnly = this.isReadOnly(resolution.intent);

    let status: MealMemoryIntentResponse['status'] = 'question';
    let result: MemoryActionResult | null = null;
    const clarification = buildClarificationPrompt(resolution);

    if (resolution.requiresClarification) {
      status = 'clarification';
    } else if (readOnly) {
      const world = await this.worldStateService.getState(householdId, userId);
      result = await this.answerReadOnly(resolution, world);
      status = 'question';
    } else if (
      resolution.confidenceBand === 'HIGH' &&
      !MUTATIONS_ALWAYS_CONFIRMED.has(resolution.intent)
    ) {
      result = await this.executeAction(userId, householdId, resolution);
      status = 'actioned';
    } else {
      status = 'awaiting_confirmation';
    }

    await this.recordMemoryEvent({
      intentId,
      userId,
      householdId,
      resolution,
      status,
    });

    return {
      intentId,
      status,
      resolution,
      clarification,
      result,
    };
  }

  async confirm(userId: UUID, intentId: UUID, answer: string): Promise<MealMemoryConfirmResponse> {
    const event = await this.models.MealMemoryEvent.findOne({
      where: { id: intentId, userId },
    });
    if (!event) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'MEAL_MEMORY_EVENT_NOT_FOUND',
        message: 'Intent not found',
        statusCode: 404,
        recoverable: false,
      });
    }
    const householdId =
      (event.get('householdId') as UUID) ?? (await this.requireHouseholdId(userId));
    const rawText = `${event.get('rawText') as string} ${answer}`.trim();
    const members = await this.models.HouseholdMember.findAll({
      where: { householdId, active: true },
    });
    const todayKey = dateKeyFor(new Date(), 0);

    let resolution = classifyIntent(rawText, {
      todayKey,
      memberNames: members.map((m) => m.get('displayName') as string),
    });
    if (this.aiService && !resolution.requiresClarification) {
      resolution = await this.aiService.refineIntent(resolution, rawText);
    }

    if (resolution.requiresClarification) {
      await event.update({
        status: 'clarification',
        entities: resolution.entities as unknown as Record<string, unknown>,
      });
      return {
        intentId,
        status: 'clarification',
        resolution,
        clarification: buildClarificationPrompt(resolution),
        result: null,
      };
    }

    const result = await this.executeAction(userId, householdId, resolution);
    await event.update({
      status: 'actioned',
      entities: resolution.entities as unknown as Record<string, unknown>,
    });

    return {
      intentId,
      status: 'actioned',
      resolution,
      clarification: null,
      result,
    };
  }

  // -- direct operations -------------------------------------------------------

  async planWeek(userId: UUID, input: PlanWeekRequest): Promise<PlanWeekResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const todayKey = dateKeyFor(new Date(), 0);
    const weekStart = input.weekStart ?? weekStartFor(todayKey);
    const strategy: PlanStrategy = input.strategy ?? 'balance';
    const world = await this.worldStateService.getState(householdId, userId);
    const params: PlanParams = {
      weekStart,
      mealSlots: input.mealSlots?.length ? input.mealSlots : DEFAULT_WEEK_MEAL_SLOTS,
      strategy,
      ownerUserId: userId,
    };
    let result = await this.planningEngine.planWeek(world, params);
    if (this.aiService) result = await this.aiService.polishPlan(result);
    return { result };
  }

  async getWeek(userId: UUID, weekStart?: string): Promise<MealMemoryWeekResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const todayKey = dateKeyFor(new Date(), 0);
    const start = weekStart ?? weekStartFor(todayKey);
    const rows = await this.models.MealEvent.findAll({
      where: {
        householdId,
        dateKey: { [Op.gte]: start, [Op.lte]: addDays(start, 6) },
      },
      order: [
        ['dateKey', 'ASC'],
        ['mealSlot', 'ASC'],
      ],
    });
    const events = rows.map(toMealEvent);

    const days: MealMemoryDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dateKey = addDays(start, i);
      const slotKeys: { key: MealSlot; view: MealMemorySlotView }[] = [];
      for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]) {
        const planned =
          events.find((e) => e.kind === 'plan' && e.dateKey === dateKey && e.mealSlot === slot) ??
          null;
        const actual =
          events.find((e) => e.kind === 'actual' && e.dateKey === dateKey && e.mealSlot === slot) ??
          null;
        slotKeys.push({
          key: slot,
          view: {
            dateKey,
            mealSlot: slot,
            slotStatus: planned?.slotStatus ?? actual?.slotStatus ?? 'OPEN',
            planned,
            actual,
          },
        });
      }
      days.push({ dateKey, slots: slotKeys.map((s) => s.view) });
    }
    return { weekStart: start, days };
  }

  async getMealDetail(userId: UUID, eventId: UUID): Promise<MealMemoryMealDetailResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const event = await this.loadEvent(householdId, eventId);
    const world = await this.worldStateService.getState(householdId, userId);
    const kitchenItems = world.inventory.filter((item) =>
      event.ingredients?.some((ing) => item.name.toLowerCase() === ing.toLowerCase()),
    );
    return {
      event,
      kitchenItems,
      substitutions: event.ingredients ?? [],
    };
  }

  async updateMeal(
    userId: UUID,
    eventId: UUID,
    input: MealMemoryUpdateMealRequest,
  ): Promise<MealEvent> {
    const householdId = await this.requireHouseholdId(userId);
    const row = await this.loadEventRow(householdId, eventId);
    const updates: Record<string, unknown> = {};
    if (input.concept !== undefined) updates.concept = input.concept.trim();
    if (input.mealSlot !== undefined) updates.mealSlot = input.mealSlot;
    if (input.dateKey !== undefined) updates.dateKey = input.dateKey;
    if (input.state !== undefined) updates.state = input.state;
    if (input.slotStatus !== undefined) updates.slotStatus = input.slotStatus;
    if (input.memberIds !== undefined) updates.memberIds = input.memberIds;
    if (input.effort !== undefined) updates.effort = input.effort;
    await row.update({ ...updates, updatedAt: new Date() });
    return toMealEvent(row);
  }

  async moveMeal(
    userId: UUID,
    eventId: UUID,
    input: MealMemoryMoveMealRequest,
  ): Promise<MealEvent> {
    const householdId = await this.requireHouseholdId(userId);
    const row = await this.loadEventRow(householdId, eventId);
    if (row.get('kind') !== 'plan') {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'ONLY_PLAN_MOVABLE',
        message: 'Only planned meals can be moved',
        statusCode: 400,
        recoverable: false,
      });
    }
    const targetSlot = input.mealSlot ?? (row.get('mealSlot') as MealSlot);
    const targetKey = input.dateKey;
    if (targetKey === row.get('dateKey') && targetSlot === row.get('mealSlot')) {
      return toMealEvent(row);
    }
    const conflict = await this.models.MealEvent.findOne({
      where: {
        householdId,
        dateKey: targetKey,
        mealSlot: targetSlot,
        kind: 'plan',
        id: { [Op.ne]: eventId },
      },
    });
    if (conflict) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'SLOT_OCCUPIED',
        message: 'That slot already has a planned meal',
        statusCode: 409,
        recoverable: true,
      });
    }
    const oldDate = row.get('dateKey') as string;
    const oldSlot = row.get('mealSlot') as MealSlot;
    await row.update({
      dateKey: targetKey,
      mealSlot: targetSlot,
      movedFrom: { dateKey: oldDate, mealSlot: oldSlot },
      state: 'MOVED',
      updatedAt: new Date(),
    });
    return toMealEvent(row);
  }

  async removeMeal(userId: UUID, eventId: UUID): Promise<MealEvent> {
    const householdId = await this.requireHouseholdId(userId);
    const row = await this.loadEventRow(householdId, eventId);
    await row.update({ state: 'CANCELLED', slotStatus: 'OPEN', updatedAt: new Date() });
    return toMealEvent(row);
  }

  async recordActual(
    userId: UUID,
    input: MealMemoryRecordActualRequest,
  ): Promise<MealMemoryRecordActualResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const todayKey = dateKeyFor(new Date(), 0);
    const dateKey = input.dateKey ?? todayKey;
    const mealSlot = input.mealSlot ?? DEFAULT_INTENT_MEAL_SLOT;
    const planRow = await this.models.MealEvent.findOne({
      where: { householdId, dateKey, mealSlot, kind: 'plan' },
    });

    const existing = await this.models.MealEvent.findOne({
      where: { householdId, dateKey, mealSlot, kind: 'actual' },
    });

    const state = input.skipped
      ? 'SKIPPED'
      : input.cancelled
        ? 'CANCELLED'
        : input.ate === false
          ? 'SKIPPED'
          : 'EATEN';
    const concept = input.concept ?? (planRow?.get('concept') as string | null) ?? null;

    let row: InstanceType<Db['models']['MealEvent']>;
    if (existing) {
      await existing.update({
        state,
        concept: concept ?? existing.get('concept'),
        rawText: null,
        updatedAt: new Date(),
      });
      row = existing;
    } else {
      row = await this.models.MealEvent.create({
        id: randomUUID(),
        householdId,
        planId: planRow ? (planRow.get('id') as string) : null,
        userId,
        dateKey,
        mealSlot,
        kind: 'actual',
        concept,
        conceptType: concept ? 'custom' : null,
        state,
        slotStatus: 'OPEN',
        flexible: false,
        horizon: null,
        excludedDays: null,
        preferredDays: null,
        mealRole: null,
        ingredients: planRow?.get('ingredients') ?? null,
        memberIds: planRow?.get('memberIds') ?? null,
        reasons: planRow?.get('reasons') ?? null,
        effort: planRow?.get('effort') ?? null,
        rawText: null,
        movedFrom: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return { event: toMealEvent(row) };
  }

  async remember(
    userId: UUID,
    input: MealMemoryRememberRequest,
  ): Promise<MealMemoryRememberResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const eventId = input.mealEventId ?? null;
    let event: MealEvent | null = null;
    if (eventId) {
      const row = await this.loadEventRow(householdId, eventId);
      event = toMealEvent(row);
    }
    if (!event) {
      // Remember the most recent actual meal if none was specified.
      const recent = await this.models.MealEvent.findOne({
        where: { householdId, kind: 'actual' },
        order: [['dateKey', 'DESC']],
      });
      if (recent) event = toMealEvent(recent);
    }
    if (!event) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'NO_MEAL_TO_REMEMBER',
        message: 'No meal found to remember',
        statusCode: 404,
        recoverable: true,
      });
    }
    const messages = await this.memoryLearningService.remember({
      ownerUserId: userId,
      memberIds: input.memberIds,
      event,
      sentiment: input.sentiment,
      note: input.note,
    });
    return { remembered: true, eventId: event.id, messages };
  }

  async createRule(userId: UUID, input: MealMemoryCreateRuleRequest): Promise<MealRule> {
    const householdId = await this.requireHouseholdId(userId);
    const { rule } = await this.accountingService.createRule({
      householdId,
      userId,
      request: input,
    });
    return rule;
  }

  async listRules(userId: UUID): Promise<MealMemoryRulesResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const rules = await this.accountingService.activeRules(householdId);
    return { rules };
  }

  async feedback(
    userId: UUID,
    input: MealMemoryFeedbackRequest,
  ): Promise<MealMemoryFeedbackResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const row = await this.loadEventRow(householdId, input.mealEventId);
    await this.memoryLearningService.feedback({
      ownerUserId: userId,
      memberIds: input.memberIds,
      event: toMealEvent(row),
      rating: input.rating,
      notes: input.notes,
    });
    return { recorded: true };
  }

  // -- internals ----------------------------------------------------------------

  private async executeAction(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    switch (resolution.intent) {
      case 'PLAN_WEEK':
      case 'REPLAN':
        return this.actionPlanWeek(userId, householdId, resolution);
      case 'SCHEDULE':
        return this.actionSchedule(userId, householdId, resolution);
      case 'RECORD_ACTUAL_MEAL':
        return this.actionRecordActual(userId, householdId, resolution);
      case 'MOVE_MEAL':
        return this.actionMove(userId, householdId, resolution);
      case 'REMOVE_MEAL':
        return this.actionRemove(userId, householdId, resolution);
      case 'MODIFY_SCHEDULE':
        return this.actionModifySchedule(userId, householdId, resolution);
      case 'BLOCK_TIME':
        return this.actionBlockTime(userId, householdId, resolution);
      case 'SET_RULE':
        return this.actionSetRule(userId, householdId, resolution);
      case 'REMEMBER':
        return this.actionRemember(userId, householdId, resolution);
      case 'MODIFY_INVENTORY_INTENT':
        return this.actionInventory(userId, householdId, resolution);
      default:
        return {
          message: 'Done — nothing to change.',
          mealEvents: [],
          plan: null,
          rule: null,
          reservation: null,
          purchaseSuggestions: [],
        };
    }
  }

  private async actionPlanWeek(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    const todayKey = dateKeyFor(new Date(), 0);
    const weekStart = resolution.entities.targetDate
      ? weekStartFor(resolution.entities.targetDate)
      : resolution.entities.targetHorizon === 'next week'
        ? nextWeekStartFor(todayKey)
        : weekStartFor(todayKey);
    const world = await this.worldStateService.getState(householdId, userId);
    const params: PlanParams = {
      weekStart,
      mealSlots: DEFAULT_WEEK_MEAL_SLOTS,
      strategy: resolution.entities.effort === 'low' ? 'easy' : 'balance',
      ownerUserId: userId,
    };
    let result = await this.planningEngine.planWeek(world, params);
    if (this.aiService) result = await this.aiService.polishPlan(result);
    return {
      message: `Planned ${result.plan?.meals.length ?? 0} meals for the week of ${weekStart}.`,
      mealEvents: [],
      plan: result.plan,
      rule: null,
      reservation: null,
      purchaseSuggestions: result.purchaseSuggestions,
    };
  }

  private async actionSchedule(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    const dateKey = resolution.entities.targetDate ?? dateKeyFor(new Date(), 0);
    const mealSlot = resolution.entities.mealSlot ?? DEFAULT_INTENT_MEAL_SLOT;
    const concept = resolution.entities.mealConcept ?? 'Something easy';
    const existing = await this.models.MealEvent.findOne({
      where: { householdId, dateKey, mealSlot, kind: 'plan' },
    });
    let row: InstanceType<Db['models']['MealEvent']>;
    if (existing) {
      await existing.update({ concept, state: 'PLANNED', updatedAt: new Date() });
      row = existing;
    } else {
      row = await this.models.MealEvent.create({
        id: randomUUID(),
        householdId,
        planId: null,
        userId,
        dateKey,
        mealSlot,
        kind: 'plan',
        concept,
        conceptType: 'custom',
        state: 'PLANNED',
        slotStatus: 'OPEN',
        flexible: false,
        horizon: null,
        excludedDays: null,
        preferredDays: null,
        mealRole: null,
        ingredients: null,
        memberIds: null,
        reasons: null,
        effort: resolution.entities.effort,
        rawText: resolution.rawText,
        movedFrom: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return {
      message: `${concept} is on for ${mealSlot} ${dateKey}.`,
      mealEvents: [toMealEvent(row)],
      plan: null,
      rule: null,
      reservation: null,
      purchaseSuggestions: [],
    };
  }

  private async actionRecordActual(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    const dateKey = resolution.entities.targetDate ?? dateKeyFor(new Date(), 0);
    const mealSlot = resolution.entities.mealSlot ?? DEFAULT_INTENT_MEAL_SLOT;
    const skipped = /skipped|didn'?t eat|didn'?t have|no (dinner|lunch)/i.test(resolution.rawText);
    const result = await this.recordActual(userId, {
      dateKey,
      mealSlot,
      concept: resolution.entities.mealConcept ?? undefined,
      skipped,
    });
    return {
      message: skipped
        ? `Recorded ${mealSlot} on ${dateKey} as skipped.`
        : `Recorded ${result.event.concept ?? mealSlot} on ${dateKey}.`,
      mealEvents: [result.event],
      plan: null,
      rule: null,
      reservation: null,
      purchaseSuggestions: [],
    };
  }

  private async actionMove(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    const moveTarget = resolution.entities.moveTarget;
    const source = await this.findEventByResolution(householdId, resolution, 'plan');
    if (!source || !moveTarget) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'MOVE_TARGET_MISSING',
        message: moveTarget
          ? 'Could not find the meal to move'
          : 'Tell me the target day for the move',
        statusCode: 400,
        recoverable: true,
      });
    }
    const moved = await this.moveMeal(userId, source.id, moveTarget);
    return {
      message: `Moved ${moved.concept ?? 'meal'} to ${moved.mealSlot} ${moved.dateKey}.`,
      mealEvents: [moved],
      plan: null,
      rule: null,
      reservation: null,
      purchaseSuggestions: [],
    };
  }

  private async actionRemove(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    const source = await this.findEventByResolution(householdId, resolution, 'plan');
    if (!source) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'MEAL_NOT_FOUND',
        message: 'No planned meal found there',
        statusCode: 404,
        recoverable: true,
      });
    }
    const removed = await this.removeMeal(userId, source.id);
    return {
      message: `Removed ${removed.concept ?? 'the meal'} from ${removed.mealSlot} ${removed.dateKey}.`,
      mealEvents: [removed],
      plan: null,
      rule: null,
      reservation: null,
      purchaseSuggestions: [],
    };
  }

  private async actionModifySchedule(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    const source = await this.findEventByResolution(householdId, resolution, 'plan');
    if (source && resolution.entities.moveTarget) {
      return this.actionMove(userId, householdId, {
        ...resolution,
        intent: 'MOVE_MEAL',
        entities: { ...resolution.entities, moveTarget: resolution.entities.moveTarget },
      });
    }
    throw new AppError({
      category: ErrorCategory.INPUT_VALIDATION,
      code: 'SCHEDULE_EDIT_TARGET_MISSING',
      message: 'Tell me which day to reschedule to',
      statusCode: 400,
      recoverable: true,
    });
  }

  private async actionBlockTime(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    const mealSlot = resolution.entities.mealSlot ?? DEFAULT_INTENT_MEAL_SLOT;
    const todayKey = dateKeyFor(new Date(), 0);
    const subjects = this.resolutionSubjects(resolution, todayKey);
    const created: MealEvent[] = [];
    const blockType = resolution.entities.blockType ?? 'blocked';
    const slotStatus: MealEvent['slotStatus'] =
      blockType === 'out' ? 'OUT' : blockType === 'keep_open' ? 'OPEN' : 'BLOCKED';

    for (const dateKey of subjects) {
      const existing = await this.models.MealEvent.findOne({
        where: { householdId, dateKey, mealSlot, kind: 'plan' },
      });
      if (existing) {
        await existing.update({
          slotStatus,
          state: blockTypeToState(blockType),
          updatedAt: new Date(),
        });
        created.push(toMealEvent(existing));
      } else {
        const row = await this.models.MealEvent.create({
          id: randomUUID(),
          householdId,
          planId: null,
          userId,
          dateKey,
          mealSlot,
          kind: 'plan',
          concept: null,
          conceptType: blockType === 'keep_open' ? 'flexible' : 'blocked',
          state: blockTypeToState(blockType),
          slotStatus,
          flexible: blockType === 'keep_open',
          horizon: null,
          excludedDays: null,
          preferredDays: null,
          mealRole: null,
          ingredients: null,
          memberIds: null,
          reasons: null,
          effort: null,
          rawText: resolution.rawText,
          movedFrom: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        created.push(toMealEvent(row));
      }
    }

    return {
      message: `${blockType === 'keep_open' ? 'Kept open' : 'Blocked'} ${mealSlot} on ${created
        .map((e) => e.dateKey)
        .join(', ')}.`,
      mealEvents: created,
      plan: null,
      rule: null,
      reservation: null,
      purchaseSuggestions: [],
    };
  }

  private async actionSetRule(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    const ingredient = resolution.entities.ingredient ?? null;
    const request: MealMemoryCreateRuleRequest = this.ruleRequestFrom(resolution, ingredient);
    const { rule, reservation } = await this.accountingService.createRule({
      householdId,
      userId,
      request,
    });
    return {
      message: buildRuleMessage(rule, reservation),
      mealEvents: [],
      plan: null,
      rule,
      reservation,
      purchaseSuggestions: [],
    };
  }

  private async actionRemember(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    const sentiment = /loved|really like/i.test(resolution.rawText)
      ? 'loved'
      : /not for us|hated|didn'?t like|didn'?t work/i.test(resolution.rawText)
        ? 'not_for_us'
        : 'liked';
    const result = await this.remember(userId, { sentiment });
    return {
      message: result.messages.join(' '),
      mealEvents: [],
      plan: null,
      rule: null,
      reservation: null,
      purchaseSuggestions: [],
    };
  }

  private async actionInventory(
    userId: UUID,
    householdId: UUID,
    resolution: IntentResolution,
  ): Promise<MemoryActionResult> {
    const world = await this.worldStateService.getState(householdId, userId);
    const suggestion = resolution.entities.ingredient
      ? world.inventory.find(
          (i) => i.name.toLowerCase() === resolution.entities.ingredient!.toLowerCase(),
        )
      : null;
    const message = suggestion
      ? `You have ${suggestion.availableQuantity ?? 0} ${suggestion.unit ?? 'servings'} of ${suggestion.name}. Add it to the shopping list when it runs low.`
      : resolution.entities.ingredient
        ? `I don't see ${resolution.entities.ingredient} in your kitchen — add it when you buy it.`
        : 'Tell me which ingredient to track for the shopping list.';
    return {
      message,
      mealEvents: [],
      plan: null,
      rule: null,
      reservation: null,
      purchaseSuggestions: [],
    };
  }

  private async answerReadOnly(
    resolution: IntentResolution,
    world: FoodWorldState,
  ): Promise<MemoryActionResult> {
    if (resolution.intent === 'PURCHASE_SUGGESTION') {
      const purchaseSuggestions = this.computePurchaseSuggestions(world);
      return {
        message:
          purchaseSuggestions.length > 0
            ? `Shopping list: ${purchaseSuggestions.map((p) => p.ingredient).join(', ')}.`
            : 'Your kitchen covers the basics — no urgent purchases right now.',
        mealEvents: [],
        plan: null,
        rule: null,
        reservation: null,
        purchaseSuggestions,
      };
    }

    if (resolution.intent === 'QUERY_REASONING') {
      return {
        message: this.buildReasoningAnswer(world),
        mealEvents: [],
        plan: null,
        rule: null,
        reservation: null,
        purchaseSuggestions: [],
      };
    }

    return {
      message: this.buildGeneralAnswer(world),
      mealEvents: [],
      plan: null,
      rule: null,
      reservation: null,
      purchaseSuggestions: [],
    };
  }

  private computePurchaseSuggestions(world: FoodWorldState): PurchaseSuggestion[] {
    const needs: PurchaseSuggestion[] = [];
    for (const item of world.inventory) {
      if (item.kind !== 'pantry') continue;
      const available = item.availableQuantity ?? 0;
      if (item.isExpiringSoon) continue;
      if (available < 1) {
        needs.push({
          id: randomUUID(),
          ingredient: item.name,
          shortfall: 1,
          unit: item.unit ?? null,
          suggestedQuantity: 1,
          suggestedUnit: item.unit ?? null,
          reason: 'Low or out in the kitchen',
        });
      }
    }
    return needs.slice(0, 10);
  }

  private buildReasoningAnswer(_world: FoodWorldState): string {
    return 'The planner weighs expiring items first, then your household taste and leftovers, and avoids anything you have eaten a lot lately. Ask me for a specific week and I will explain the exact picks.';
  }

  private buildGeneralAnswer(world: FoodWorldState): string {
    const open = world.openSlots.length;
    const expiring = world.expiringItems.map((i) => i.name).slice(0, 3);
    const parts: string[] = [];
    if (world.household)
      parts.push(
        `Week of ${world.household.name}: ${world.plannedMeals?.length ?? 0} planned meals, ${open} open slots.`,
      );
    if (expiring.length > 0) parts.push(`Using up soon: ${expiring.join(', ')}.`);
    if (world.leftovers.length > 0)
      parts.push(
        `${world.leftovers.length} leftover${world.leftovers.length === 1 ? '' : 's'} available.`,
      );
    return parts.join(' ');
  }

  private ruleRequestFrom(
    resolution: IntentResolution,
    ingredient: string | null,
  ): MealMemoryCreateRuleRequest {
    const text = resolution.rawText;
    const expiresAt = resolution.entities.targetDate ?? null;
    if (/save|reserve/.test(text) && ingredient) {
      return {
        instructionType: 'RESERVE_INGREDIENT',
        ingredient,
        scope: 'household',
        expiresAt: expiresAt ?? undefined,
        detail: expiresAt ? { day: expiresAt } : { flag: true },
        note: text,
      };
    }
    if (/don'?t use|without|avoid|no |skip|stop using|exclude/.test(text) && ingredient) {
      return {
        instructionType: 'EXCLUDE_INGREDIENT',
        ingredient,
        scope: 'household',
        expiresAt: expiresAt ?? undefined,
        detail: expiresAt ? { until: expiresAt } : {},
        note: text,
      };
    }
    if (/hold|keep (the )?\w+ for/.test(text) && ingredient) {
      return {
        instructionType: 'HOLD_INGREDIENT',
        ingredient,
        scope: 'household',
        expiresAt: expiresAt ?? undefined,
        detail: expiresAt ? { until: expiresAt } : { flag: true },
        note: text,
      };
    }
    if (resolution.entities.blockType && resolution.entities.mealSlot) {
      return {
        instructionType: resolution.entities.blockType === 'keep_open' ? 'KEEP_OPEN' : 'BLOCK_SLOT',
        mealSlot: resolution.entities.mealSlot,
        scope: 'household',
        detail: resolution.entities.targetDate ? { dateKey: resolution.entities.targetDate } : {},
        note: text,
      };
    }
    return {
      instructionType: 'GENERAL',
      scope: 'household',
      note: text,
    };
  }

  private resolutionSubjects(resolution: IntentResolution, todayKey: string): string[] {
    if (resolution.entities.targetDate) return [resolution.entities.targetDate];
    if (resolution.entities.targetHorizon === 'next week') {
      const start = nextWeekStartFor(todayKey);
      return weekDaysOf(start);
    }
    if (resolution.entities.targetHorizon === 'this week') {
      return weekDaysOf(weekStartFor(todayKey));
    }
    return [todayKey];
  }

  private async findEventByResolution(
    householdId: UUID,
    resolution: IntentResolution,
    kind: 'plan' | 'actual',
  ): Promise<MealEvent | null> {
    const dateKey = resolution.entities.targetDate ?? null;
    const mealSlot = resolution.entities.mealSlot ?? null;
    const where: Record<string, unknown> = { householdId, kind };
    if (dateKey) where.dateKey = dateKey;
    if (mealSlot) where.mealSlot = mealSlot;
    const row = await this.models.MealEvent.findOne({ where, order: [['updatedAt', 'DESC']] });
    return row ? toMealEvent(row) : null;
  }

  private async loadEvent(householdId: UUID, eventId: UUID): Promise<MealEvent> {
    const row = await this.loadEventRow(householdId, eventId);
    return toMealEvent(row);
  }

  private async loadEventRow(householdId: UUID, eventId: UUID) {
    const row = await this.models.MealEvent.findOne({
      where: { id: eventId, householdId },
    });
    if (!row) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'MEAL_EVENT_NOT_FOUND',
        message: 'Meal not found',
        statusCode: 404,
        recoverable: false,
      });
    }
    return row;
  }

  private async requireHouseholdId(userId: UUID): Promise<UUID> {
    const household = await this.householdService.getForUser(userId);
    if (!household) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household setup required before planning',
        statusCode: 404,
        recoverable: true,
      });
    }
    return household.id;
  }

  private async recordMemoryEvent(input: {
    intentId: UUID;
    userId: UUID;
    householdId: UUID;
    resolution: IntentResolution;
    status: MealMemoryIntentResponse['status'];
  }): Promise<void> {
    await this.models.MealMemoryEvent.create({
      id: input.intentId,
      userId: input.userId,
      householdId: input.householdId,
      intent: input.resolution.intent,
      confidence: input.resolution.confidence,
      rawText: input.resolution.rawText,
      entities: input.resolution.entities as unknown as Record<string, unknown>,
      status: input.status,
      requiresClarification: input.resolution.requiresClarification,
      clarificationQuestion: input.resolution.clarificationQuestion,
      actionEventIds: null,
      error: null,
      createdAt: new Date(),
    });
  }

  private isReadOnly(intent: IntentResolution['intent']): boolean {
    return (
      intent === 'ASK_QUESTION' ||
      intent === 'QUERY_REASONING' ||
      intent === 'PURCHASE_SUGGESTION' ||
      intent === 'GENERAL_INFORMATION'
    );
  }
}

function blockTypeToState(blockType: string): MealEvent['state'] {
  return blockType === 'out' ? 'OUT' : blockType === 'keep_open' ? 'OPEN' : 'BLOCKED';
}

function buildRuleMessage(rule: MealRule, reservation: InventoryReservation | null): string {
  const what = rule.ingredient
    ? `${rule.ingredient}`
    : rule.mealSlot
      ? `${rule.mealSlot}`
      : 'the slot';
  const verb = reservation
    ? 'reso'
    : rule.instructionType === 'EXCLUDE_INGREDIENT'
      ? 'excluded'
      : rule.instructionType === 'BLOCK_SLOT'
        ? 'blocked'
        : 'set';
  return `Rule ${verb === 'reso' ? 'reserved' : verb}: ${what}${rule.expiresAt ? ` until ${rule.expiresAt}` : ''}.`;
}

function weekDaysOf(weekStart: string): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));
  return days;
}
