import { buildApp } from '../src/app';

describe('GET /health', () => {
  it('returns ok with timestamp (no version or uptime — security hardening)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
    // SECURITY: version and uptimeSeconds removed to prevent information
    // leakage to attackers (software version fingerprinting, uptime attacks).
    expect(body.version).toBeUndefined();
    expect(body.uptimeSeconds).toBeUndefined();

    await app.close();
  });

  it('is accessible without authentication', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
