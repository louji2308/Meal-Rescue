/**
 * Text-based meal extraction (implementation plan step 2.2, text path).
 * Voice input arrives here too, transcribed client-side - one contract,
 * no extra endpoint complexity.
 */
import { env } from '../../config/env';
import type { LlmClient } from './llm-client';
import { type TextExtractionResult, textExtractionSchema } from './llm-schemas';
import { PROMPT_VERSIONS, TEXT_EXTRACTION_SYSTEM_PROMPT } from './prompts';

export class TextExtractionService {
  constructor(private readonly llm: LlmClient) {}

  async extract(description: string): Promise<TextExtractionResult> {
    const response = await this.llm.completeJson({
      systemPrompt: TEXT_EXTRACTION_SYSTEM_PROMPT,
      userContent: `Meal description: "${description}"`,
      schema: textExtractionSchema,
      modelName: env.OPENAI_TEXT_MODEL,
    });
    return response.data;
  }
}

export const TEXT_PROMPT_VERSION = PROMPT_VERSIONS.textExtraction;
