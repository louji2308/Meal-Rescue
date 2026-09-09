/**
 * V2 decision-commit journeys (plan §9 / §27) - integration level.
 *
 * The decide endpoint is the missing step between "rescue generated" and
 * "satisfaction captured": it flips rescue.userDecision off 'pending' and
 * logs a RECOMMENDATION_SELECTED event. These tests prove the deadlock this
 * E2E surfaced is gone:
 *   A  decide('accepted') unblocks the legacy feedback route (was 400
 *      RESCUE_NOT_DECIDED forever) and fires MEAL_COMPLETED, which unlocks
 *      the aftercare gate (cooldown state).
 *   B  last decision wins - re-deciding overwrites userDecision.
 *   C  invalid action -> 400; foreign rescue -> 404.
 */
import { randomUUID } from 'node:crypto';

import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { DecisionEvent } from '../../src/database/models/decision-event.model';
import { Meal } from '../../src/database/models/meal.model';
import { Rescue } from '../../src/database/models/rescue.model';
import { registerTestUser } from '../helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('v2 decide endpoint (integration)', () => {
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

  async function seedMeal(userId: string) {
    return Meal.create({
      id: randomUUID(),
      userId,
      originalInput: 'instant noodles',
      inputType: 'text',
      detectedFoods: [{ name: 'instant noodles', confidence: 0.9 }],
      detectedIngredients: [{ name: 'instant noodles', confidence: 0.9, state: 'cooked' }],
      detectedComponents: {
        protein: false,
        fiber_sources: false,
        healthy_fat_sources: false,
        carbohydrates: true,
        sodium_likely_high: false,
      },
    });
  }

  async function generate(token: string, mealId: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rescue/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: { mealId, constraints: {} },
    });
    return { status: res.statusCode, body: res.json() as { rescueId: string } };
  }

  function decideInject(token: string, rescueId: string, payload: { action: string }) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/rescue/${rescueId}/decide`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  it('A: commits a decision, unblocks feedback, fires MEAL_COMPLETED, and aftercare moves to cooldown', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId);
    const { body } = await generate(token, meal.id);
    const rescueId = body.rescueId;

    // Before deciding, feedback is rejected (the deadlock this E2E proved).
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/rescue/${rescueId}/feedback`,
      headers: { authorization: `Bearer ${token}` },
      payload: { satisfaction: 'better', outcome: { completed: true } },
    });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().error.code).toBe('RESCUE_NOT_DECIDED');

    const res = await decideInject(token, rescueId, { action: 'accepted' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      success: true,
      rescueId,
      userDecision: 'accepted',
    });

    const persisted = await Rescue.findOne({ where: { id: rescueId } });
    expect(persisted?.userDecision).toBe('accepted');
    expect(persisted?.decisionTimestamp).not.toBeNull();

    const selected = await DecisionEvent.findOne({
      where: { rescueId, eventType: 'RECOMMENDATION_SELECTED' },
    });
    expect(selected).not.toBeNull();
    expect(selected?.payload).toMatchObject({ action: 'accepted' });

    // Feedback now succeeds and fires MEAL_COMPLETED.
    const feedback = await app.inject({
      method: 'POST',
      url: `/api/v1/rescue/${rescueId}/feedback`,
      headers: { authorization: `Bearer ${token}` },
      payload: { satisfaction: 'better', outcome: { completed: true } },
    });
    expect(feedback.statusCode).toBe(201);
    const completed = await DecisionEvent.findOne({
      where: { rescueId, eventType: 'MEAL_COMPLETED' },
    });
    expect(completed).not.toBeNull();

    // Aftercare gate unlocks from NO_RESCUE to COOLDOWN for a just-completed meal.
    const eligibility = await app.inject({
      method: 'GET',
      url: `/api/v1/rescue/${rescueId}/aftercare-eligibility`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(eligibility.json()).toEqual({ eligible: false, reason: 'COOLDOWN' });
  });

  it('B: last decision wins - re-deciding overwrites userDecision', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId);
    const { body } = await generate(token, meal.id);

    expect((await decideInject(token, body.rescueId, { action: 'kept_as_is' })).statusCode).toBe(
      201,
    );
    expect((await decideInject(token, body.rescueId, { action: 'accepted' })).statusCode).toBe(201);

    const persisted = await Rescue.findOne({ where: { id: body.rescueId } });
    expect(persisted?.userDecision).toBe('accepted');

    const events = await DecisionEvent.findAll({
      where: { rescueId: body.rescueId, eventType: 'RECOMMENDATION_SELECTED' },
    });
    expect(events).toHaveLength(2);
  });

  it('C: rejects an invalid action with 400', async () => {
    const { token, userId } = await freshUser();
    const meal = await seedMeal(userId);
    const { body } = await generate(token, meal.id);

    const res = await decideInject(token, body.rescueId, { action: 'maybe_later' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_DECIDE_INPUT');
  });

  it("C: 404 for a missing rescue and for another user's rescue", async () => {
    const { token } = await freshUser();
    const { token: otherToken, userId: otherUserId } = await freshUser();
    const meal = await seedMeal(otherUserId);
    const { body } = await generate(otherToken, meal.id);

    const missing = await decideInject(token, randomUUID(), { action: 'accepted' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('RESCUE_NOT_FOUND');

    const foreign = await decideInject(token, body.rescueId, { action: 'accepted' });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error.code).toBe('RESCUE_NOT_FOUND');
  });
});
