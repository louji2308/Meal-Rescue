/**
 * Paywall Teaser Service — real Groq cell for the Pro paywall.
 *
 * Turns the user's LAST best move into two curiosity-driven lines:
 *
 *   "You liked what egg did to the rice."
 *   "Wait till you see what garlic does."
 *
 * The opener bookends the move the user already made (past tense, concrete).
 * The hook teases a NEW addition that would improve that same meal even
 * further — it must never repeat the previous move's ingredient.
 *
 * Context discipline (the "only the last best move" rule):
 *   - The LLM receives EXACTLY ONE user fact: that single move, as a strict
 *     JSON object (or an explicit null when there is no usable move).
 *   - The system prompt forbids referencing any other history: no favorites,
 *     no cuisines, no earlier meals, no inferred habits.
 *   - When there is no previous move (new user, keep-as-is decision, or an
 *     outcome the user disliked) the model must NOT fabricate one — it drops
 *     to a universal "small change" opener.
 *
 * Degradation follows the repo pattern: the model promises (ranks, writes
 * copy) and deterministic code owns validation + fallback. A missing/erring
 * Groq key NEVER breaks the paywall — this is a non-critical surface, so we
 * log the warning and serve deterministic copy instead of failing requests.
 */
import { env } from '../config/env';

const GROQ_URL = `${env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'}/chat/completions`;
const GROQ_KEY = env.GROQ_API_KEY || '';
const MODEL = env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b';
const PROMPT_VERSION = 'v1.0-paywall-teaser';

/**
 * The single piece of user context we allow into the paywall teaser.
 * Everything here belongs to ONE previous move — never a broader history.
 */
export interface LastBestMoveContext {
  foods: string[];
  added?: string[];
  kept?: string[];
  actionType?: string;
  decision?: string;
  outcome?: string | null;
  label?: string;
}

export interface PaywallTeaser {
  opener: string;
  hook: string;
  source: 'ai' | 'fallback';
  modelVersion: string;
}

/** Injectable provider call so tests can stub the network. */
export type LlmCall = (systemPrompt: string, userMessage: string) => Promise<string>;

/** Strictly-scoped system prompt. The user message carries the ONE move. */
const TEASER_SYSTEM_PROMPT = `You write the one curiosity line for a paid upgrade screen in a meal app called Meal Rescue. The product's core promise: one small addition turns the meal you already have into a meal you remember.

STYLE: dry, appetite-first, human, zero corporate voice. Every copy line is ONE short sentence.

CONTEXT RULE (STRICT — the whole point):
- You will be sent exactly ONE user fact: their LAST best move, as a "lastBestMove" JSON object (meal + what they added + the plain-text label of the move).
- That single move is the ONLY personalization you are allowed. You have no other information about this user. Do not mention favorites, dislikes, cuisines, snacks, habits, or ANY meal other than that one move.
- When lastBestMove is present, the opener may reference it in the past tense — the user actually experienced this move.
- When lastBestMove is null, it means the user has NO previous move worth referencing (new user, kept a meal as-is, or disliked the last outcome). You MUST NOT invent or imply any past move. No "you liked", no "remember when", no fake history. Use a universal one-liner about a small change instead.

COPY REQUIREMENTS:
- opener: past-tense curiosity about the last best move, concrete about what was added and what meal. Example of the feeling: "You liked what egg did to the rice." Do not copy that example verbatim — write something fresh in the same spirit.
- hook: teases a NEW addition that would improve that same meal even further, one NOT in the last move. A reveal line, slightly mysterious, e.g. the feeling of "Wait till you see what garlic does." Never name the ingredient from the last move in the hook.
- Both lines: one sentence, under 60 characters each, no emojis, no "!", no "Pro"/"subscription"/"unlimited"/"ad-free"/"smart AI"/"price" talk, no health claims, no "you deserve", no corporate platitudes. Concrete nouns beat adjectives.

OUTPUT: ONLY valid JSON, no markdown, no commentary:
{"opener":"string","hook":"string"}`;

/**
 * Curated "next move" pool used by the deterministic fallback. Kept small
 * and appetizing on purpose (the heuristic is allowed to be boring).
 */
const NEXT_MOVE_POOL = [
  'crispy garlic',
  'a squeeze of lemon',
  'toasted sesame seeds',
  'chili crisp',
  'grated parmesan',
  'cold yogurt',
  'fresh herbs',
  'roasted peanuts',
  'caramelized onions',
  'pickled onions',
  'a spoonful of chili oil',
  'soft herbs',
];

/** Cold-start openers when there is genuinely no previous move to reference. */
const COLD_START_OPENERS = [
  "Every meal has one move you haven't tried.",
  "You're one ingredient away from your new favorite plate.",
  'The meal is fine. The next one is not.',
  'A small addition can change how a meal lands.',
];

const NOUN_MAP: Record<string, string> = {
  'fried egg': 'egg',
  'scrambled egg': 'egg',
  'poached egg': 'egg',
  'soft egg': 'egg',
  'toasted sesame': 'sesame',
  'toasted sesame seeds': 'sesame',
  'sesame seeds': 'sesame',
  'chilli crisp': 'chili crisp',
  'chili crisp': 'chili crisp',
  'grated parmesan': 'parmesan',
  'shaved parmesan': 'parmesan',
  'fresh parmesan': 'parmesan',
  'cold yogurt': 'yogurt',
  'roasted peanuts': 'peanuts',
  'caramelized onions': 'onions',
  'pickled onions': 'onions',
  'fresh herbs': 'herbs',
  'soft herbs': 'herbs',
};

const SUFFIX_FILTER = /\b(sauce|oil|dressing|mix|seasoning|powder)$/;

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0F}/u;
const BANNED_WORDS_RE =
  /\b(subscription|unlimited|ad-free|adfree|premium|upgrade|subscribe|pricing|smart ai|\bpro\b)\b/i;
const FABRICATED_MOVE_RE = /\b(you liked|you loved|remember when|last time you)\b/i;

/** Light per-user in-memory rate limiter for the teaser endpoint. */
const rateLimit = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_PER_MINUTE = 20;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(key);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimit.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_MINUTE) return false;
  entry.count += 1;
  return true;
}

/** Eager normalize so garbage from the wire never reaches the prompt. */
function normalizeMove(input: unknown): LastBestMoveContext | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter((s) => s.length > 0) : [];
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' ? v.trim() || undefined : undefined;

  const foods = strArr(raw.foods).slice(0, 8);
  const added = strArr(raw.added).slice(0, 8);
  const kept = strArr(raw.kept).slice(0, 8);
  if (foods.length === 0 && added.length === 0 && !str(raw.label)) return null;

  return {
    foods,
    added,
    kept,
    actionType: str(raw.actionType),
    decision: str(raw.decision),
    outcome: raw.outcome === null ? null : str(raw.outcome),
    label: str(raw.label),
  };
}

/**
 * A "real move" is one the user actually made and (probably) enjoyed.
 * Keep-as-is decisions, disliked outcomes, or pure noise do not count —
 * those must fall back to the cold-start opener instead of fabricating taste.
 */
function hasRealMove(move: LastBestMoveContext | null): boolean {
  if (!move) return false;
  if (move.outcome === 'not_for_me') return false;
  const action = (move.actionType ?? '').toUpperCase();
  const decision = (move.decision ?? '').toLowerCase();
  const label = move.label ?? '';
  if (action === 'KEEP_AS_IS' || decision === 'kept_as_is') return false;
  if (/no changes needed|looks great|good as (is|it is)|keep.*as.?is|no.*cook/i.test(label)) {
    return false;
  }
  if ((move.added ?? []).length > 0) return true;
  return /\b(add|top|fold|combine|pair|lift|drizzle|squeeze|finish|spoon|scatter|melt|dash of|serve with)\b/i.test(
    label,
  );
}

/** Reduce an ingredient phrase to its conversation noun ("a fried egg" → "egg"). */
function headlineNoun(name: string): string {
  let s = String(name)
    .trim()
    .toLowerCase()
    .replace(/^an?\s+/, '')
    .replace(/^the\s+/, '');
  if (NOUN_MAP[s]) return NOUN_MAP[s]!;
  if (/\b(squeeze|drizzle|pinch|dash) of\b/.test(s)) {
    s = s.split(/\s+/).pop() ?? s;
  }
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && !SUFFIX_FILTER.test(s)) return s;
  return words[words.length - 1] ?? s;
}

/** Deterministic, stable pick so the same move always yields the same copy. */
function pickStable<T>(list: readonly T[], key: string): T {
  let hash = 2166136261;
  for (const ch of key) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  // Math.imul stays signed 32-bit; >>> 0 keeps the index non-negative.
  return list[(hash >>> 0) % list.length]!;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Boring, deterministic copy — the model never decides the paywall. */
function heuristicTeaser(move: LastBestMoveContext | null): PaywallTeaser {
  const foods = move?.foods ?? [];
  const added = move?.added ?? [];
  const foodPhrase = foods[0]?.trim().toLowerCase()
    ? `the ${foods[0]!.trim().toLowerCase()}`
    : 'your meal';
  const hookKey = [...foods, ...added, 'hook'].join('|').toLowerCase();

  let opener: string;
  if (hasRealMove(move)) {
    const noun = added[0] ? headlineNoun(added[0]) : null;
    opener =
      noun && noun.length >= 3
        ? `You liked what ${noun} did to ${foodPhrase}.`
        : `That little move on ${foodPhrase}? Worth repeating.`;
  } else {
    opener = pickStable(COLD_START_OPENERS, hookKey);
  }

  const pool =
    NEXT_MOVE_POOL.filter((item) => {
      const noun = headlineNoun(item);
      return !added.some((a) => headlineNoun(a) === noun);
    }) ?? [];
  const candidate = pickStable(pool.length > 0 ? pool : NEXT_MOVE_POOL, hookKey);
  const hook = `Wait till you see what ${headlineNoun(candidate)} does.`;

  return { opener, hook, source: 'fallback', modelVersion: 'heuristic' };
}

/** Parse the model's markdown-tolerant JSON blob into a candidate teaser. */
function parseCandidate(raw: string): { opener?: string; hook?: string } {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return {};
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    return {
      opener: typeof parsed.opener === 'string' ? parsed.opener : undefined,
      hook: typeof parsed.hook === 'string' ? parsed.hook : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Deterministic guardrail over model output: format, tone, fabrication, and
 * the "never repeat the last move in the hook" rule.
 */
function validateCandidate(
  candidate: { opener?: string; hook?: string },
  move: LastBestMoveContext | null,
  realMove: boolean,
): boolean {
  const opener = (candidate.opener ?? '').trim();
  const hook = (candidate.hook ?? '').trim();
  if (!opener || !hook || opener.length < 4 || hook.length < 4) return false;
  if (opener.length > 70 || hook.length > 70) return false;
  if (opener === hook) return false;
  const both = `${opener} ${hook}`;
  if (EMOJI_RE.test(both)) return false;
  if (/[[\]{}%]|`/.test(both)) return false;
  if (BANNED_WORDS_RE.test(both)) return false;
  if (!realMove && FABRICATED_MOVE_RE.test(opener)) return false;

  if (realMove) {
    for (const item of (move?.added ?? []) as string[]) {
      const noun = headlineNoun(item);
      if (noun.length >= 3 && new RegExp(`\\b${escapeRegex(noun)}\\b`, 'i').test(hook)) {
        return false;
      }
    }
  }
  return true;
}

/** Default provider — Groq chat completions, regex: 70B+ GPT-OSS-120b. */
async function groqLlm(systemPrompt: string, userMessage: string): Promise<string> {
  if (!GROQ_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    // GPT-OSS spends part of the budget on hidden reasoning; give it room
    // to finish thinking AND produce the JSON.
    max_tokens: Math.min(env.LLM_MAX_TOKENS, 1500),
  };

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }
  const data = (await response.json()) as {
    choices: Array<{ message: { content: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq returned empty content');
  }
  return content;
}

export class PaywallTeaserService {
  constructor(private readonly provider: LlmCall = groqLlm) {}

  /** Always resolves. Never throws to the route: model copy is optional. */
  async generate(input: unknown): Promise<PaywallTeaser> {
    const move = normalizeMove(input);
    const realMove = hasRealMove(move);

    try {
      // The user message is STRICT JSON of exactly one move (or null) —
      // no template interpolation, no injection surface on user strings.
      const userMessage = JSON.stringify({
        lastBestMove:
          realMove && move
            ? {
                meal: move.foods,
                added: move.added ?? [],
                kept: move.kept ?? [],
                label: move.label,
                decision: move.decision,
                outcome: move.outcome,
              }
            : null,
      });

      const raw = await this.provider(TEASER_SYSTEM_PROMPT, userMessage);
      const candidate = parseCandidate(raw);
      if (validateCandidate(candidate, move, realMove)) {
        return {
          opener: candidate.opener!.trim(),
          hook: candidate.hook!.trim(),
          source: 'ai',
          modelVersion: `${PROMPT_VERSION}::${MODEL}`,
        };
      }
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'Paywall teaser model output failed validation — served deterministic copy',
          model: MODEL,
        }),
      );
    } catch (err) {
      // A broken/missing provider must never break the paywall.
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'Paywall teaser provider failed — served deterministic copy',
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }

    return heuristicTeaser(move);
  }
}

export { checkRateLimit };
