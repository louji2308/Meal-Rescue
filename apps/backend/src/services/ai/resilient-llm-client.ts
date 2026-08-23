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
import type { CompleteJsonOptions, CompleteJsonResult, LlmClient } from './llm-client';

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
