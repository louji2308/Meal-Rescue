/**
 * AiPlannerService AI-first guarantees — specifically that the heuristic /
 * offline LLM client can never silently produce a plan.
 *
 * The planner has NO deterministic fallback: when the LLM is unavailable the
 * path must surface a clear, recoverable error instead of a fake plan.
 */
import { describe, expect, it } from '@jest/globals';

import { HeuristicLlmClient } from '../../src/services/ai/heuristic-llm-client';
import { HouseholdService } from '../../src/services/common-table/household.service';
import { AiPlannerService } from '../../src/services/meal-memory/ai-planner.service';
import { WorldStateService } from '../../src/services/meal-memory/world-state.service';

describe('AiPlannerService AI-first guarantees', () => {
  it('rejects planning when the only available client is the heuristic engine', async () => {
    // The unavailable check fires before any household/world state is touched,
    // so bare stubs are enough to prove the contract.
    const service = new AiPlannerService(
      new HeuristicLlmClient(),
      {} as unknown as WorldStateService,
      {} as unknown as HouseholdService,
    );

    await expect(service.plan('user-1', null, 'plan me for tomorrow')).rejects.toMatchObject({
      code: 'AI_PLANNER_UNAVAILABLE',
      statusCode: 503,
      recoverable: true,
    });
  });
});
