import type {
  CompleteJsonOptions,
  CompleteJsonResult,
  LlmClient,
} from '../src/services/ai/llm-client';
import { fallbackCopy, writePushCopy } from '../src/services/notifications/copywriter.service';
import { isQuietHours, localDayKey } from '../src/services/notifications/notification.service';
import {
  localHourOfDay,
  medianRescueHour,
} from '../src/services/notifications/rescue-window.scheduler';

/** Fixed instant for all date math: 2026-08-23T22:00:00Z (a Sunday). */
const T = new Date('2026-08-23T22:00:00.000Z');

function quietUser(
  overrides: Partial<{ start: number | null; end: number | null; tz: number }> = {},
) {
  return {
    quietStartHour: overrides.start ?? null,
    quietEndHour: overrides.end ?? null,
    tzOffsetMinutes: overrides.tz ?? 0,
  };
}

describe('localDayKey', () => {
  it('returns the UTC day at offset zero', () => {
    expect(localDayKey(0, T)).toBe('2026-08-23');
  });

  it('follows the client-reported offset convention (minutes west positive)', () => {
    // UTC+2 (offset -120): local is ahead -> already the next day.
    expect(localDayKey(-120, T)).toBe('2026-08-24');
    // UTC+2 reported as -120; UTC-5 reported as +300 -> local behind.
    expect(localDayKey(300, T)).toBe('2026-08-23');
    // Late-night UTC flips to the previous local day for eastern offsets...
    const lateNight = new Date('2026-08-23T01:00:00.000Z');
    expect(localDayKey(-120, lateNight)).toBe('2026-08-23');
  });
});

describe('isQuietHours', () => {
  it('defaults to the 22..8 wrap-around window', () => {
    expect(isQuietHours(quietUser(), new Date('2026-08-23T23:00:00Z'))).toBe(true);
    expect(isQuietHours(quietUser(), new Date('2026-08-23T07:59:00Z'))).toBe(true);
    expect(isQuietHours(quietUser(), new Date('2026-08-23T08:00:00Z'))).toBe(false);
    expect(isQuietHours(quietUser(), new Date('2026-08-23T21:59:00Z'))).toBe(false);
  });

  it('respects user-configured windows including wrap-around', () => {
    expect(isQuietHours(quietUser({ start: 13, end: 14 }), new Date('2026-08-23T13:30:00Z'))).toBe(
      true,
    );
    expect(isQuietHours(quietUser({ start: 13, end: 14 }), new Date('2026-08-23T14:00:00Z'))).toBe(
      false,
    );
    expect(isQuietHours(quietUser({ start: 23, end: 5 }), new Date('2026-08-23T02:00:00Z'))).toBe(
      true,
    );
    expect(isQuietHours(quietUser({ start: 23, end: 5 }), new Date('2026-08-23T12:00:00Z'))).toBe(
      false,
    );
  });

  it('is never quiet when start equals end', () => {
    expect(isQuietHours(quietUser({ start: 0, end: 0 }), T)).toBe(false);
    expect(isQuietHours(quietUser({ start: 22, end: 22 }), T)).toBe(false);
  });

  it('evaluates hours in the user local timeline, not server time', () => {
    // 20:00 UTC is 22:00 local at UTC+2 (offset -120) -> quiet by default.
    expect(isQuietHours(quietUser({ tz: -120 }), new Date('2026-08-23T20:00:00Z'))).toBe(true);
    // Same instant is 15:00 local at UTC-5 (offset +300) -> awake.
    expect(isQuietHours(quietUser({ tz: 300 }), new Date('2026-08-23T20:00:00Z'))).toBe(false);
  });
});

describe('medianRescueHour / localHourOfDay', () => {
  it('computes the local hour across the tz shift', () => {
    expect(localHourOfDay(0, T)).toBe(22);
    expect(localHourOfDay(-120, T)).toBe(24 % 24); // 00:00 next local day
    expect(localHourOfDay(300, T)).toBe(17);
  });

  it('takes the middle sample for odd counts', () => {
    const dates = ['09:10', '13:40', '18:20'].map((hm) => new Date(`2026-08-23T${hm}:00Z`));
    expect(medianRescueHour(dates, 0)).toBe(13);
  });

  it('rounds down between the two middle samples for even counts', () => {
    const dates = ['09:10', '10:40'].map((hm) => new Date(`2026-08-23T${hm}:00Z`));
    expect(medianRescueHour(dates, 0)).toBe(9);
  });

  it('returns null with no history (cold-start guard)', () => {
    expect(medianRescueHour([], 0)).toBeNull();
  });
});

describe('fallbackCopy templates', () => {
  it('writes a rescue_window nudge naming the food and dish', () => {
    const copy = fallbackCopy('rescue_window', {
      foods: ['instant noodles'],
      mealtimeLabel: 'lunch',
      mins: 15,
    });
    expect(copy.title).toContain('lunch');
    expect(copy.body).toContain('instant noodles');
    expect(copy.title.length).toBeLessThanOrEqual(40);
    expect(copy.body.length).toBeLessThanOrEqual(90);
  });

  it('writes a spoiler_alert naming the expiring ingredient', () => {
    const copy = fallbackCopy('spoiler_alert', { item: 'spinach', mins: 20 });
    expect(copy.title).toContain('spinach');
    expect(copy.body).toMatch(/dinner|minutes/);
  });

  it('survives missing context without exceeding limits', () => {
    for (const kind of ['rescue_window', 'spoiler_alert', 'generic'] as const) {
      const copy = fallbackCopy(kind, {});
      expect(copy.title.length).toBeLessThanOrEqual(40);
      expect(copy.body.length).toBeLessThanOrEqual(90);
      expect(copy.title).not.toMatch(/\n/);
    }
  });
});

class StubLlm implements LlmClient {
  readonly versionLabel = 'stub:test';
  constructor(private readonly result: () => Promise<CompleteJsonResult<unknown>>) {}
  completeJson<T>(_options: CompleteJsonOptions<T>): Promise<CompleteJsonResult<T>> {
    return this.result() as Promise<CompleteJsonResult<T>>;
  }
}

describe('writePushCopy degradation', () => {
  const input = { kind: 'rescue_window' as const, context: { foods: ['rice'], mins: 10 } };

  it('uses model copy when it satisfies the length contract', async () => {
    const llm = new StubLlm(async () => ({
      data: { title: 'Rice rescue window', body: 'Fried rice in ten minutes?' },
      usage: null,
    }));
    await expect(writePushCopy(input, llm)).resolves.toEqual({
      title: 'Rice rescue window',
      body: 'Fried rice in ten minutes?',
    });
  });

  it('falls back on overlength model output', async () => {
    const llm = new StubLlm(async () => ({
      data: {
        title: 'x'.repeat(41),
        body: 'fine body',
      },
      usage: null,
    }));
    const copy = await writePushCopy(input, llm);
    expect(copy.title).not.toBe('x'.repeat(41));
    expect(copy.title.length).toBeLessThanOrEqual(40);
  });

  it('falls back when the LLM throws (zero credits / no network)', async () => {
    const llm = new StubLlm(async () => {
      throw new Error('insufficient credits');
    });
    const copy = await writePushCopy(input, llm);
    expect(copy.body).toContain('rice');
  });

  it('falls back on malformed JSON payloads', async () => {
    const llm = new StubLlm(
      async () =>
        ({ data: { nonsense: true }, usage: null }) as unknown as CompleteJsonResult<never>,
    );
    const copy = await writePushCopy(input, llm);
    expect(copy.body).toContain('rice');
  });
});
