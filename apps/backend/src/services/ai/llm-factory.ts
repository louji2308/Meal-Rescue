/**
 * Picks the LLM implementation from configuration.
 * One line to flip the whole pipeline between real AI and deterministic
 * local logic - no call-site changes anywhere.
 */
import { env } from '../../config/env';
import { HeuristicLlmClient } from './heuristic-llm-client';
import type { LlmClient } from './llm-client';
import { OpenAiLlmClient } from './openai-llm-client';

export function createLlmClient(): LlmClient {
  if (env.OPENAI_API_KEY) {
    return new OpenAiLlmClient(env.OPENAI_API_KEY);
  }
  return new HeuristicLlmClient();
}
