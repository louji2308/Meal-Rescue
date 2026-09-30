import type {
  FeedbackJournalContext,
  FeedbackJournalNote,
  Satisfaction,
} from '@meal-rescue/shared-types';

import { env } from '../config/env';
import type { Db } from '../database/models';
import type { Rescue } from '../database/models/rescue.model';
import { strandId } from './taste-journal/preference-aggregation.service';
import { TasteSignalService } from './taste-journal/taste-signal.service';

/**
 * FeedbackJournalService - the feedback -> Taste Journal loop.
 *
 * On every feedback submit we take what the user SAW (dish, ingredients,
 * recommended move) plus what they SAID (satisfaction + optional free text)
 * and ask the model for ONE editorial journal entry. Grounding rules live in
 * the system prompt; a validator + one retry + a deterministic fallback make
 * sure the submit NEVER blocks on the LLM.
 *
 * The note attaches to a strand (e.g. STRAND:ingredient:spring onion) so the
 * journal renders it inside the existing chapters - never as a side feed.
 */
const SYSTEM_PROMPT = `You are the taste editor for Meal Rescue's Taste Journal - a personal,
editorial food-preferences diary kept for one reader.

INPUT
You receive JSON with:
  rescue: {
    dish,                 // what the user actually had (detected foods)
    detectedIngredients,  // the concrete items in it
    recommendedMove,      // what the app suggested (the rescue)
    reasoning             // why that move was chosen
  }
  feedback: {
    satisfaction,         // "better" | "same" | "not_for_me"
    feedbackText          // the user's own words (may be empty)
  }

TASK
Write ONE journal entry, shown under "Recently discovered":
  {"title": "...", "body": "..."}

GROUNDING RULES - NON-NEGOTIABLE
1. Use ONLY facts from the input. Never invent an ingredient, dish,
   cuisine, time, or opinion that is not present in the input.
2. The title must anchor on a specific food fact from the input - an
   item from detectedIngredients, or the dish / recommendedMove.
3. The body MUST reference the actual rescue (the dish or what was
   added/moved). A generic taste statement is a failure.
4. If feedbackText is present, it is the source of truth: paraphrase
   it, never contradict it, never quote more than 5 words of it.
5. Map satisfaction to stance:
   - "better"  -> a win worth repeating
   - "same"    -> neutral, no change felt
   - "not_for_me" -> a boundary to avoid from now on
   If feedbackText disagrees with satisfaction, follow feedbackText.

VOICE
- Second person, warm, editorial, specific - a food editor who knows
  this reader.
- Title: max 7 words, no ending punctuation, concrete and slightly
  surprising ("Chili, but only when it's crisp").
- Body: 1-2 sentences, 20-40 words. For "better", end with a
  forward-looking clause ("...we'll keep suggesting it, never as the default").
- Never: hashtags, emoji, percentages, "we noticed / our AI / data shows",
  mentions of the app, or the title repeated in the body.

OUTPUT
Return ONLY strict JSON: {"title":"...","body":"..."}
No markdown, no commentary.`;

const AI_TIMEOUT_MS = 8_000;

export interface GenerateNoteArgs {
  userId: string;
  rescueId?: string;
  context?: FeedbackJournalContext;
  rescue?: Pick<
    Rescue,
    'reasoning' | 'originalMeal' | 'detectedIngredients' | 'selectedRecommendation'
  >;
  satisfaction: Satisfaction;
  feedbackText?: string;
}

export class FeedbackJournalService {
  private readonly signals: TasteSignalService;

  constructor(private readonly models: Db['models']) {
    this.signals = new TasteSignalService(models);
  }

  /**
   * Generate + persist the note for a feedback submission.
   * Never throws - a submit that already succeeded must not fail because of
   * a journal note. Returns null only when nothing usable could be written.
   */
  async generate(args: GenerateNoteArgs): Promise<FeedbackJournalNote | null> {
    try {
      const context = args.context ?? deriveContext(args.rescue);
      if (
        !context.dish.trim() &&
        context.ingredients.length === 0 &&
        !context.recommendedMove.trim()
      ) {
        return null;
      }

      const anchor = pickAnchor(context);
      if (!anchor) return null;
      const strandKey = strandId('ingredient', anchor);

      const polarity: 'positive' | 'negative' | 'neutral' =
        args.satisfaction === 'better'
          ? 'positive'
          : args.satisfaction === 'not_for_me'
            ? 'negative'
            : 'neutral';

      const written = await this.writeEntry(context, args.satisfaction, args.feedbackText);
      if (!written) return null;

      await this.ensureSignal(args.userId, strandKey, anchor, polarity);
      return await this.persist({
        userId: args.userId,
        rescueId: args.rescueId ?? null,
        strandKey,
        title: written.title,
        body: written.body,
        polarity,
        source: written.source,
      });
    } catch (error) {
      // The feedback itself already succeeded - log and degrade quietly.
      console.warn('[feedback-journal] note generation failed:', error);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Writing (AI first, deterministic fallback always)
  // -------------------------------------------------------------------------

  private async writeEntry(
    context: FeedbackJournalContext,
    satisfaction: Satisfaction,
    feedbackText?: string,
  ): Promise<{ title: string; body: string; source: 'ai' | 'fallback' } | null> {
    const key = env.FEEDBACK_JOURNAL_API_KEY || '';
    if (!key) return fallbackEntry(context, satisfaction);

    let lastProblem = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await this.callModel(key, context, satisfaction, feedbackText, lastProblem);
      if (!raw) break; // transport/auth failure - no point retrying
      const problem = validateEntry(raw, context);
      if (!problem) {
        const parsed = JSON.parse(stripFences(raw)) as { title: string; body: string };
        return { title: parsed.title.trim(), body: parsed.body.trim(), source: 'ai' };
      }
      lastProblem = problem;
    }
    return fallbackEntry(context, satisfaction);
  }

  private async callModel(
    key: string,
    context: FeedbackJournalContext,
    satisfaction: Satisfaction,
    feedbackText: string | undefined,
    previousProblem: string,
  ): Promise<string | null> {
    const base = env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1';
    const userPayload = {
      rescue: {
        dish: context.dish,
        detectedIngredients: context.ingredients,
        recommendedMove: context.recommendedMove,
        reasoning: context.reasoning ?? '',
      },
      feedback: { satisfaction, feedbackText: feedbackText ?? '' },
    };
    const userContent =
      (previousProblem
        ? `Your previous answer was rejected: ${previousProblem}. Fix it and answer again.\n\n`
        : '') + JSON.stringify(userPayload);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mealrescue.app',
          'X-Title': 'Meal Rescue',
        },
        body: JSON.stringify({
          model: env.FEEDBACK_JOURNAL_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(`[feedback-journal] model ${res.status} - falling back`);
        return null;
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      return content ?? null;
    } catch (error) {
      console.warn('[feedback-journal] model call failed - falling back:', error);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** One note per strand: a newer note REPLACES the older one (an edit). */
  private async persist(row: {
    userId: string;
    rescueId: string | null;
    strandKey: string;
    title: string;
    body: string;
    polarity: 'positive' | 'negative' | 'neutral';
    source: 'ai' | 'fallback';
  }): Promise<FeedbackJournalNote> {
    const existing = await this.models.FeedbackJournalNote.findOne({
      where: { userId: row.userId, strandKey: row.strandKey },
    });
    const saved = existing
      ? await existing.update({ ...row, rescueId: row.rescueId })
      : await this.models.FeedbackJournalNote.create(row);
    return {
      title: saved.title,
      body: saved.body,
      source: saved.source,
      strandKey: saved.strandKey,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  /**
   * Make sure the strand the note attaches to exists as a real, evidenced
   * signal - so the journal entry expands into a genuine evidence trail and
   * lands in the normal chapters via aggregation. Skipped when the feedback
   * pipeline already emitted this strand.
   */
  private async ensureSignal(
    userId: string,
    strandKey: string,
    value: string,
    polarity: 'positive' | 'negative' | 'neutral',
  ): Promise<void> {
    const existing = await this.signals.getSignal(userId, 'ingredient', value);
    if (existing) return;
    await this.signals.addSignal({
      userId,
      dimension: 'ingredient',
      value,
      polarity,
      source: 'EXPLICIT_FEEDBACK',
      sourceLabel: 'How you rated a rescue',
      sourceEventKey: `feedbacknote:${strandKey}`,
      note: 'Written into the journal from your feedback on this rescue.',
      occurredAt: new Date(),
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveContext(rescue: GenerateNoteArgs['rescue']): FeedbackJournalContext {
  const original = (rescue?.originalMeal ?? {}) as { foods?: string[] };
  const detected = (rescue?.detectedIngredients ?? {}) as { ingredients?: string[] };
  const selected = (rescue?.selectedRecommendation ?? {}) as {
    candidate?: {
      additions?: Array<{ name: string }>;
      substitutions?: Array<{ replacement: { name: string } }>;
    };
  };
  const foods = original.foods ?? [];
  const additions = (selected.candidate?.additions ?? []).map((a) => a.name);
  const substitutions = (selected.candidate?.substitutions ?? []).map((s) => s.replacement.name);
  return {
    dish: foods.join(', '),
    ingredients: [...foods, ...(detected.ingredients ?? []), ...additions, ...substitutions],
    recommendedMove: [...additions, ...substitutions].join(', ') || rescue?.reasoning || '',
    reasoning: rescue?.reasoning ?? '',
  };
}

/** First food term the note should attach to (shortest list first = additions). */
function pickAnchor(context: FeedbackJournalContext): string | null {
  const terms = [...context.ingredients, context.dish]
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 2);
  return terms[0] ?? null;
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1] ? fenced[1].trim() : trimmed;
}

/** Returns a problem description, or null when the entry is good to ship. */
function validateEntry(raw: string, context: FeedbackJournalContext): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return 'output was not valid JSON';
  }
  const entry = parsed as { title?: unknown; body?: unknown };
  if (typeof entry.title !== 'string' || typeof entry.body !== 'string') {
    return 'missing title or body strings';
  }
  const title = entry.title.trim();
  const body = entry.body.trim();
  if (!title || !body) return 'empty title or body';
  if (title.split(/\s+/).length > 7) return 'title longer than 7 words';
  const bodyWords = body.split(/\s+/).length;
  if (bodyWords < 10 || bodyWords > 60) return 'body must be 10-60 words';

  const foodTerms = [...context.ingredients, context.dish]
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 3);
  if (foodTerms.length > 0) {
    const haystack = `${title} ${body}`.toLowerCase();
    if (!foodTerms.some((term) => haystack.includes(term))) {
      return 'entry never mentions a food from the rescue';
    }
  }
  return null;
}

/** Deterministic, fully grounded sentence - the submit always has a note. */
function fallbackEntry(
  context: FeedbackJournalContext,
  satisfaction: Satisfaction,
): { title: string; body: string; source: 'fallback' } {
  const dish = context.dish.trim() || 'your meal';
  const move = context.recommendedMove.trim() || 'that change';
  const anchor = pickAnchor(context) ?? 'this';
  if (satisfaction === 'better') {
    return {
      title: `${capitalize(anchor)} earns a repeat`,
      body: `You liked ${move} with your ${dish}, so we'll keep ${anchor} in the rotation - never on autopilot.`,
      source: 'fallback',
    };
  }
  if (satisfaction === 'not_for_me') {
    return {
      title: `${capitalize(anchor)}, understood`,
      body: `You'd rather not repeat ${move} with your ${dish} - we'll ease ${anchor} out of your suggestions.`,
      source: 'fallback',
    };
  }
  return {
    title: `${capitalize(anchor)}, as you had it`,
    body: `${move} with your ${dish} landed the same as always - noted, nothing to change.`,
    source: 'fallback',
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
