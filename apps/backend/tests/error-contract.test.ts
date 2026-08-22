import { buildApp } from '../src/app';
import { signAccessToken } from '../src/lib/jwt';

describe('error contract', () => {
  it('unknown routes require authentication first (no route enumeration)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/definitely/not/a/route' });

    // Auth runs before routing: anonymous callers get 401, not 404,
    // so the API surface cannot be probed without a token.
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.category).toBe('UNAUTHORIZED');
    await app.close();
  });

  it('authenticated requests to unknown routes get the structured 404 shape', async () => {
    const app = await buildApp();
    const token = signAccessToken({
      sub: '00000000-0000-0000-0000-000000000000',
      email: 'test@example.com',
      subscriptionTier: 'free',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/definitely/not/a/route',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.category).toBe('NOT_FOUND');
    expect(body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(body.requestId).toBeTruthy();
    await app.close();
  });

  it('implemented endpoints validate input through the structured error contract', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/meal/analyze',
      headers: { authorization: `Bearer ${validToken()}` },
    });

    // Phase 2 shipped the real analyzer: an empty request is now a
    // structured 400, not a 501 stub.
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_ANALYSIS_INPUT');
    await app.close();
  });

  it('feedback endpoint validates input through the structured error contract', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rescue/00000000-0000-0000-0000-000000000000/feedback',
      headers: { authorization: `Bearer ${validToken()}` },
    });

    // Phase 4 shipped the real feedback endpoint: empty body is now a
    // structured 400, not a 501 stub.
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_FEEDBACK_INPUT');
    await app.close();
  });
});

function validToken(): string {
  return signAccessToken({
    sub: '00000000-0000-0000-0000-000000000000',
    email: 'test@example.com',
    subscriptionTier: 'free',
  });
}
