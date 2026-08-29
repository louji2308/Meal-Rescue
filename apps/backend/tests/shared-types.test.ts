import {
  type FoodPersonality,
  type MemoryReason,
  type RankedRecommendation,
  type TasteJournalResponse,
  type TasteMemoryEntry,
} from '@meal-rescue/shared-types';

describe('taste memory shared types', () => {
  it('TasteMemoryEntry carries per-context affinity', () => {
    const entry: TasteMemoryEntry = {
      ingredient: 'cilantro',
      contextType: 'cuisine',
      contextValue: 'mexican',
      affinity: -0.8,
      confidence: 0.9,
      observationCount: 4,
      source: 'feedback',
      lastUpdated: '2026-08-29T00:00:00Z',
    };
    expect(entry.affinity).toBeLessThan(0);
  });

  it('RankedRecommendation accepts an optional resonance memory', () => {
    const memory: MemoryReason = {
      ingredient: 'avocado',
      contextValue: 'salad',
      affinity: 0.9,
      confidence: 0.95,
    };
    const rec: RankedRecommendation = {} as RankedRecommendation;
    const withMemory: RankedRecommendation & { resonanceMemory?: MemoryReason } = {
      ...rec,
      resonanceMemory: memory,
    };
    expect(withMemory.resonanceMemory?.ingredient).toBe('avocado');
  });

  it('FoodPersonality and journal response shapes exist', () => {
    const p: FoodPersonality = {
      traits: [
        {
          id: 'spice',
          label: 'Spice Adventurer',
          description: 'Loves heat in the right context',
          strength: 0.8,
        },
      ],
      bio: 'You love bold flavor when it fits the dish.',
    };
    const j: TasteJournalResponse = { entries: [], personality: p };
    expect(j.personality?.traits[0]!.strength).toBe(0.8);
  });
});
