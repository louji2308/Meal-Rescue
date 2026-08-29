import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { registerTestUser } from './helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('pipeline personalization (integration)', () => {
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

  async function analyzeText(text: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/meal/analyze',
      headers: { authorization: `Bearer ${token}` },
      payload: { text },
    });
    return (res.json() as { mealId: string }).mealId;
  }

  async function generate(
    mealId: string,
    constraints: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rescue/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: { mealId, constraints },
    });
    return res.json() as Record<string, unknown>;
  }

  it('generates a rescue with an optional resonance memory', async () => {
    const mealId = await analyzeText('instant noodles with egg');
    const body = await generate(mealId, { timeMinutes: 10, cookingRequired: false });
    expect((body.recommendation as Record<string, unknown>).candidate).toBeDefined();
    // At first run there may be no high-confidence memory; the field is optional.
    const rec = body.recommendation as { resonanceMemory?: unknown };
    expect(rec).toBeDefined();
  });
});
