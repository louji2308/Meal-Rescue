/**
 * AI Rescue Service — real OpenRouter-powered meal intelligence.
 *
 * Replaces the entire heuristic pipeline with a single LLM call that:
 * 1. Reads the user's food, time of day, mood, and kitchen context
 * 2. Returns a structured best move + alternatives
 * 3. Handles negotiation (user pushes back, AI adapts)
 *
 * Uses openrouter/free for zero-cost inference.
 *
 * Degradation (architecture doc rule): when the provider fails for
 * transient/billing reasons (402, 429, 5xx, network), serve a deterministic
 * heuristic rescue instead of 502-ing the user mid-demo. Auth errors
 * (401/403) still surface as config errors — never silently degrade those.
 */
import { env } from '../config/env';

// NOTE: `||` not `??` — an empty-string env var (e.g. `OPENAI_BASE_URL=` from
// .env.example) must fall back to the default, otherwise fetch gets a
// relative URL and throws, surfacing as a 502 on every request.
const OPENROUTER_URL = `${env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`;
const OPENROUTER_KEY = env.OPENAI_API_KEY || '';
const MODEL = env.OPENAI_TEXT_MODEL || 'openrouter/free';

/**
 * True when the provider rejected our credentials. Bad API key is a config
 * error — surface it; never degrade to heuristics for auth failures.
 */
function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(invalid|incorrect|expired|missing|no|bad).{0,20}api.?key|api.?key.{0,20}(invalid|incorrect|expired|missing|not found)|authentication|\b401\b|\b403\b/i.test(
    message,
  );
}

/**
 * True when the key/endpoint was never configured. A missing key is a
 * misconfiguration — surface it as a 502; never silently degrade to
 * heuristics and mask the problem (also keeps the security-surface
 * "no key → degraded 502" contract intact).
 */
function isConfigError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('not configured');
}

export interface AiRescueRequest {
  foods: string[];
  ingredients?: string[];
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  userMood?: string;
  kitchenItems?: Array<{ name: string; state: string; expiresSoon: boolean }>;
  tasteContext?: string;
  timeMinutes?: number;
  cookingAllowed?: boolean;
}

export interface AiRescueResponse {
  bestMove: string;
  reasoning: string;
  timeMinutes: number;
  effort: 'low' | 'medium' | 'high';
  whatYouKept: string[];
  whatYouAdded: string[];
  alternatives: Array<{ name: string; reasoning: string }>;
}

export interface AiNegotiateRequest {
  conversation: Array<{ role: 'user' | 'ai'; content: string }>;
  originalFoods: string[];
  pushback: string;
  tasteContext?: string;
}

export class AiRescueService {
  /**
   * Generate a best move for the user's meal.
   * Single API call, structured JSON response.
   */
  async generateRescue(req: AiRescueRequest): Promise<AiRescueResponse> {
    const kitchenContext = req.kitchenItems?.length
      ? `\nUser's kitchen: ${req.kitchenItems.map((k) => `${k.name} (${k.state}${k.expiresSoon ? ', expiring soon' : ''})`).join(', ')}`
      : '';

    const tasteContextSection = req.tasteContext
      ? `\n\nUSER'S TASTE PROFILE:\n${req.tasteContext}\nUse this to personalize your suggestion. Respect strong dislikes. Don't suggest overexposed items. Match their modification tolerance.`
      : '';

    const timeConstraintSection =
      req.timeMinutes != null
        ? `\n\nTIME CONSTRAINT: The user has ${req.timeMinutes === 0 ? 'no time to cook (ready-made only)' : `about ${req.timeMinutes} minutes`}. ${req.cookingAllowed === false ? 'They cannot cook — suggest ready-made or no-prep options only.' : ''}Respect this limit strictly in your suggestion.`
        : '';

    const systemPrompt = `You are a warm, practical meal rescue AI. Given a user's food and context, suggest the best next move.

RULES:
- Be concise and human. No corporate language.
- The "bestMove" is ONE clear action (e.g. "Add a fried egg on top")
- "whatYouKept" = parts of the original meal you preserved
- "whatYouAdded" = new ingredients or steps
- "alternatives" = 2-3 other options the user could consider
- Time and effort should be realistic
- Respect the user's mood: if tired, keep it minimal. If energetic, suggest more.
- If kitchen items are provided, prefer using those ingredients
- Never suggest something the user explicitly rejected
- If a taste profile is provided, personalize heavily — suggest based on their preferences, not generic advice${tasteContextSection}${timeConstraintSection}

Return ONLY valid JSON:
{
  "bestMove": "string",
  "reasoning": "one sentence why this is the best move",
  "timeMinutes": number,
  "effort": "low" | "medium" | "high",
  "whatYouKept": ["string"],
  "whatYouAdded": ["string"],
  "alternatives": [{"name": "string", "reasoning": "string"}]
}`;

    const timeLine =
      req.timeMinutes != null
        ? `. Time: ${req.timeMinutes === 0 ? 'no cooking (ready-made only)' : `${req.timeMinutes} min`}${req.cookingAllowed === false ? ', no cooking allowed' : ''}`
        : '';

    const userMessage = `Food: ${req.foods.join(', ')}${req.ingredients?.length ? `. Ingredients: ${req.ingredients.join(', ')}` : ''}
Time: ${req.timeOfDay}${timeLine}${req.userMood ? `. Mood: ${req.userMood}` : ''}${kitchenContext}

Suggest the best move.`;

    try {
      const result = await this.callOpenRouter(systemPrompt, userMessage);
      return this.parseResponse(result);
    } catch (err) {
      if (isAuthError(err) || isConfigError(err)) throw err;
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'AI rescue provider failed - served by deterministic heuristic',
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
      return heuristicRescue(req);
    }
  }

  /**
   * Handle negotiation — user pushes back, AI adapts.
   */
  async negotiate(req: AiNegotiateRequest): Promise<AiRescueResponse> {
    const tasteContextSection = req.tasteContext
      ? `\n\nUSER'S TASTE PROFILE:\n${req.tasteContext}\nUse this to personalize your suggestion.`
      : '';

    const systemPrompt = `You are a meal rescue AI in a conversation. The user pushed back on your suggestion. Adapt.

RULES:
- Acknowledge their pushback naturally
- Give a new suggestion that respects their constraint
- Keep the tone warm and casual
- Return ONLY valid JSON with the same structure as before${tasteContextSection}

{
  "bestMove": "string",
  "reasoning": "one sentence",
  "timeMinutes": number,
  "effort": "low" | "medium" | "high",
  "whatYouKept": ["string"],
  "whatYouAdded": ["string"],
  "alternatives": [{"name": "string", "reasoning": "string"}]
}`;

    const conversationLog = req.conversation
      .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
      .join('\n');

    const userMessage = `Original food: ${req.originalFoods.join(', ')}

Conversation so far:
${conversationLog}

User's latest pushback: "${req.pushback}"

Adapt your suggestion.`;

    try {
      const result = await this.callOpenRouter(systemPrompt, userMessage);
      return this.parseResponse(result);
    } catch (err) {
      if (isAuthError(err) || isConfigError(err)) throw err;
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'AI rescue negotiate provider failed - served by deterministic heuristic',
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
      return heuristicNegotiate(req);
    }
  }

  private async callOpenRouter(systemPrompt: string, userMessage: string): Promise<string> {
    if (!OPENROUTER_KEY) {
      // isConfigError() matches this message and rethrows it as a 502.
      throw new Error('OPENAI_API_KEY not configured');
    }

    const body: Record<string, unknown> = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: env.LLM_MAX_TOKENS,
    };
    // GLM-family (and other reasoning) models on OpenRouter spend the output
    // budget on hidden reasoning and return content:null unless disabled.
    if (MODEL.startsWith('z-ai/') || MODEL.startsWith('deepseek/')) {
      body.reasoning = { enabled: false };
    }

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mealrescue.app',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string | null } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned empty content');
    }

    return content;
  }

  private parseResponse(raw: string): AiRescueResponse {
    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        bestMove: String(parsed.bestMove ?? 'Try this'),
        reasoning: String(parsed.reasoning ?? ''),
        timeMinutes: Number(parsed.timeMinutes ?? 5),
        effort: (['low', 'medium', 'high'].includes(String(parsed.effort))
          ? parsed.effort
          : 'low') as 'low' | 'medium' | 'high',
        whatYouKept: Array.isArray(parsed.whatYouKept) ? parsed.whatYouKept.map(String) : [],
        whatYouAdded: Array.isArray(parsed.whatYouAdded) ? parsed.whatYouAdded.map(String) : [],
        alternatives: Array.isArray(parsed.alternatives)
          ? parsed.alternatives.map((a: Record<string, unknown>) => ({
              name: String(a.name ?? ''),
              reasoning: String(a.reasoning ?? ''),
            }))
          : [],
      };
    } catch {
      // Fallback: return raw text as bestMove
      return {
        bestMove: cleaned.slice(0, 200),
        reasoning: '',
        timeMinutes: 5,
        effort: 'low',
        whatYouKept: [],
        whatYouAdded: [],
        alternatives: [],
      };
    }
  }
}

/**
 * Deterministic rescue when the provider is unavailable (402/429/5xx/network).
 * Keeps the response shape identical so the client never 502s mid-demo.
 */
function heuristicRescue(req: AiRescueRequest): AiRescueResponse {
  const primary = req.foods[0] ?? 'your meal';
  const kitchenTop = req.kitchenItems?.[0]?.name;
  const readyMade = req.timeMinutes === 0 || req.cookingAllowed === false;
  const timeMinutes = req.timeMinutes ?? (readyMade ? 0 : 5);

  const whatYouKept = req.foods.slice(0, 3);
  const whatYouAdded = kitchenTop ? [kitchenTop] : readyMade ? [] : ['a fried egg'];

  const bestMove = readyMade
    ? `Eat the ${primary} as-is — no cooking needed`
    : kitchenTop
      ? `Add the ${kitchenTop} to your ${primary}`
      : `Add a fried egg on top of your ${primary}`;

  const alternatives = [
    {
      name: `Season and reheat the ${primary}`,
      reasoning: 'Low effort, uses what you already have',
    },
    {
      name: kitchenTop
        ? `Pair the ${primary} with ${kitchenTop}`
        : `Make a quick salad on the side`,
      reasoning: 'Adds freshness without much extra time',
    },
  ];

  return {
    bestMove,
    reasoning: readyMade
      ? 'No time to cook — keep it simple'
      : 'Simple addition that builds on what you already have',
    timeMinutes,
    effort: readyMade || timeMinutes <= 5 ? 'low' : 'medium',
    whatYouKept,
    whatYouAdded,
    alternatives,
  };
}

/** Deterministic negotiate fallback — acknowledges pushback, offers a simpler pivot. */
function heuristicNegotiate(req: AiNegotiateRequest): AiRescueResponse {
  const primary = req.originalFoods[0] ?? 'your meal';
  return {
    bestMove: `Fair — try the ${primary} with just salt, pepper, and a squeeze of lemon`,
    reasoning: 'Keeping it minimal respects your pushback',
    timeMinutes: 5,
    effort: 'low',
    whatYouKept: req.originalFoods.slice(0, 3),
    whatYouAdded: ['salt', 'pepper', 'lemon'],
    alternatives: [
      {
        name: `Eat the ${primary} cold or room-temp`,
        reasoning: 'Zero cooking, zero fuss',
      },
      {
        name: `Pair the ${primary} with plain yogurt`,
        reasoning: 'Cool, simple, and uses a common staple',
      },
    ],
  };
}
