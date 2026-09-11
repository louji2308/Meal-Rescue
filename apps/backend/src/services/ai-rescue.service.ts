/**
 * AI Rescue Service — real OpenRouter-powered meal intelligence.
 *
 * Replaces the entire heuristic pipeline with a single LLM call that:
 * 1. Reads the user's food, time of day, mood, and kitchen context
 * 2. Returns a structured best move + alternatives
 * 3. Handles negotiation (user pushes back, AI adapts)
 *
 * Uses openrouter/free for zero-cost inference.
 */
import { env } from '../config/env';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_KEY = env.OPENROUTER_API_KEY ?? '';
const MODEL = 'openrouter/free';

export interface AiRescueRequest {
  foods: string[];
  ingredients?: string[];
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  userMood?: string;
  kitchenItems?: Array<{ name: string; state: string; expiresSoon: boolean }>;
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

    const userMessage = `Food: ${req.foods.join(', ')}${req.ingredients?.length ? `. Ingredients: ${req.ingredients.join(', ')}` : ''}
Time: ${req.timeOfDay}${req.userMood ? `. Mood: ${req.userMood}` : ''}${kitchenContext}

Suggest the best move.`;

    const result = await this.callOpenRouter(systemPrompt, userMessage);
    return this.parseResponse(result);
  }

  /**
   * Handle negotiation — user pushes back, AI adapts.
   */
  async negotiate(req: AiNegotiateRequest): Promise<AiRescueResponse> {
    const systemPrompt = `You are a meal rescue AI in a conversation. The user pushed back on your suggestion. Adapt.

RULES:
- Acknowledge their pushback naturally
- Give a new suggestion that respects their constraint
- Keep the tone warm and casual
- Return ONLY valid JSON with the same structure as before

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

    const result = await this.callOpenRouter(systemPrompt, userMessage);
    return this.parseResponse(result);
  }

  private async callOpenRouter(systemPrompt: string, userMessage: string): Promise<string> {
    if (!OPENROUTER_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mealrescue.app',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices?.[0]?.message?.content ?? '';
  }

  private parseResponse(raw: string): AiRescueResponse {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        bestMove: String(parsed.bestMove ?? 'Try this'),
        reasoning: String(parsed.reasoning ?? ''),
        timeMinutes: Number(parsed.timeMinutes ?? 5),
        effort: (['low', 'medium', 'high'].includes(String(parsed.effort)) ? parsed.effort : 'low') as 'low' | 'medium' | 'high',
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
