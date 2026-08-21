/**
 * OpenAI implementation of LlmClient.
 *
 * Uses JSON mode + zod validation with one retry on malformed output
 * (per the system-prompts doc: "Post-generation validation with retry
 * logic"). Vision requests attach the image as a data URI content part.
 */
import OpenAI from 'openai';
import type { ZodType, ZodTypeDef } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import type { CompleteJsonOptions, CompleteJsonResult, LlmClient, TokenUsage } from './llm-client';

export class OpenAiLlmClient implements LlmClient {
  readonly versionLabel: string;

  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      timeout: env.AI_REQUEST_TIMEOUT_MS,
      maxRetries: 1, // transport-level retry; schema retry handled below
    });
    this.versionLabel = `openai:${env.LLM_MODEL_VERSION ?? 'default'}`;
  }

  async completeJson<T>(options: CompleteJsonOptions<T>): Promise<CompleteJsonResult<T>> {
    const userText =
      typeof options.userContent === 'string'
        ? options.userContent
        : JSON.stringify(options.userContent, null, 2);

    const content: Array<OpenAI.Chat.Completions.ChatCompletionContentPart> = [
      { type: 'text', text: userText },
    ];
    if (options.imageBase64) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${options.imageBase64}` },
      });
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= env.AI_MAX_RETRIES; attempt++) {
      const response = await this.client.chat.completions.create({
        model: options.modelName,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const raw = response.choices[0]?.message?.content;
      const usage: TokenUsage | null = response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
            model: response.model,
          }
        : null;

      if (raw) {
        const parsed = safeParseJson(raw, options.schema);
        if (parsed.success) {
          return { data: parsed.data, usage };
        }
        lastError = parsed.error;
      } else {
        lastError = new Error('Model returned empty content');
      }
    }

    throw new AppError({
      category: ErrorCategory.AI_MODEL_FAILURE,
      code: 'AI_INVALID_RESPONSE',
      message: 'AI model returned an invalid response after retries',
      statusCode: 502,
      recoverable: true,
      suggestedAction: 'Try again in a moment',
      details:
        lastError instanceof Error ? { reason: lastError.message } : { reason: String(lastError) },
    });
  }
}

function safeParseJson<T>(
  raw: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
): { success: true; data: T } | { success: false; error: unknown } {
  try {
    return { success: true, data: schema.parse(JSON.parse(raw)) };
  } catch (error) {
    return { success: false, error };
  }
}
