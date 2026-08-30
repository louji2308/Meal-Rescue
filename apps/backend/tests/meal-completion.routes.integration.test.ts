import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { registerTestUser } from './helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('meal-completion onboarding (integration)', () => {
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

  it('starts onboarding and returns an adaptive first pair', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/taste/onboarding',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { pair: { id: string } | null; seeded: boolean };
    expect(body.seeded).toBe(false);
    expect(body.pair?.id).toBe('pair-01');
  });

  it('answers every pair and returns a summary at the end', async () => {
    let pairId = 'pair-01';
    let summaryReturned = false;
    for (let i = 0; i < 7; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/taste/onboarding/answers',
        headers: { authorization: `Bearer ${token}` },
        payload: { answer: { pairId, selected: 'A', unavailableOption: null } },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        next: { id: string } | null;
        summary: { factors: unknown[]; seeded: boolean } | null;
      };
      if (body.next) {
        pairId = body.next.id;
      } else {
        expect(body.summary?.seeded).toBe(true);
        expect(body.summary?.factors).toHaveLength(5);
        summaryReturned = true;
      }
    }
    expect(summaryReturned).toBe(true);
  });

  it('rejects an invalid answer body with a 400 contract error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/user/taste/onboarding/answers',
      headers: { authorization: `Bearer ${token}` },
      payload: { answer: { pairId: '' } },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { category: string; code: string } };
    expect(body.error.category).toBe('INPUT_VALIDATION');
    expect(body.error.code).toBe('INVALID_ONBOARDING_INPUT');
  });
});
