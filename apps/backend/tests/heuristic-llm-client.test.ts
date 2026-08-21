/**
 * Heuristic LLM client tests - the deterministic brain that runs when no
 * API key is configured and when the provider fails at runtime.
 */
import { HeuristicLlmClient } from '../src/services/ai/heuristic-llm-client';
import {
  rankingResultSchema,
  textExtractionSchema,
  visionResultSchema,
} from '../src/services/ai/llm-schemas';

describe('heuristic llm client', () => {
  const client = new HeuristicLlmClient();

  describe('vision fallback', () => {
    it('returns an honest unknown-meal result that routes the user to text input', async () => {
      const { data } = await client.completeJson({
        systemPrompt: 'x',
        userContent: 'analyze',
        imageBase64: 'aGVsbG8=',
        schema: visionResultSchema,
        modelName: 'heuristic',
      });

      expect(data.foods).toHaveLength(0);
      expect(data.uncertainties[0]!.confidence).toBeLessThan(0.7);
      expect(data.uncertainties[0]!.reason).toMatch(/describe/i);
    });
  });

  describe('text extraction', () => {
    it('recognizes known ingredients and derives components', async () => {
      const { data } = await client.completeJson({
        systemPrompt: 'x',
        userContent: 'instant noodles with egg',
        schema: textExtractionSchema,
        modelName: 'heuristic',
      });

      const names = data.ingredients.map((ingredient) => ingredient.name);
      expect(names).toContain('instant noodles');
      expect(names).toContain('egg');
      expect(data.components.carbohydrates).toBe(true);
      expect(data.components.protein).toBe(true);
      expect(data.components.fiber_sources).toBe(false);
    });

    it('keeps unrecognized input as a low-confidence food instead of failing', async () => {
      const { data } = await client.completeJson({
        systemPrompt: 'x',
        userContent: 'grandma mystery casserole',
        schema: textExtractionSchema,
        modelName: 'heuristic',
      });

      expect(data.foods[0]!.confidence).toBeLessThan(0.7);
      expect(data.uncertainties.length).toBeGreaterThan(0);
    });
  });

  describe('ranking', () => {
    const payload = {
      meal: { foods: ['instant noodles'] },
      missingComponents: ['protein', 'fiber_sources'],
      constraints: {},
      preferences: { favorites: [], avoided: [] },
      candidates: [
        {
          id: 'cand-egg',
          type: 'addition',
          additions: [{ name: 'egg' }],
          substitutions: [],
          estimatedTime: 4,
          cookingSteps: 2,
          nutritionalImprovement: { protein: 'added' },
          preferenceAlignment: 0.5,
        },
        {
          id: 'cand-spinach-egg',
          type: 'addition',
          additions: [{ name: 'spinach' }, { name: 'egg' }],
          substitutions: [],
          estimatedTime: 6,
          cookingSteps: 3,
          nutritionalImprovement: { protein: 'added', fiber_sources: 'added' },
          preferenceAlignment: 0.5,
        },
      ],
    };

    it('scores every candidate, sorts best-first, writes friendly explanations', async () => {
      const { data } = await client.completeJson({
        systemPrompt: 'x',
        userContent: payload,
        schema: rankingResultSchema,
        modelName: 'heuristic',
      });

      expect(data.rankedCandidates).toHaveLength(2);
      const [first, second] = data.rankedCandidates;
      expect(first!.overallScore).toBeGreaterThanOrEqual(second!.overallScore);

      for (const entry of data.rankedCandidates) {
        expect(entry.explanation).not.toMatch(/macronutrient|satiety/i);
        expect(entry.explanation.length).toBeGreaterThan(10);
      }
    });

    it('covers missing components in scoring (coverage beats nothing)', async () => {
      const { data } = await client.completeJson({
        systemPrompt: 'x',
        userContent: payload,
        schema: rankingResultSchema,
        modelName: 'heuristic',
      });

      // cand-spinach-egg covers both gaps; even with higher friction its
      // coverage should keep it competitive - assert both got real scores.
      const scores = data.rankedCandidates.map((entry) => entry.overallScore);
      expect(scores.every((score) => score > 0 && score <= 1)).toBe(true);
    });
  });
});
