import {
  DISH_SUGGESTIONS,
  pickDishForUser,
} from '../src/services/notifications/pick-for-me.scheduler';

describe('pick-for-me scheduler', () => {
  describe('DISH_SUGGESTIONS map', () => {
    it('has suggestions for common ingredients', () => {
      expect(DISH_SUGGESTIONS.chicken).toBeDefined();
      expect(DISH_SUGGESTIONS.rice).toBeDefined();
      expect(DISH_SUGGESTIONS.eggs).toBeDefined();
      expect(DISH_SUGGESTIONS.pasta).toBeDefined();
    });

    it('returns strings for all entries', () => {
      for (const [key, value] of Object.entries(DISH_SUGGESTIONS)) {
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });

  describe('pickDishForUser', () => {
    const mockModels = {
      Rescue: {
        findAll: jest.fn(),
      },
    } as any;

    it('returns null when no past rescues and no matching pantry items', async () => {
      mockModels.Rescue.findAll.mockResolvedValue([]);
      const result = await pickDishForUser(mockModels, 'user-1', ['exotic_ingredient']);
      // Should still return something based on fallback logic
      expect(result).not.toBeNull();
      expect(result!.ingredients).toEqual(['exotic_ingredient']);
    });

    it('uses a past accepted rescue dish', async () => {
      mockModels.Rescue.findAll.mockResolvedValue([
        {
          selectedRecommendation: { name: 'Chicken Tikka Masala' },
        },
        {
          selectedRecommendation: { name: 'Pasta Carbonara' },
        },
      ]);
      const result = await pickDishForUser(mockModels, 'user-1', ['chicken', 'rice']);
      expect(result).not.toBeNull();
      // Should match chicken from pantry to chicken tikka masala
      expect(result!.dish).toBe('Chicken Tikka Masala');
    });

    it('falls back to DISH_SUGGESTIONS when no past rescues', async () => {
      mockModels.Rescue.findAll.mockResolvedValue([]);
      const result = await pickDishForUser(mockModels, 'user-1', ['chicken', 'broccoli']);
      expect(result).not.toBeNull();
      expect(result!.dish).toBe('chicken stir-fry');
      expect(result!.ingredients).toEqual(['chicken', 'broccoli']);
    });

    it('generates a generic bowl for unmatched ingredients', async () => {
      mockModels.Rescue.findAll.mockResolvedValue([]);
      const result = await pickDishForUser(mockModels, 'user-1', ['quinoa']);
      expect(result).not.toBeNull();
      expect(result!.dish).toBe('quinoa bowl');
    });
  });
});
