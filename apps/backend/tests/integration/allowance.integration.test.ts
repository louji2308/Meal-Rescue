import { randomUUID } from 'node:crypto';

import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { Meal } from '../../src/database/models/meal.model';
import { Rescue } from '../../src/database/models/rescue.model';
import { User } from '../../src/database/models/user.model';
import {
  consumeRescueAllowance,
  effectiveTier,
  grantCredits,
  grantProPass,
} from '../../src/services/rescue-allowance.service';

/**
 * Rescue allowance engine integration test - requires PostgreSQL.
 * Skipped automatically unless TEST_DATABASE_URL is provided.
 */
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('rescue allowance engine (integration)', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function seedUser(overrides: Partial<{ tier: 'free' | 'pro'; credits: number }> = {}) {
    return User.create({
      id: randomUUID(),
      email: `allow-${randomUUID()}@mealrescue.test`,
      passwordHash: null,
      subscriptionTier: overrides.tier ?? 'free',
      rescueCredits: overrides.credits ?? 0,
      locale: 'en-US',
      tzOffsetMinutes: 0,
    });
  }

  async function seedRescues(user: User, count: number): Promise<void> {
    const meal = await Meal.create({
      id: randomUUID(),
      userId: user.id,
      originalInput: 'instant noodles',
      inputType: 'text',
      detectedFoods: [{ name: 'instant noodles', confidence: 0.9 }],
      detectedIngredients: [{ name: 'wheat noodles', confidence: 0.9, state: 'cooked' }],
      detectedComponents: { protein: false },
    });
    for (let i = 0; i < count; i++) {
      await Rescue.create({
        id: randomUUID(),
        mealId: meal.id,
        userId: user.id,
        originalMeal: {},
        detectedIngredients: [],
        constraints: {},
        candidatesGenerated: [],
        selectedRecommendation: {},
        reasoning: 'seed',
        userDecision: 'pending',
      });
    }
  }

  it('always allows pro users regardless of daily count', async () => {
    const user = await seedUser({ tier: 'pro' });
    await seedRescues(user, 10);
    expect(await consumeRescueAllowance(user)).toEqual({ allowed: true });
  });

  it('allows free users under the daily limit and blocks at the limit', async () => {
    const under = await seedUser();
    await seedRescues(under, 2);
    expect(await consumeRescueAllowance(under)).toEqual({ allowed: true });

    const at = await seedUser();
    await seedRescues(at, 3);
    expect(await consumeRescueAllowance(at)).toEqual({ allowed: false, reason: 'limit' });
  });

  it('spends an ad credit instead of blocking, decrementing the balance', async () => {
    const user = await seedUser({ credits: 2 });
    await seedRescues(user, 3);
    expect((await consumeRescueAllowance(user)).allowed).toBe(true);
    const reloaded = await User.findByPk(user.id);
    expect(reloaded?.rescueCredits).toBe(1);
  });

  it('grantCredits is idempotent per ad transaction id', async () => {
    const user = await seedUser();
    const txId = `tx-${randomUUID()}`;
    expect(await grantCredits(user.id, txId, 2)).toBe(true);
    expect(await grantCredits(user.id, txId, 2)).toBe(false);
    const reloaded = await User.findByPk(user.id);
    expect(reloaded?.rescueCredits).toBe(2);
  });

  it('grantProPass sets a future expiry once per transaction id', async () => {
    const user = await seedUser();
    const txId = `tx-${randomUUID()}`;
    expect(await grantProPass(user.id, txId, 60)).toBe(true);
    expect(await grantProPass(user.id, txId, 60)).toBe(false);
    const reloaded = await User.findByPk(user.id);
    expect(effectiveTier(reloaded!)).toBe('pro');
    expect(reloaded!.proPassUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('effectiveTier ignores expired pro passes', async () => {
    const user = await seedUser();
    await user.update({ proPassUntil: new Date(Date.now() - 60_000) });
    expect(effectiveTier(user)).toBe('free');
  });

  it('effectiveTier flips to free exactly at the expiry instant', async () => {
    const active = await seedUser();
    await active.update({ proPassUntil: new Date(Date.now() + 5_000) });
    expect(effectiveTier(active)).toBe('pro');

    const expired = await seedUser();
    await expired.update({ proPassUntil: new Date(Date.now() - 1_000) });
    expect(effectiveTier(expired)).toBe('free');
  });

  it('grantProPass issues a pass of exactly ~60 minutes for any user id', async () => {
    const before = Date.now();
    for (let i = 0; i < 2; i++) {
      const user = await seedUser();
      expect(await grantProPass(user.id, `dur-${randomUUID()}`, 60)).toBe(true);
      const reloaded = await User.findByPk(user.id);
      const durationMs = reloaded!.proPassUntil!.getTime() - before;
      expect(durationMs).toBeGreaterThanOrEqual(59.5 * 60_000);
      expect(durationMs).toBeLessThanOrEqual(60.5 * 60_000);
      expect(effectiveTier(reloaded!)).toBe('pro');
    }
  });

  it('allows a fresh one-hour pass after the previous pass expires', async () => {
    const user = await seedUser();
    expect(await grantProPass(user.id, `renew-1-${randomUUID()}`, 60)).toBe(true);
    await user.update({ proPassUntil: new Date(Date.now() - 60_000) });
    expect(effectiveTier(user)).toBe('free');

    expect(await grantProPass(user.id, `renew-2-${randomUUID()}`, 60)).toBe(true);
    const reloaded = await User.findByPk(user.id);
    expect(effectiveTier(reloaded!)).toBe('pro');
    expect(reloaded!.proPassUntil!.getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
  });

  it('an expired pro pass does not keep the unlimited-rescue allowance', async () => {
    const user = await seedUser();
    await user.update({ proPassUntil: new Date(Date.now() - 60_000) });
    await seedRescues(user, 10);
    expect(await consumeRescueAllowance(user)).toEqual({ allowed: false, reason: 'limit' });
  });
});
