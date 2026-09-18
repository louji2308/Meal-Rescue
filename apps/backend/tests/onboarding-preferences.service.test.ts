import { OnboardingPreferencesService } from '../src/services/onboarding/onboarding-preferences.service';

type SnakeRow = Record<string, unknown>;

function fakes() {
  const rows: SnakeRow[] = [];
  const signals: Record<string, unknown>[] = [];
  const seeded: string[] = [];

  const models = {
    UserTastePreferences: {
      async upsert(row: SnakeRow) {
        rows.length = 0;
        rows.push(row);
      },
      async findOne({ where }: { where: { userId: string } }) {
        const row = rows.find((r) => r.userId === where.userId);
        return row ? { get: () => ({ ...row }) } : null;
      },
    },
  };

  const tasteJournal = {
    addSignal: jest.fn(async (args: Record<string, unknown>) => {
      signals.push(args);
    }),
  };

  const tasteMemory = {
    seedOnboardingHardNos: jest.fn(async (_userId: string, items: string[]) => {
      seeded.push(...items);
    }),
  };

  return {
    models,
    tasteJournal,
    tasteMemory,
    rows,
    signals,
    seeded,
  };
}

describe('OnboardingPreferencesService', () => {
  it('persists every answer and records flavor/texture signals', async () => {
    const { models, tasteJournal, tasteMemory, rows, signals, seeded } = fakes();
    const svc = new OnboardingPreferencesService(
      models as never,
      tasteJournal as never,
      tasteMemory as never,
    );

    const result = await svc.save('u1', {
      hardNos: { allergies: ['Peanuts'], strongDislikes: ['Cilantro'] },
      flavorPersonality: ['bright_tangy', 'hot_spicy'],
      texturePreferences: { crunchiness: 'crunchy', moistness: 'juicy' },
      adventurousness: 'surprise_me',
      rescueNeed: ['more flavor'],
      priorities: ['enjoy'],
    });

    expect(result.saved).toBe(true);
    expect(result.recorded).toEqual({ flavors: 2, textures: 2, hardNos: 2 });

    const stored = rows[0]!;
    expect(stored.hardNos).toEqual({
      allergies: ['peanuts'],
      avoidIngredients: [],
      dietaryRestrictions: [],
      religiousCultural: [],
      strongDislikes: ['cilantro'],
    });
    expect(stored.flavorPersonality).toEqual(['bright_tangy', 'hot_spicy']);
    expect(stored.texturePreferences).toEqual({ crunchiness: 'crunchy', moistness: 'juicy' });
    expect(stored.adventurousness).toBe('surprise_me');
    expect(stored.rescueNeed).toEqual(['more flavor']);
    expect(stored.priorities).toEqual(['enjoy']);

    const flavorSignals = signals.filter((s) => s.dimension === 'flavor');
    expect(flavorSignals.map((s) => s.value)).toEqual(['Bright & Tangy', 'Hot & Spicy']);
    expect(flavorSignals[0]!.polarity).toBe('positive');
    expect(flavorSignals[0]!.source).toBe('ONBOARDING');
    expect(flavorSignals[0]!.note).toBe('Which direction usually wins?');

    const textureSignals = signals.filter((s) => s.dimension === 'texture');
    expect(textureSignals.map((s) => s.value).sort()).toEqual(['Crunchy', 'Juicy']);

    const hardNoSignals = signals.filter((s) => s.dimension === 'ingredient');
    expect(hardNoSignals.map((s) => s.value).sort()).toEqual(['cilantro', 'peanuts']);
    expect(hardNoSignals.every((s) => s.polarity === 'negative')).toBe(true);
    expect(hardNoSignals[0]!.note).toBe('What should Meal Rescue never suggest?');

    expect(seeded.sort()).toEqual(['cilantro', 'peanuts']);
    expect(tasteMemory.seedOnboardingHardNos).toHaveBeenCalledWith('u1', ['peanuts', 'cilantro']);
  });

  it('stores the verbatim question copy for every answer', async () => {
    const { models, tasteJournal, tasteMemory, rows, signals } = fakes();
    const svc = new OnboardingPreferencesService(
      models as never,
      tasteJournal as never,
      tasteMemory as never,
    );

    await svc.save('u1', {
      hardNos: { allergies: ['Dairy'] },
      questions: {
        hardNos: 'What should Meal Rescue never suggest?',
        texturePairs: 'Texture matters too. Pick one from each pair.',
      },
    });

    const stored = rows[0]!;
    expect(stored.questions).toMatchObject({
      hardNos: 'What should Meal Rescue never suggest?',
      texturePairs: 'Texture matters too. Pick one from each pair.',
      flavorPersonality: 'Which direction usually wins?',
      adventurousness: 'When I rescue your meal, I should usually...',
      rescueNeed: 'My meal usually needs...',
      priorities: 'What should I prioritize when I suggest something?',
    });
    const dairySignal = signals.find((s) => s.dimension === 'ingredient' && s.value === 'dairy')!;
    expect(dairySignal.polarity).toBe('negative');
    expect(dairySignal.note).toBe('What should Meal Rescue never suggest?');
  });

  it('returns the saved answers verbatim', async () => {
    const { models, tasteJournal, tasteMemory } = fakes();
    const svc = new OnboardingPreferencesService(
      models as never,
      tasteJournal as never,
      tasteMemory as never,
    );

    await svc.save('u1', {
      flavorPersonality: ['mild_familiar'],
      texturePreferences: { chewiness: 'tender' },
      adventurousness: 'stay_familiar',
    });

    const got = await svc.get('u1');
    expect(got).not.toBeNull();
    expect(got!.flavorPersonality).toEqual(['mild_familiar']);
    expect(got!.texturePreferences).toEqual({ chewiness: 'tender' });
    expect(got!.adventurousness).toBe('stay_familiar');
    expect(got!.hardNos).toEqual({
      allergies: [],
      avoidIngredients: [],
      dietaryRestrictions: [],
      religiousCultural: [],
      strongDislikes: [],
    });
    expect(got!.questions.texturePairs).toContain('Pick one from each pair');
  });

  it('returns null when nothing was saved', async () => {
    const { models, tasteJournal, tasteMemory } = fakes();
    const svc = new OnboardingPreferencesService(
      models as never,
      tasteJournal as never,
      tasteMemory as never,
    );
    expect(await svc.get('u1')).toBeNull();
  });
});
