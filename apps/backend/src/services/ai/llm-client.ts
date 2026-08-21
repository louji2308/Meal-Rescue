/**
 * LLM client abstraction.
 *
 * The pipeline talks to THIS interface only - never to a provider SDK
 * directly. Two implementations exist:
 *
 * - OpenAiLlmClient: real model calls (used when OPENAI_API_KEY is set)
 * - HeuristicLlmClient: deterministic local logic (no network). Used when
 *   no key is configured (dev/test/CI) AND as the runtime fallback when
 *   the provider fails - the architecture doc's graceful degradation rule:
 *   "LLM ranking fails -> use deterministic scoring".
 *
 * Both implementations satisfy identical contracts, so behavior - and the
 * user experience - is the same either way.
 */
import type { ZodType, ZodTypeDef } from 'zod';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

export interface CompleteJsonOptions<T> {
  systemPrompt: string;
  /** User-turn payload; string, or object to be sent as pretty JSON. */
  userContent: string | Record<string, unknown>;
  /**
   * Data URI or base64 JPEG payload for vision requests.
   */
  imageBase64?: string;
  // Input side is `unknown` so schemas using .catch()/.default() (whose
  // input type differs from output) still satisfy the contract.
  schema: ZodType<T, ZodTypeDef, unknown>;
  modelName: string;
}

export interface CompleteJsonResult<T> {
  data: T;
  usage: TokenUsage | null;
}

export interface LlmClient {
  /** Identifier used in logs and rescue records (modelVersion column). */
  readonly versionLabel: string;
  completeJson<T>(options: CompleteJsonOptions<T>): Promise<CompleteJsonResult<T>>;
}
