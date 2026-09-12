/**
 * Deterministic intent classifier for Meal Memory.
 *
 * Turns a free-text instruction into a structured IntentResolution. This is
 * the primary path: it is fast, offline, and fully testable. The AI service
 * may *refine* a resolution (raise confidence, clarify entities) but never
 * skips this step — deterministic-first keeps behavior reproducible.
 *
 * Confidence bands: HIGH (>= 0.75) acts without confirmation, MEDIUM
 * (>= 0.5) asks for a one-line confirm, LOW (< 0.5) asks a clarification
 * question. Mutations that would destroy memory (REMOVE_MEAL, REPLAN) are
 * always confirmed regardless of confidence.
 */
import type {
  BlockType,
  ClarificationPrompt,
  ConfidenceBand,
  IntentEntities,
  IntentResolution,
  MealMemoryIntent,
  MealSlot,
} from '@meal-rescue/shared-types';

import { nextWeekStartFor, resolveDateReference, weekStartFor } from './date-utils';

const MEAL_SLOT_WORDS: { word: string; slot: MealSlot }[] = [
  { word: 'breakfast', slot: 'breakfast' },
  { word: 'supper', slot: 'dinner' },
  { word: 'dinner', slot: 'dinner' },
  { word: 'lunch', slot: 'lunch' },
  { word: 'brunch', slot: 'lunch' },
  { word: 'snack', slot: 'snack' },
];

interface Rule {
  intent: MealMemoryIntent;
  patterns: RegExp[];
  weight: number;
}

const RULES: Rule[] = [
  // --- Memory / history ------------------------------------------------
  {
    intent: 'REMEMBER',
    patterns: [
      /we (love|loved|really like|liked|hated|didn'?t like)\b/i,
      /\b(loved|liked|not for us)\b.*\b(meal|chicken|pasta|dish)\b/i,
      /remember\b/i,
      /note that we\b/i,
    ],
    weight: 1.4,
  },
  {
    intent: 'RECORD_ACTUAL_MEAL',
    patterns: [
      /^(log|record|note)\b/i,
      /we ate\b/i,
      /had (the|a|some)\b.*\bfor (dinner|lunch|breakfast)/i,
      /didn'?t eat\b/i,
      /skipped (dinner|lunch|breakfast)/i,
    ],
    weight: 1.3,
  },
  {
    intent: 'ASK_QUESTION',
    patterns: [/^(what|what's|whats|how|show|tell)\b/i, /\?$/i, /^why\b/i, /^when\b/i],
    weight: 1.2,
  },
  {
    intent: 'QUERY_REASONING',
    patterns: [/^why\b.*\b(planned|chose|pick|suggest)/i, /why did you\b/i, /explain (the )?plan/i],
    weight: 1.5,
  },

  // --- Inventory ---------------------------------------------------------
  {
    intent: 'PURCHASE_SUGGESTION',
    patterns: [
      /what (do|should) we (need|get|buy|shop)/i,
      /shopping list/i,
      /grocery/i,
      /^what.*short on$/i,
      /purchase/i,
      /buy(ing)? list/i,
    ],
    weight: 1.3,
  },
  {
    intent: 'MODIFY_INVENTORY_INTENT',
    patterns: [
      /\b(add|remove|delete)\b/i,
      /\b(need|buy|get|restock|order)\b.*\b(from|at|today|tomorrow|\d)/i,
    ],
    weight: 1.1,
  },

  // --- Scheduling ---------------------------------------------------------
  {
    intent: 'SCHEDULE',
    patterns: [
      /\b(plan|schedule|put|set|make|have|book|cook)\b/i,
      /\bwe'?re having\b/i,
      /\bwe (are|'re) having\b/i,
    ],
    weight: 1.2,
  },
  {
    intent: 'PLAN_WEEK',
    patterns: [
      /plan (the |this |next )?week/i,
      /week (of|from)/i,
      /set (up )?the week/i,
      /whole week/i,
      /weekly plan/i,
      /build a week/i,
    ],
    weight: 1.6,
  },
  {
    intent: 'REPLAN',
    patterns: [
      /\b(replan|re-plan|rework|rework the)\b/i,
      /start (the )?week over/i,
      /re-?make the plan/i,
    ],
    weight: 1.6,
  },
  {
    intent: 'MODIFY_SCHEDULE',
    patterns: [/\b(reschedule|change|swap|adjust|shift)\b/i, /re-?schedule/i],
    weight: 1.2,
  },
  {
    intent: 'MOVE_MEAL',
    patterns: [/\b(move|push|shift)\b.*\b(to|onto|->)/i, /swap .* with/i],
    weight: 1.4,
  },
  {
    intent: 'REMOVE_MEAL',
    patterns: [
      /\b(remove|delete|cancel|drop)\b.*\b(dinner|lunch|breakfast|meal|plan)/i,
      /take .* off (the )?plan/i,
    ],
    weight: 1.5,
  },
  {
    intent: 'BLOCK_TIME',
    patterns: [
      /\b(out|away|busy|unavailable|not here|holiday|vacation|can'?t)\b/i,
      /\bkeep (the )?\w+ (day|evening|morning) (clear|open)\b/i,
      /\bblock\b/i,
    ],
    weight: 1.3,
  },

  // --- Rules ---------------------------------------------------------------
  {
    intent: 'SET_RULE',
    patterns: [
      /\bdon'?t use\b/i,
      /\b(no|without|minus|avoid|skip)\b.*\b(egg|eggs|chicken|dairy|fish|meat|gluten|peanuts?|soy|shellfish)/i,
      /\b(save|hold|reserve|keep)\b.*\b(for|until)\b/i,
      /\balways\b/i,
      /\bnever\b/i,
      /\bexclude\b/i,
      /\bprefer\b/i,
    ],
    weight: 1.4,
  },
];

const BACKUP_UNEXPECTED: Rule = {
  intent: 'GENERAL_INFORMATION',
  patterns: [] as RegExp[],
  weight: 0.4,
};

function confidenceFor(score: number): { confidence: number; confidenceBand: ConfidenceBand } {
  const confidence = score / (score + 1);
  const confidenceBand: ConfidenceBand =
    confidence >= 0.75 ? 'HIGH' : confidence >= 0.5 ? 'MEDIUM' : 'LOW';
  return { confidence, confidenceBand };
}

function findMealSlot(text: string): MealSlot | null {
  const lower = text.toLowerCase();
  const hit = MEAL_SLOT_WORDS.find((entry) => new RegExp(`\\b${entry.word}\\b`, 'i').test(lower));
  return hit ? hit.slot : null;
}

/** Raw time reference ("tomorrow", "friday", "next week", ...) or null. */
function findDateReference(text: string): string | null {
  const refs = [
    /\bnext week\b/,
    /\bthis week\b/,
    /\btoday\b/,
    /\btonight\b/,
    /\btomorrow\b/,
    /\bthis weekend\b/,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\b\d{4}-\d{2}-\d{2}\b/,
  ];
  const lower = text.toLowerCase();
  for (const ref of refs) {
    const match = lower.match(ref);
    if (match) return match[0];
  }
  return null;
}

function findBlockType(text: string): BlockType | null {
  if (/(keep|leave).*(open|flexible)|keep .* free/i.test(text)) return 'keep_open';
  if (/\b(away|out|holiday|vacation|gone)\b/i.test(text)) return 'out';
  if (/(busy|no time|working|unavailable|can'?t|cannot)/i.test(text)) return 'blocked';
  return null;
}

function findEffort(text: string): 'low' | 'medium' | 'high' | null {
  if (/(easy|quick|simple|fast|5 min|10 min|five min|ten min|no fuss)/i.test(text)) return 'low';
  if (/(fancy|impressive|slow cook|special)/i.test(text)) return 'high';
  return null;
}

function findMealConcept(text: string): string | null {
  const quoted = text.match(/"([^"]+)"/);
  if (quoted?.[1]) return quoted[1].trim();
  const patterns = [
    /(?:have|having|plan|make|cook|eat|reheat|try)\s+(?:a\s+|an\s+|the\s+|some\s+)?([a-zA-Z][\w -]{2,40})(?:\s+(?:for|on|tonight|tomorrow|day|night))?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const concept = (match[1] ?? '').trim().replace(/\s+(tonight|tomorrow|for|on|day|night)$/i, '');
    if (concept.length > 2) return concept;
  }
  return null;
}

function findIngredient(text: string): string | null {
  const patterns = [
    /(?:without|no|minus|avoid|skip|hold|reserve|save|don'?t use|stop using|not use|exclude)\s+(?:the\s+|any\s+)?([a-zA-Z][a-zA-Z -]{0,30})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const ingredient = (match[1] ?? '').trim();
      if (ingredient.length < 30) return ingredient;
    }
  }
  return null;
}

function findMoveTarget(
  text: string,
  todayKey: string,
): { dateKey: string; mealSlot: MealSlot } | null {
  const match = text.match(
    /to\s+(tomorrow|tonight|tonight|friday|saturday|sunday|monday|tuesday|wednesday|thursday|next week|\d{4}-\d{2}-\d{2})/i,
  );
  if (!match) return null;
  const dateKey = resolveDateReference(match[1]!, todayKey);
  if (!dateKey) return null;
  return { dateKey, mealSlot: findMealSlot(text) ?? 'dinner' };
}

function matchRule(text: string): Rule | null {
  let best: Rule | null = null;
  let bestScore = 0;
  for (const rule of RULES) {
    let ruleScore = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) ruleScore += 1;
    }
    if (ruleScore > 0 && ruleScore > bestScore) {
      bestScore = ruleScore;
      best = rule;
    } else if (ruleScore === bestScore && ruleScore > 0 && best) {
      // Tie-break: prefer the more specific (higher-weight) rule.
      if (rule.weight > best.weight) best = rule;
    }
  }
  return best ?? (text.trim().length > 0 ? BACKUP_UNEXPECTED : null);
}

export const MUTATIONS_ALWAYS_CONFIRMED = new Set<MealMemoryIntent>([
  'REMOVE_MEAL',
  'REPLAN',
  'MOVE_MEAL',
  'MODIFY_SCHEDULE',
]);

function requiredEntitiesFor(intent: MealMemoryIntent): string[] {
  switch (intent) {
    case 'SCHEDULE':
      return ['mealConcept'];
    case 'MOVE_MEAL':
      return ['moveTarget'];
    case 'BLOCK_TIME':
      return ['targetHorizon'];
    case 'SET_RULE':
      return ['ingredient'];
    case 'RECORD_ACTUAL_MEAL':
      return ['mealSlot'];
    case 'REMOVE_MEAL':
      return ['mealSlot'];
    default:
      return [];
  }
}

export interface ClassifyContext {
  todayKey: string;
  memberNames?: string[];
}

export function classifyIntent(text: string, context: ClassifyContext): IntentResolution {
  const trimmed = text.trim();
  const rule = matchRule(trimmed);
  const matchedIntent: MealMemoryIntent = rule ? rule.intent : 'GENERAL_INFORMATION';
  const score = rule ? rule.weight : BACKUP_UNEXPECTED.weight;

  // Intent overrides: explicit keywords win over generic earlier rules.
  const intent = detectStrongOverride(trimmed) ?? matchedIntent;

  const slot = findMealSlot(trimmed);
  const dateRef = findDateReference(trimmed);
  const targetDate = dateRef ? resolveDateReference(dateRef, context.todayKey) : null;
  const isWeekRef = dateRef === 'next week' || dateRef === 'this week';
  const targetHorizon = dateRef && isWeekRef ? dateRef : null;

  const entities: IntentEntities = {
    mealConcept: findMealConcept(trimmed),
    targetDate,
    targetHorizon,
    mealSlot: slot,
    excludedDay: dateRef && !targetDate && !isWeekRef ? null : null,
    ingredient:
      intent === 'SET_RULE' || intent === 'MODIFY_INVENTORY_INTENT'
        ? findIngredient(trimmed)
        : null,
    memberId: findMember(trimmed, context.memberNames),
    blockType: intent === 'BLOCK_TIME' ? findBlockType(trimmed) : null,
    effort: findEffort(trimmed),
    constraint: null,
    moveTarget: intent === 'MOVE_MEAL' ? findMoveTarget(trimmed, context.todayKey) : null,
  };

  const { confidence, confidenceBand } = confidenceFor(score);
  const missing = requiredEntitiesFor(intent).filter((key) => {
    if (key === 'mealConcept') return !entities.mealConcept;
    if (key === 'moveTarget') return !entities.moveTarget;
    if (key === 'targetHorizon') return !entities.targetHorizon && !entities.targetDate;
    if (key === 'ingredient') return !entities.ingredient;
    if (key === 'mealSlot') return !entities.mealSlot;
    return false;
  });
  const requiresClarification = confidenceBand === 'LOW' || missing.length > 0;

  return {
    intent,
    confidence,
    confidenceBand,
    entities,
    rawText: trimmed,
    requiresClarification,
    clarificationQuestion: buildClarification(intent, missing),
  };
}

function detectStrongOverride(text: string): MealMemoryIntent | null {
  if (/plan (the |this |next )?week|weekly plan/i.test(text)) return 'PLAN_WEEK';
  if (/what .*(need|get|buy|shop(?:ping)?|grocery|short on)/i.test(text)) {
    return 'PURCHASE_SUGGESTION';
  }
  if (/buy|shopping|purchase|short on/i.test(text) && !/what/i.test(text)) return null;
  return null;
}

function buildClarification(intent: MealMemoryIntent, missing: string[]): string | null {
  if (missing.length === 0) {
    return intent === 'GENERAL_INFORMATION'
      ? 'I found the general reference — tell me what you would like to do with your food week.'
      : null;
  }
  const needs: Record<string, string> = {
    mealConcept: 'what meal you would like',
    moveTarget: 'where to move it (which day and time)',
    targetHorizon: 'which day or days',
    ingredient: 'which ingredient',
    mealSlot: 'which meal (breakfast, lunch, dinner, snack)',
  };
  const list = missing.map((key) => needs[key] ?? key).join(', ');
  return `I need to know ${list} to continue.`;
}

function findMember(text: string, memberNames?: string[]): string | null {
  // memberId resolution happens in the service layer (needs DB ids);
  // this classifier only marks whether a member was referenced.
  if (!memberNames) return null;
  const lower = text.toLowerCase();
  return memberNames.find((name) => lower.includes(name.toLowerCase())) ?? null;
}

export interface IntentDeterministic {
  resolution: IntentResolution;
  clarification: ClarificationPrompt | null;
}

export function buildClarificationPrompt(resolution: IntentResolution): ClarificationPrompt | null {
  if (!resolution.requiresClarification || !resolution.clarificationQuestion) return null;
  return {
    question: resolution.clarificationQuestion,
    neededEntities: requiredEntitiesFor(resolution.intent),
  };
}

export function bandFor(confidence: number): ConfidenceBand {
  return confidence >= 0.75 ? 'HIGH' : confidence >= 0.5 ? 'MEDIUM' : 'LOW';
}

export function isPlanWeek(intent: MealMemoryIntent): boolean {
  return intent === 'PLAN_WEEK';
}

export function weekStartForDate(dateKey: string): string {
  return weekStartFor(dateKey);
}

export function nextWeekStartForDate(dateKey: string): string {
  return nextWeekStartFor(dateKey);
}
