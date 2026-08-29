import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { registerTestUser } from './helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('user taste routes (integration)', () => {
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

  it('GET /user/taste returns empty-shaped results for a fresh user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/taste',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { memories: unknown[]; personality: unknown; journal: unknown[] };
    expect(Array.isArray(body.memories)).toBe(true);
    expect(body.journal).toEqual([]);
  });

  it('GET /user/taste/personality returns null for a fresh user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/taste/personality',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });
});
