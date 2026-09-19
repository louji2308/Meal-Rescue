/**
 * Real-model-first wrapper with deterministic fallback.
 *
 * Architecture doc rule: "LLM ranking fails -> use deterministic scoring".
 * This applies that rule to every AI stage, not just ranking: if the
 * provider call fails (quota, network, malformed output after retries),
 * the request still completes via the heuristic engine instead of 502-ing
 * the user mid-demo.
 *
 * The trade-off is logged loudly so degraded answers are never mistaken
 * for model output when inspecting rescue records or server logs.
 */
import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../../lib/errors';
import type { CompleteJsonOptions, CompleteJsonResult, LlmClient } from './llm-client';

/**
 * True when the provider rejected our credentials. Unlike transient
 * failures (quota, network, malformed output), a bad API key is a config
 * error - it must be surfaced, never silently degraded to heuristics.
 */
function isAuthError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /(invalid|incorrect|expired|missing|no|bad).{0,20}api.?key|api.?key.{0,20}(invalid|incorrect|expired|missing|not found)|authentication|401|403/i.test(
    message,
  );
}

export class ResilientLlmClient implements LlmClient {
  readonly versionLabel: string;

  /** Set to true whenever a request was served by the fallback engine. */
  lastRequestDegraded = false;

  constructor(
    private readonly primary: LlmClient,
    private readonly fallback: LlmClient,
  ) {
    this.versionLabel = primary.versionLabel;
  }

  async completeJson<T>(options: CompleteJsonOptions<T>): Promise<CompleteJsonResult<T>> {
    try {
      const result = await this.primary.completeJson(options);
      this.lastRequestDegraded = false;
      return result;
    } catch (error) {
      if (isAuthError(error)) {
        this.lastRequestDegraded = false;
        // eslint-disable-next-line no-console
        console.warn(
          JSON.stringify({
            level: 'warn',
            msg: 'LLM API key rejected - NOT degrading, surfacing config error',
            primary: this.primary.versionLabel,
            reason: error instanceof Error ? error.message : String(error),
          }),
        );
        throw new AppError({
          category: ErrorCategory.AI_MODEL_FAILURE,
          code: 'AI_API_KEY_INVALID',
          message: 'The AI service API key is invalid or missing',
          statusCode: 502,
          recoverable: false,
          suggestedAction: 'Check the AI API key configuration on the server',
        });
      }
      this.lastRequestDegraded = true;
      const reason = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'LLM provider failed - served by deterministic fallback',
          primary: this.primary.versionLabel,
          reason,
        }),
      );
      return this.fallback.completeJson(options);
    }
  }
}
