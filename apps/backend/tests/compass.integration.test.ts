import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { registerTestUser } from './helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('culinary compass (integration)', () => {
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

  it('seeds a compass and reads culture affinities back', async () => {
    const seed = await app.inject({
      method: 'POST',
      url: '/api/v1/user/taste/compass',
      headers: { authorization: `Bearer ${token}` },
      payload: { family: 'indian', traditionVsModern: -0.6 },
    });
    expect(seed.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/taste/culture',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      affinities: Record<string, number>;
      traditionVsModern: number;
      seeded: boolean;
    };
    expect(body.seeded).toBe(true);
    expect(body.affinities.indian).toBeGreaterThan(0);
  });
});
