import type { Rescue } from '../src/database/models/rescue.model';
import { sendToUser } from '../src/services/notifications/notification.service';
import {
  AFTERCARE_BUTTONS,
  aftercareContextFromRescue,
  fallbackAftercareCopy,
  sendAftercareForRescue,
  writeAftercareCopy,
} from '../src/services/v2/aftercare-notification.service';

/**
 * Aftercare notification sender tests.
 *
 * These cover the deterministic guardrails that own the +30 min check-in:
 *   1. Context extraction turns a rescue row into dish + change + foods.
 *   2. Fallback copy reads like a human ("About those noodles… was the
 *      scrambled egg and spring onion worth it?") and clamps overflow.
 *   3. Model junk degrades to that same deterministic template.
 *   4. The gates (cooldown, one push per rescue, FEEDBACK_DISABLED) and the
 *      NOTIFICATION_SENT ledger behave exactly like the eligibility service.
 */

jest.mock('../src/services/notifications/notification.service', () => ({
  sendToUser: jest.fn(),
}));

const mockedSendToUser = sendToUser as jest.Mock;

const RESCUE_SHAPE = {
  id: 'rescue-1',
  userId: 'user-1',
  originalMeal: { name: 'noodles' },
  detectedIngredients: { items: ['noodles', 'peas', 'egg'] },
  selectedRecommendation: { label: 'scrambled egg and spring onion' },
  createdAt: new Date('2026-01-01T10:00:00Z'),
} as unknown as Rescue;

const pendingDb = () => ({
  Rescue: {
    findByPk: async () => Promise.resolve(RESCUE_SHAPE),
  },
  User: {
    findByPk: async () => Promise.resolve({ id: 'user-1', feedbackEnabled: true }),
  },
  DecisionEvent: {
    count: async () => Promise.resolve(0),
    findOne: async () => Promise.resolve({ createdAt: new Date('2026-01-01T10:00:00Z') }),
    create: async (_row: Record<string, unknown>) => Promise.resolve(undefined),
  },
});

const frozenNow = new Date('2026-01-01T11:00:00Z'); // 60 min after completion

describe('aftercare context extraction', () => {
  it('names the dish, the change, and the foods', () => {
    const ctx = aftercareContextFromRescue(RESCUE_SHAPE);
    expect(ctx.dish).toBe('noodles');
    expect(ctx.change).toBe('scrambled egg and spring onion');
    expect(ctx.foods).toContain('peas');
  });

  it('falls back to a food name when there is no dish label', () => {
    const rescue = {
      ...RESCUE_SHAPE,
      originalMeal: { html: '<p>some pasta</p>' },
      detectedIngredients: { items: ['pasta', 'garlic'] },
      selectedRecommendation: { action: 'roast the garlic' },
    } as unknown as Rescue;
    const ctx = aftercareContextFromRescue(rescue);
    expect(ctx.dish).toBe('pasta');
    expect(ctx.change).toBe('roast the garlic');
  });

  it('still yields a usable context when everything is empty', () => {
    const rescue = {
      id: 'rescue-empty',
      userId: 'user-1',
      originalMeal: { note: '' },
      detectedIngredients: {},
      selectedRecommendation: null,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    } as unknown as Rescue;
    const ctx = aftercareContextFromRescue(rescue);
    expect(ctx.dish.length).toBeGreaterThan(0);
  });
});

describe('fallback aftercare copy', () => {
  it('writes the noodle-style line referencing dish and change', () => {
    const copy = fallbackAftercareCopy({
      dish: 'noodles',
      change: 'scrambled egg and spring onion',
      foods: ['noodles'],
    });
    expect(copy.title).toBe('About those noodles\u2026');
    expect(copy.body).toBe('was the scrambled egg and spring onion worth it?');
  });

  it('asks about the dish itself when there is no change', () => {
    const copy = fallbackAftercareCopy({ dish: 'stew', change: null, foods: [] });
    expect(copy.title).toMatch(/^About those stew/);
    expect(copy.body).toContain('worth it');
  });

  it('clamps overlong input instead of breaking layout', () => {
    const copy = fallbackAftercareCopy({
      dish: 'noodles'.repeat(20),
      change: 'the smoked paprika and a pinch of chili crisp'.repeat(4),
      foods: [],
    });
    expect(copy.title.length).toBeLessThanOrEqual(41);
    expect(copy.body.length).toBeLessThanOrEqual(91);
  });
});

describe('aftercare copy model validation', () => {
  it('accepts a model line that clears every check', async () => {
    const llm = {
      completeJson: async () => ({
        data: {
          title: 'About those noodles\u2026',
          body: 'was the scrambled egg worth it?',
        },
      }),
    } as never;
    const copy = await writeAftercareCopy(
      { dish: 'noodles', change: 'scrambled egg', foods: [] },
      llm,
    );
    expect(copy.title).toBe('About those noodles\u2026');
    expect(copy.body).toBe('was the scrambled egg worth it?');
  });

  it('degrades to the template when the title skips the ellipsis', async () => {
    const llm = {
      completeJson: async () => ({
        data: { title: 'How were the noodles?', body: 'was the egg worth it?' },
      }),
    } as never;
    const copy = await writeAftercareCopy({ dish: 'noodles', change: 'egg', foods: [] }, llm);
    expect(copy.title).toMatch(/^About those/);
  });

  it('degrades to the template when the body is not a question or too long', async () => {
    const llm = {
      completeJson: async () => ({
        data: { title: 'About those noodles\u2026', body: 'a'.repeat(120) },
      }),
    } as never;
    const copy = await writeAftercareCopy({ dish: 'noodles', change: 'egg', foods: [] }, llm);
    expect(copy.title).toMatch(/^About those noodles/);
    expect(copy.body).toMatch(/\?$/);
  });

  it('never throws when the provider fails entirely', async () => {
    const llm = {
      completeJson: async () => {
        throw new Error('network down');
      },
    } as never;
    const copy = await writeAftercareCopy({ dish: 'noodles', change: null, foods: [] }, llm);
    expect(copy.title).toMatch(/^About those/);
    expect(copy.body.length).toBeGreaterThan(4);
  });
});

describe('aftercare buttons', () => {
  it('are exactly the three fixed answers with fitting ids', () => {
    expect(AFTERCARE_BUTTONS).toEqual([
      { id: 'loved_it', text: 'Loved the change.' },
      { id: 'was_ok', text: 'It worked.' },
      { id: 'not_great', text: 'Not really.' },
    ]);
  });
});

describe('sendAftercareForRescue gates', () => {
  beforeEach(() => {
    mockedSendToUser.mockReset();
    mockedSendToUser.mockResolvedValue('dry_run');
  });

  it('skips when the cooldown has not elapsed', async () => {
    const db = pendingDb();
    db.DecisionEvent.findOne = async () =>
      Promise.resolve({ createdAt: new Date('2026-01-01T10:59:00Z') });
    const result = await sendAftercareForRescue(db as never, 'rescue-1', frozenNow);
    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('COOLDOWN');
    expect(mockedSendToUser).not.toHaveBeenCalled();
  });

  it('skips when a check-in was already recorded for the rescue', async () => {
    const db = pendingDb();
    db.DecisionEvent.count = async () => Promise.resolve(1);
    const result = await sendAftercareForRescue(db as never, 'rescue-1', frozenNow);
    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('ALREADY_SENT');
  });

  it('skips when the user disabled feedback', async () => {
    const db = pendingDb();
    db.User.findByPk = async () => Promise.resolve({ id: 'user-1', feedbackEnabled: false });
    const result = await sendAftercareForRescue(db as never, 'rescue-1', frozenNow);
    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('FEEDBACK_DISABLED');
  });

  it('sends with the three buttons + rescue id and records the ledger event', async () => {
    const db = pendingDb();
    const events: Array<Record<string, unknown>> = [];
    db.DecisionEvent.create = async (row: Record<string, unknown>) => {
      events.push(row);
      return Promise.resolve(undefined);
    };

    const result = await sendAftercareForRescue(db as never, 'rescue-1', frozenNow);

    expect(result.outcome).toBe('dry_run');
    expect(mockedSendToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'aftercare',
        buttons: AFTERCARE_BUTTONS,
        data: expect.objectContaining({ rescueId: 'rescue-1' }),
      }),
    );
    expect(events.some((row) => row.eventType === 'NOTIFICATION_SENT')).toBe(true);
  });

  it('does NOT ledger when delivery failed, so the next tick can retry', async () => {
    const db = pendingDb();
    const create = jest.fn(async () => Promise.resolve(undefined));
    db.DecisionEvent.create = create;
    mockedSendToUser.mockResolvedValue('failed');
    const result = await sendAftercareForRescue(db as never, 'rescue-1', frozenNow);
    expect(result.outcome).toBe('failed');
    expect(create).not.toHaveBeenCalled();
  });
});
