import { z } from 'zod';

import { env } from '../../config/env';
import type { LlmClient } from '../ai/llm-client';
import { createLlmClient } from '../ai/llm-factory';

/**
 * GLM-written push copy with a deterministic fallback.
 *
 * Push notifications are the most user-visible AI surface in the app, so
 * the same graceful-degradation rule applies as everywhere else: if the
 * provider call fails (quota, network, malformed output) or the copy
 * misses the length contract, we ship a hand-written template instead of
 * dropping the notification. Templates are demo-grade on purpose - they
 * are what users actually see when credits run out.
 */

export const PUSH_TITLE_MAX = 40;
export const PUSH_BODY_MAX = 90;

const pushCopySchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export interface PushCopy {
  title: string;
  body: string;
}

export interface WritePushCopyInput {
  kind: 'rescue_window' | 'spoiler_alert' | 'generic';
  context?: Record<string, unknown>;
}

const SYSTEM_PROMPT = `You write push notifications for Meal Rescue, an app that rescues neglected meals and leftovers with minimal additions.

VOICE:
- A warm friend in the user's kitchen. Specific beats generic (name the food).
- Zero guilt-tripping about wasted food. Never scold, never "don't forget".
- NO health claims, NO calorie talk, NO emojis, NO clickbait, no ALL CAPS.

OUTPUT:
Respond ONLY with valid JSON: {"title": string, "body": string}.
Hard limits: title <= ${PUSH_TITLE_MAX} characters, body <= ${PUSH_BODY_MAX} characters.`;

function str(context: Record<string, unknown>, key: string): string | null {
  const value = context[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(context: Record<string, unknown>, key: string): number | null {
  const value = context[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

/** Single-line, hard-clamped copy so provider drift can never break layout. */
function clamp(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(0, max - 1))}\u2026`;
}

function listFoods(context: Record<string, unknown>): string {
  const raw = context.foods;
  const foods = Array.isArray(raw)
    ? raw.filter((f): f is string => typeof f === 'string' && Boolean(f.trim()))
    : [];
  const names = foods.map((f) => f.trim());
  if (names.length === 0) return str(context, 'item') ?? 'your leftovers';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}

/**
 * Deterministic per-kind templates. These are seen by real users whenever
 * the model is unavailable, so each one reads like product copy.
 */
export function fallbackCopy(
  kind: WritePushCopyInput['kind'],
  ctx: Record<string, unknown>,
): PushCopy {
  switch (kind) {
    case 'rescue_window': {
      const mealtimeLabel = str(ctx, 'mealtimeLabel') ?? 'your usual time';
      const dish = str(ctx, 'dish') ?? 'something good';
      const mins = num(ctx, 'mins') ?? 15;
      return {
        title: clamp(`Quick win before ${mealtimeLabel}`, PUSH_TITLE_MAX),
        body: clamp(
          `Your ${listFoods(ctx)} can become ${dish} in about ${mins} min.`,
          PUSH_BODY_MAX,
        ),
      };
    }
    case 'spoiler_alert': {
      const item = str(ctx, 'item') ?? 'an ingredient';
      const mins = num(ctx, 'mins') ?? 20;
      return {
        title: clamp(`${item} expires soon`, PUSH_TITLE_MAX),
        body: clamp(`Turn it into dinner in about ${mins} minutes - here's how.`, PUSH_BODY_MAX),
      };
    }
    default:
      return {
        title: clamp('Time for a quick rescue?', PUSH_TITLE_MAX),
        body: clamp('Open Meal Rescue and turn what you have into dinner.', PUSH_BODY_MAX),
      };
  }
}

function isValidCopy(copy: PushCopy): boolean {
  return copy.title.length <= PUSH_TITLE_MAX && copy.body.length <= PUSH_BODY_MAX;
}

/**
 * Writes push copy via the resilient LLM client; ANY failure (throw, bad
 * JSON, overlength output) degrades to the deterministic template.
 */
export async function writePushCopy(
  input: WritePushCopyInput,
  llm: LlmClient = createLlmClient(),
): Promise<PushCopy> {
  try {
    const result = await llm.completeJson({
      systemPrompt: SYSTEM_PROMPT,
      userContent: { kind: input.kind, context: input.context ?? {} },
      schema: pushCopySchema,
      modelName: env.OPENAI_TEXT_MODEL,
      maxTokens: 200,
    });
    const copy: PushCopy = { title: result.data.title, body: result.data.body };
    if (!isValidCopy(copy)) return fallbackCopy(input.kind, input.context ?? {});
    return copy;
  } catch {
    // Heuristic client has no strategy for this schema and throws - that
    // is the designed signal to use templates (zero-network environments).
    return fallbackCopy(input.kind, input.context ?? {});
  }
}
