import { buildApp } from '../src/app';
import { signAccessToken } from '../src/lib/jwt';

describe('auth middleware', () => {
  it('rejects unauthenticated requests to protected routes with the structured error', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/user/me' });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.category).toBe('UNAUTHORIZED');
    expect(body.error.recoverable).toBe(true);
    expect(body.requestId).toBeTruthy();
    expect(body.timestamp).toBeTruthy();
    await app.close();
  });

  it('rejects invalid tokens', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/me',
      headers: { authorization: 'Bearer not-a-real-token' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('accepts a valid token shape (fails later on DB, not on auth)', async () => {
    const app = await buildApp();
    const token = signAccessToken({
      sub: '00000000-0000-0000-0000-000000000000',
      email: 'test@example.com',
      subscriptionTier: 'free',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/me',
      headers: { authorization: `Bearer ${token}` },
    });

    // Auth passed; failure comes from the missing DB row (500 in unit env
    // without a database) - anything but 401 proves the token was accepted.
    expect(res.statusCode).not.toBe(401);
    await app.close();
  });
});
