/**
 * Route contract tests for the Phase 2 endpoints.
 * Uses the heuristic LLM client (no API key in test env) so the FULL
 * pipeline runs end-to-end through fastify.inject - DB-gated like the
 * auth integration suite.
 */
import { randomUUID } from 'node:crypto';

import type { RescueCandidate, Substitution } from '@meal-rescue/shared-types';

import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { registerTestUser } from '../helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('phase 2 pipeline routes (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
    const registration = await registerTestUser(app);
    token = registration.token;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  async function analyzeText(
    text: string,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/meal/analyze',
      headers: { authorization: `Bearer ${token}` },
      payload: { text },
    });
    return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
  }

  it('POST /meal/analyze (text) returns a structured analysis and persists the meal', async () => {
    const { statusCode, body } = await analyzeText('instant noodles with egg');
    const confidence = body.confidenceScores as { overall: number };

    expect(statusCode).toBe(201);
    expect(body.mealId).toBeDefined();
    expect(Array.isArray(body.detectedFoods)).toBe(true);
    expect(body.detectedComponents).toHaveProperty('protein');
    expect(body).toHaveProperty('requiresConfirmation');
    expect(confidence.overall).toBeGreaterThan(0);
  });

  it('rejects empty text input with the structured error contract', async () => {
    const { statusCode, body } = await analyzeText('x');
    const error = body.error as { category: string };
    expect(statusCode).toBe(400);
    expect(error.category).toBe('INPUT_VALIDATION');
  });

  it('full funnel: analyze -> generate -> one recommendation + <=2 alternatives + four actions', async () => {
    const analysis = await analyzeText('instant noodles');
    const mealId = analysis.body.mealId as string;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rescue/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mealId,
        constraints: { timeMinutes: 15, cookingRequired: false },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();

    expect(body.rescueId).toBeDefined();
    expect(body.originalMeal.foods.length).toBeGreaterThan(0);
    expect(body.recommendation.candidate).toBeDefined();
    expect(body.recommendation.naturalLanguageExplanation).not.toMatch(/macronutrient|satiety/i);
    expect(body.alternatives.length).toBeLessThanOrEqual(2);
    // Product rule: three choices maximum.
    expect(1 + body.alternatives.length).toBeLessThanOrEqual(3);
    expect(body.actions).toEqual(['rescue', 'swap', 'dont_have', 'keep_as_is']);

    // Every returned candidate must respect the constraints we sent.
    const all = [body.recommendation, ...body.alternatives];
    for (const entry of all) {
      expect(entry.candidate.estimatedTime).toBeLessThanOrEqual(15);
      expect(entry.candidate.cookingSteps).toBe(0);
    }
  });

  it('allergies are enforced end-to-end even when ranked first', async () => {
    const analysis = await analyzeText('instant noodles');
    const mealId = analysis.body.mealId as string;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rescue/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mealId,
        constraints: { allergies: ['eggs'] },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    const all = [body.recommendation, ...body.alternatives];
    for (const entry of all) {
      const names = [
        ...entry.candidate.additions.map((a: RescueCandidate['additions'][number]) => a.name),
        ...entry.candidate.substitutions.map((s: Substitution) => s.replacement.name),
      ];
      expect(names).not.toContain('egg');
    }
  });

  it('rejects invalid constraint values with the structured error contract', async () => {
    const analysis = await analyzeText('instant noodles');
    const mealId = analysis.body.mealId as string;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rescue/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mealId,
        constraints: { timeMinutes: 0, cookingRequired: false },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.category).toBe('INPUT_VALIDATION');
  });

  it('generate for unknown meal id -> structured NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rescue/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: { mealId: randomUUID(), constraints: {} },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('MEAL_NOT_FOUND');
  });

  it('unauthenticated requests are rejected before routing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/meal/analyze',
      payload: { text: 'noodles' },
    });
    expect(res.statusCode).toBe(401);
  });
});
