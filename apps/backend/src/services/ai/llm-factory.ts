/**
 * Picks the LLM implementation from configuration.
 * One line to flip the whole pipeline between real AI and deterministic
 * local logic - no call-site changes anywhere.
 *
 * When a key is present the real client is wrapped in ResilientLlmClient:
 * provider failures degrade to the heuristic engine per request instead of
 * surfacing as 502s (architecture doc: graceful degradation).
 */
import { env } from '../../config/env';
import { HeuristicLlmClient } from './heuristic-llm-client';
import type { LlmClient } from './llm-client';
import { OpenAiLlmClient } from './openai-llm-client';
import { ResilientLlmClient } from './resilient-llm-client';

export function createLlmClient(): LlmClient {
  if (env.OPENAI_API_KEY) {
    const primary = new OpenAiLlmClient(env.OPENAI_API_KEY, env.OPENAI_BASE_URL);
    return new ResilientLlmClient(primary, new HeuristicLlmClient());
  }
  return new HeuristicLlmClient();
}

/**
 * Dedicated vision client.
 *
 * Photo analysis (meal capture, kitchen capture, kitchen identify) uses
 * OPENROUTER_VISION_API_KEY + OPENROUTER_VISION_MODEL. Falls back to the
 * main text key so dev/test environments without the vision-only key still
 * boot and degrade to the heuristic engine like every other stage.
 */
export function createVisionLlmClient(): LlmClient {
  const visionKey = env.OPENROUTER_VISION_API_KEY ?? env.OPENAI_API_KEY;
  if (visionKey) {
    const primary = new OpenAiLlmClient(visionKey, env.OPENAI_BASE_URL);
    return new ResilientLlmClient(primary, new HeuristicLlmClient());
  }
  return new HeuristicLlmClient();
}
