/**
 * V2 decision-layer journeys (plan §50 journeys) - integration level.
 *
 * Exercises the API surface end-to-end:
 *   A  plain DECIDE rescue persists intent + provenance + decision events
 *   C  reality no-cook hard-filters the recommendation to zero-cook
 *   E  "don't fix my food" on a balanced meal -> KEEP_AS_IS is the winner
 *   F  craving lock keeps the primary craving untouched
 *   G  expiring pantry surfaces a USE_EXPIRING rescue
 *  plus the satisfaction store (POST/GET, idempotent, event) and the
 *  OneSignal aftercare gate (COOLDOWN -> OK dry-run -> ALREADY_SENT).
 */
import { randomUUID } from 'node:crypto';

import { Op } from 'sequelize';

import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { DecisionEvent } from '../../src/database/models/decision-event.model';
import { Meal } from '../../src/database/models/meal.model';
import { Pantry } from '../../src/database/models/pantry.model';
import { Rescue } from '../../src/database/models/rescue.model';
import { SatisfactionRecordModel } from '../../src/database/models/satisfaction-record.model';
import { registerTestUser } from '../helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

const DECISION_ACTIONS = ['RESCUE', 'ADD', 'COMBINE', 'USE_LEFTOVER', 'USE_EXPIRING', 'KEEP_AS_IS'];

maybeDescribe('v2 decision journeys (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  async function freshUser(): Promise<{ token: string; userId: string }> {
    const registration = await registerTestUser(app);
    return { token: registration.token, userId: registration.userId };
  }

  function seedMeal(
    userId: string,
    overrides: {
      foods?: string[];
      ingredients?: string[];
      protein?: boolean;
      fiber?: boolean;
    } = {},
  ) {
    const foods = overrides.foods ?? ['instant noodles'];
    const ingredients = overrides.ingredients ?? ['instant noodles'];
    return Meal.create({
      id: randomUUID(),
      userId,
      originalInput: foods.join(', '),
      inputType: 'text',
      detectedFoods: foods.map((name) => ({ name, confidence: 0.9 })),
      detectedIngredients: ingredients.map((name) => ({ name, confidence: 0.9, state: 'cooked' })),
      detectedComponents: {
        protein: overrides.protein ?? false,
        fiber_sources: overrides.fiber ?? false,
        healthy_fat_sources: false,
        carbohydrates: true,
        sodium_likely_high: false,
      },
    });
  }

  interface GenerateBody {
    decision: string;
    rescueId: string;
    recommendation: {
      candidate: {
        actionType?: string;
        cookingRequired?: boolean;
        estimatedMinutes?: number;
        substitutions?: Array<{ original: { name: string } }>;
      };
    };
    alternatives?: Array<{
      candidate: {
        cookingRequired?: boolean;
        substitutions?: Array<{ original: { name: string } }>;
      };
    }>;
    provenance: {
      provider?: string;
      model?: string;
      promptVersion?: string;
      pipelineVersion?: string;
      rankingVersion?: string;
      fallbackUsed: boolean;
      processingTimeMs: number;
      validationOutcome?: string;
    };
  }

  async function generate(
    token: string,
    mealId: string,
    v2?: Record<string, unknown>,
  ): Promise<{ status: number; body: GenerateBody }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rescue/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: { mealId, constraints: {}, ...(v2 ? { v2 } : {}) },
    });
    return { status: res.statusCode, body: res.json() as GenerateBody };
  }

  it('A: a plain DECIDE rescue persists intent, provenance, and decision events', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId, { ingredients: ['instant noodles'] });
    const { status, body } = await generate(token, meal.id);
    expect(status).toBe(201);

    expect(DECISION_ACTIONS).toContain(body.decision);
    expect(body.recommendation.candidate.actionType).toBe(body.decision);
    expect(body.provenance).toMatchObject({
      provider: 'heuristic',
      model: 'heuristic:v1',
      pipelineVersion: 'v2.1.0',
      rankingVersion: 'rank-v1',
      validationOutcome: 'passed',
    });
    expect(typeof body.provenance.fallbackUsed).toBe('boolean');
    expect(body.provenance.processingTimeMs).toBeGreaterThan(0);

    const persisted = await Rescue.findOne({ where: { id: body.rescueId } });
    expect(persisted?.modelVersion).toBe('pipeline:v2');
    expect(persisted?.intent).toBe('DECIDE');
    expect(
      (persisted?.v2Context as { expiringIngredients?: string[] })?.expiringIngredients,
    ).toEqual([]);
    expect(persisted?.provenance).toBeDefined();

    // INTENT_SELECTED / RESCUE_STARTED fire before the rescue row exists, so
    // they carry mealId; RECOMMENDATION_PRESENTED lands post-persist with
    // rescueId (decision_events.rescue_id is optional/FK).
    const seedEvents = await DecisionEvent.count({
      where: { mealId: meal.id, eventType: { [Op.in]: ['INTENT_SELECTED', 'RESCUE_STARTED'] } },
    });
    expect(seedEvents).toBe(2);
    const presented = await DecisionEvent.count({
      where: { rescueId: body.rescueId, eventType: 'RECOMMENDATION_PRESENTED' },
    });
    expect(presented).toBe(1);
  });

  it('C: reality cookingAllowed=false returns only no-cook recommendations', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId);
    const { status, body } = await generate(token, meal.id, {
      reality: { cookingAllowed: false, useAvailableIngredients: false },
    });
    expect(status).toBe(201);
    expect(body.recommendation.candidate.cookingRequired).toBe(false);
    const paths = [body.recommendation, ...(body.alternatives ?? [])].map(
      (r: { candidate: { cookingRequired?: boolean } }) => r.candidate.cookingRequired,
    );
    expect(paths.every((cooking: boolean | undefined) => cooking === false)).toBe(true);

    const persisted = await Rescue.findOne({ where: { id: body.rescueId } });
    expect(
      (persisted?.v2Context as { reality?: { cookingAllowed: boolean } })?.reality?.cookingAllowed,
    ).toBe(false);
  });

  it('E: "don\'t fix my food" on a balanced meal makes KEEP_AS_IS the winner', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId, {
      ingredients: ['instant noodles', 'egg', 'spinach'],
      protein: true,
      fiber: true,
    });
    const { status, body } = await generate(token, meal.id, { intent: 'PRESERVE' });
    expect(status).toBe(201);
    expect(body.decision).toBe('KEEP_AS_IS');
    expect(body.recommendation.candidate.actionType).toBe('KEEP_AS_IS');
    expect(body.recommendation.candidate.estimatedMinutes).toBe(0);
  });

  it('F: a craving lock is never violated by the recommended or alternative paths', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId, {
      foods: ['instant noodles', 'egg'],
      ingredients: ['instant noodles', 'egg'],
    });
    const { status, body } = await generate(token, meal.id, {
      craving: { primary: 'instant noodles', preservedElements: ['egg'], flexibleElements: [] },
    });
    expect(status).toBe(201);

    const paths = [body.recommendation, ...(body.alternatives ?? [])];
    for (const path of paths) {
      for (const substitution of path.candidate.substitutions ?? []) {
        expect(substitution.original.name.toLowerCase()).not.toContain('instant noodle');
        expect(substitution.original.name.toLowerCase()).not.toBe('egg');
      }
    }
  });

  it('G: an expiring pantry ingredient surfaces a USE_EXPIRING rescue with expiry context', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId);
    await Pantry.create({
      id: randomUUID(),
      userId,
      ingredientName: 'spinach',
      usePriority: 0,
      addedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const { status, body } = await generate(token, meal.id);
    expect(status).toBe(201);

    const persisted = await Rescue.findOne({ where: { id: body.rescueId } });
    const v2Context = persisted?.v2Context as { expiringIngredients?: string[] };
    expect(v2Context.expiringIngredients).toContain('spinach');

    const feasible =
      (persisted?.candidatesGenerated as { feasible?: Array<{ actionType?: string }> })?.feasible ??
      [];
    expect(feasible.some((c) => c.actionType === 'USE_EXPIRING')).toBe(true);
  });

  it('satisfaction store: POST is idempotent, records an event, and is readable via GET', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId);
    const { body } = await generate(token, meal.id);
    const rescueId = body.rescueId as string;

    const post = async (result: string) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/rescue/${rescueId}/satisfaction`,
        headers: { authorization: `Bearer ${token}` },
        payload: { result, reason: [] },
      });

    const first = await post('EXACTLY');
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ success: true });
    expect(
      (first.json() as { personalizationImpact: string[] }).personalizationImpact.length,
    ).toBeGreaterThan(0);

    const second = await post('NOT_REALLY');
    expect(second.statusCode).toBe(201);

    const rows = await SatisfactionRecordModel.findAll({ where: { rescueId, userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.result).toBe('NOT_REALLY');

    const eventCount = await DecisionEvent.count({
      where: { rescueId, eventType: 'SATISFACTION_RECORDED' },
    });
    expect(eventCount).toBe(1);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/rescue/${rescueId}/satisfaction`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect((getRes.json() as { recorded: { result: string } }).recorded.result).toBe('NOT_REALLY');
  });

  it('aftercare: gates on MEAL_COMPLETED, respects cooldown, and dry-runs eligible', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId);
    const { body } = await generate(token, meal.id);
    const rescueId = body.rescueId as string;

    const eligibility = async () =>
      app.inject({
        method: 'GET',
        url: `/api/v1/rescue/${rescueId}/aftercare-eligibility`,
        headers: { authorization: `Bearer ${token}` },
      });

    // Not completed -> NO_RESCUE.
    expect((await eligibility()).json()).toEqual({ eligible: false, reason: 'NO_RESCUE' });

    // The feedback route only accepts a rescue the user has already decided.
    // There is no decide-endpoint in scope yet, so seed the decision directly.
    await Rescue.update(
      {
        userDecision: 'accepted',
        decisionAction: 'ADD',
        selectedRecommendation: body.recommendation,
      },
      { where: { id: rescueId, userId } },
    );

    // Completed via the feedback route (mechanical, fires MEAL_COMPLETED).
    const feedback = await app.inject({
      method: 'POST',
      url: `/api/v1/rescue/${rescueId}/feedback`,
      headers: { authorization: `Bearer ${token}` },
      payload: { satisfaction: 'better', outcome: { completed: true } },
    });
    expect(feedback.statusCode).toBe(201);

    // Still inside the 30-minute cooldown.
    expect((await eligibility()).json()).toEqual({ eligible: false, reason: 'COOLDOWN' });

    // Backdate the completion past the cooldown -> eligible (keyless dry-run).
    await sequelize.query(
      'UPDATE decision_events SET created_at = :when WHERE rescue_id = :rescueId AND event_type = :eventType',
      {
        replacements: {
          when: new Date(Date.now() - 10 * 60 * 60 * 1000),
          rescueId,
          eventType: 'MEAL_COMPLETED',
        },
      },
    );
    expect((await eligibility()).json()).toEqual({ eligible: true, reason: 'OK' });

    // One aftercare push per rescue max.
    await DecisionEvent.create({
      id: randomUUID(),
      eventType: 'NOTIFICATION_SENT',
      userId,
      rescueId,
      payload: { kind: 'aftercare' },
    });
    expect((await eligibility()).json()).toEqual({ eligible: false, reason: 'ALREADY_SENT' });
  });

  it('aftercare: respects a user with feedback disabled', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId);
    const { body } = await generate(token, meal.id);
    const rescueId = body.rescueId as string;

    await DecisionEvent.create({
      id: randomUUID(),
      eventType: 'MEAL_COMPLETED',
      userId,
      rescueId,
      payload: {},
    });
    await sequelize.query(
      'UPDATE decision_events SET created_at = :when WHERE rescue_id = :rescueId AND event_type = :eventType',
      {
        replacements: {
          when: new Date(Date.now() - 10 * 60 * 60 * 1000),
          rescueId,
          eventType: 'MEAL_COMPLETED',
        },
      },
    );

    const { User } = await import('../../src/database/models/user.model');
    await User.update({ feedbackEnabled: false }, { where: { id: userId } });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/rescue/${rescueId}/aftercare-eligibility`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json()).toEqual({ eligible: false, reason: 'FEEDBACK_DISABLED' });
  });

  it('aftercare route returns NO_RESCUE for a nonexistent rescue', async () => {
    const { token } = await freshUser();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/rescue/${randomUUID()}/aftercare-eligibility`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json()).toEqual({ eligible: false, reason: 'NO_RESCUE' });
  });
});
