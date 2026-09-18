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

const OPENROUTER_URL = `${env.OPENAI_BASE_URL ?? 'https://openrouter.ai/api/v1'}/chat/completions`;
const OPENROUTER_KEY = env.OPENAI_API_KEY ?? '';
const MODEL = env.OPENAI_TEXT_MODEL ?? 'openrouter/free';

export interface AiRescueRequest {
  foods: string[];
  ingredients?: string[];
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  userMood?: string;
  kitchenItems?: Array<{ name: string; state: string; expiresSoon: boolean }>;
  tasteContext?: string;
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
- If a taste profile is provided, personalize heavily — suggest based on their preferences, not generic advice${tasteContextSection}

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

    try {
      const result = await this.callOpenRouter(systemPrompt, userMessage);
      return this.parseResponse(result);
    } catch {
      return this.fallbackResponse(req.foods, req.timeOfDay);
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
    } catch {
      return this.fallbackResponse(req.originalFoods, 'afternoon');
    }
  }

  private fallbackResponse(foods: string[], timeOfDay: string): AiRescueResponse {
    const joined = foods.join(' + ');
    const lower = foods.map((f) => f.toLowerCase());

    const hasEgg = lower.some((f) => f.includes('egg'));
    const hasNoodle = lower.some((f) => f.includes('noodle') || f.includes('pasta') || f.includes('rice'));
    const hasVeggie = lower.some((f) => f.includes('spinach') || f.includes('broccoli') || f.includes('tomato') || f.includes('onion') || f.includes('pepper'));
    const hasMeat = lower.some((f) => f.includes('chicken') || f.includes('beef') || f.includes('pork') || f.includes('fish') || f.includes('shrimp'));
    const hasBread = lower.some((f) => f.includes('bread') || f.includes('tortilla') || f.includes('wrap'));

    if (hasNoodle && hasEgg && hasVeggie) {
      return {
        bestMove: `Stir-fry the ${joined} into a quick egg noodle bowl — toss noodles with scrambled egg and wilted greens, add soy sauce and a pinch of sesame oil.`,
        reasoning: `Noodles, egg, and greens are a classic combo — quick, satisfying, and uses everything you have.`,
        timeMinutes: 12,
        effort: 'low',
        whatYouKept: foods,
        whatYouAdded: ['soy sauce', 'sesame oil', 'garlic'],
        alternatives: [
          { name: 'Egg drop noodle soup', reasoning: 'Boil noodles in broth, swirl in beaten egg for a comforting soup' },
          { name: 'Noodle omelette', reasoning: 'Mix noodles into beaten egg and pan-fry into a crispy noodle pancake' },
          { name: 'Cold noodle salad', reasoning: 'Chill the noodles, toss with raw spinach, egg slices, and a light dressing' },
        ],
      };
    }

    if (hasEgg) {
      return {
        bestMove: `Make a quick fried egg rice bowl — scramble the egg over rice with whatever veggies you have, season with soy sauce.`,
        reasoning: `Egg is incredibly versatile — this takes 8 minutes and always tastes great.`,
        timeMinutes: 8,
        effort: 'low',
        whatYouKept: foods,
        whatYouAdded: ['rice', 'soy sauce', 'green onion'],
        alternatives: [
          { name: 'Egg fried noodles', reasoning: 'Same idea but with noodles instead of rice' },
          { name: 'Veggie egg scramble', reasoning: 'Scramble everything together with some cheese on top' },
        ],
      };
    }

    if (hasMeat) {
      return {
        bestMove: `Sear the ${joined} quickly — high heat, simple seasoning, rest for 2 minutes before serving.`,
        reasoning: `Simple cooking lets the protein shine — don't overcomplicate it.`,
        timeMinutes: 15,
        effort: 'medium',
        whatYouKept: foods,
        whatYouAdded: ['salt', 'pepper', 'olive oil'],
        alternatives: [
          { name: 'Stir-fry everything together', reasoning: 'Quick high-heat cook with soy sauce and garlic' },
          { name: 'Sheet pan roast', reasoning: 'Toss on a pan, oven roast at 400°F for 15 minutes' },
        ],
      };
    }

    return {
      bestMove: `Combine ${joined} into a simple bowl — cook the main ingredient, season well, and serve with a drizzle of olive oil.`,
      reasoning: `Keeping it simple is sometimes the best approach — let the ingredients speak for themselves.`,
      timeMinutes: 10,
      effort: 'low',
      whatYouKept: foods,
      whatYouAdded: ['olive oil', 'salt', 'pepper'],
      alternatives: [
        { name: 'Quick stir-fry', reasoning: 'Toss everything in a hot pan with your favorite sauce' },
        { name: 'Simple bowl', reasoning: 'Cook each ingredient separately, assemble in a bowl' },
      ],
    };
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
