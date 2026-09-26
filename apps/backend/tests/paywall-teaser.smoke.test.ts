/**
 * OPT-IN REAL-GROQ smoke test — never runs by default (hits a paid API).
 * Run manually:  $env:RUN_GROQ_SMOKE=1; npm test --workspace @meal-rescue/backend -- paywall-teaser.smoke
 *
 * Verifies the live OpenAI-compatible endpoint + prompt contract return safe,
 * well-formed curiosity copy grounded in (or honestly cold to) the move. The
 * exact hook phrasing is intentionally free-form from the model; brand rhythm
 * lives in the deterministic fallback. Prints the copy for human eyeballing.
 */
import { describe, expect, it, jest } from '@jest/globals';
import 'dotenv/config';

import { PaywallTeaserService } from '../src/services/paywall-teaser.service';

const isOptedIn = process.env.RUN_GROQ_SMOKE === '1';
const runIt = isOptedIn ? it : it.skip;
jest.setTimeout(120_000);

const SAFE = (s: string): boolean =>
  s.length >= 4 &&
  !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0F}/u.test(s) &&
  !/[{}[\]]|`/.test(s) &&
  !/\b(subscription|unlimited|ad-free|adfree|premium|upgrade|subscribe|pricing|smart ai|\bpro\b)\b/i.test(
    s,
  );

describe('paywall teaser REAL Groq smoke (opt-in)', () => {
  const service = new PaywallTeaserService();

  runIt('serves AI copy grounded in the previous move (egg on rice)', async () => {
    const teaser = await service.generate({
      foods: ['rice'],
      added: ['fried egg'],
      decision: 'selected',
      outcome: 'loved_it',
      label: 'Add a fried egg on top and let the yolk do the work.',
    });

    // eslint-disable-next-line no-console
    console.log(`\n[egg-on-rice] source=${teaser.source} model=${teaser.modelVersion}`);
    // eslint-disable-next-line no-console
    console.log(`  opener: ${teaser.opener}`);
    // eslint-disable-next-line no-console
    console.log(`  hook:   ${teaser.hook}`);

    expect(teaser.source).toBe('ai');
    expect(SAFE(teaser.opener)).toBe(true);
    expect(SAFE(teaser.hook)).toBe(true);
    expect(teaser.opener).not.toEqual(teaser.hook);
    expect(teaser.modelVersion).toBeTruthy();
  });

  runIt('serves an honest cold-start line when there is no previous move', async () => {
    const teaser = await service.generate(null);

    // eslint-disable-next-line no-console
    console.log(`\n[cold-start] source=${teaser.source} model=${teaser.modelVersion}`);
    // eslint-disable-next-line no-console
    console.log(`  opener: ${teaser.opener}`);
    // eslint-disable-next-line no-console
    console.log(`  hook:   ${teaser.hook}`);

    expect(['ai', 'fallback']).toContain(teaser.source);
    expect(SAFE(teaser.opener)).toBe(true);
    expect(SAFE(teaser.hook)).toBe(true);
    expect(teaser.opener).not.toMatch(/you liked|remember when|last time you/i);
  });
});
