/**
 * Paywall teaser — curiosity copy for the Pro paywall.
 *
 * The backend scopes the AI to EXACTLY ONE user fact: the last best move
 * (from the local rescues history). This module builds that single "move"
 * from the store, calls POST /api/v1/paywall/teaser, and guarantees a
 * deterministic fallback so the paywall is never blank.
 */
import type { RecentRescue } from '../stores/rescues.store';
import { api } from './api';

export interface PaywallTeaser {
  opener: string;
  hook: string;
  source: 'ai' | 'fallback';
  modelVersion: string;
}

/**
 * Where the user came from when the paywall opens from the Meal Plan tab.
 * Built from the live plan preview, so the teaser copy names real days and
 * never falls back to a static string.
 */
export interface PlanUpsellContext {
  /** The one free day of the preview (null when the allowance is spent). */
  plannedDateKey: string | null;
  /** Meal names of that free day — used to ground the copy. */
  plannedMeals: string[];
  /** Days rendered locked in the preview (empty when nothing is planned). */
  lockedDateKeys: string[];
}

interface PaywallTeaserResponse {
  success: boolean;
  data: PaywallTeaser;
}

/**
 * Flip on when the Groq credits are back: the loved-rescue and plan teasers
 * then come from the backend AI (same Groq cell as the rescue teaser) and
 * swap in behind the hardcoded copy rendered below. Off for now — the
 * paywall must stay instant and offline-safe.
 */
export const PAYWALL_AI_TEASER_ENABLED = false;

/** One loved rescue, reduced to the only facts the teaser AI may use. */
export interface LovedRescueContext {
  rescueId: string;
  foods: string[];
  label: string;
}

export interface LastBestMoveContext {
  foods: string[];
  added?: string[];
  kept?: string[];
  actionType?: string;
  decision?: string;
  outcome?: string | null;
  label?: string;
}

const KEEP_AS_IS_RE = /no changes needed|looks great|keep.*as.?is|fine as is|nothing to add/i;

/**
 * Reduce local history to the single last best move the AI may reference.
 * Returns null on no history, keep-as-is, or empty data — never fabricates.
 */
export function lastMoveFromRecent(recent: RecentRescue[]): LastBestMoveContext | null {
  const latest = recent[0];
  if (!latest) return null;

  const label = (latest.recommendation ?? '').trim();
  if (!label || KEEP_AS_IS_RE.test(label)) return null;

  const foods = Array.isArray(latest.foods)
    ? latest.foods.map((f) => String(f).trim()).filter(Boolean)
    : [];
  if (foods.length === 0 && label.length < 4) return null;

  return { foods, label };
}

/**
 * POST /api/v1/paywall/teaser — one scoped AI call for the paywall line.
 */
export async function generatePaywallTeaser(
  lastMove: LastBestMoveContext | null,
): Promise<PaywallTeaser> {
  const res = await api.post<PaywallTeaserResponse>('/api/v1/paywall/teaser', { lastMove });
  return res.data.data;
}

/**
 * The user's last LOVED rescue — the signal Profile → Upgrade greets them
 * with. Returns null until they actually love one (feedback "Better" or the
 * "Exactly" check-in), so a new user never gets fake history.
 */
export function lastLovedFromStore(loved: RecentRescue[]): LovedRescueContext | null {
  const latest = loved[0];
  if (!latest) return null;
  const foods = Array.isArray(latest.foods)
    ? latest.foods.map((f) => String(f).trim()).filter(Boolean)
    : [];
  const label = (latest.recommendation ?? '').trim();
  if (foods.length === 0 && label.length < 4) return null;
  return { rescueId: latest.rescueId, foods, label };
}

/** POST …/paywall/teaser with mode: 'loved' — Groq copy for the loved rescue. */
export async function generateLovedTeaser(loved: LovedRescueContext): Promise<PaywallTeaser> {
  const res = await api.post<PaywallTeaserResponse>('/api/v1/paywall/teaser', {
    mode: 'loved',
    lastLovedRescue: { rescueId: loved.rescueId, foods: loved.foods, label: loved.label },
  });
  return res.data.data;
}

/** POST …/paywall/teaser with mode: 'plan' — Groq copy for the locked plan. */
export async function generatePlanTeaser(plan: PlanUpsellContext): Promise<PaywallTeaser> {
  const res = await api.post<PaywallTeaserResponse>('/api/v1/paywall/teaser', {
    mode: 'plan',
    plan,
  });
  return res.data.data;
}

/**
 * Deterministic copy shown instantly — never blocked on a request. The AI
 * copy swaps in when it arrives (or offline/error leaves this on screen).
 */
export function deterministicTeaser(lastMove: LastBestMoveContext | null): PaywallTeaser {
  const foods = lastMove?.foods ?? [];
  const food = (foods[0] ?? '').trim().toLowerCase();

  if (food) {
    return {
      opener: `You liked what ${food} did to the plate.`,
      hook: "Wait till you see what we'd add this time.",
      source: 'fallback',
      modelVersion: 'heuristic-v1',
    };
  }
  return {
    opener: 'Great meals rarely stop where they start.',
    hook: 'Wait till you see what a small addition does.',
    source: 'fallback',
    modelVersion: 'heuristic-v1',
  };
}

/** Weekday name for a YYYY-MM-DD key, in the viewer's locale. */
function weekdayOf(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

/** ['Wednesday', 'Thursday'] -> 'Wednesday & Thursday' */
function joinDays(days: string[]): string {
  if (days.length <= 1) return days[0] ?? '';
  return `${days.slice(0, -1).join(', ')} & ${days[days.length - 1]}`;
}

/**
 * Plan-aware teaser — option C, filled from the actual preview:
 *   "Day 1 planned for Tuesday. Wednesday & Thursday are one tap away."
 *   "Easily plan meals for your busy days, even the chaotic ones."
 *
 * Rendered instantly (no round-trip) and takes over from the rescue teaser
 * whenever the paywall was opened from a locked plan day. `seed` rotates the
 * sentence pair so two opens never read the same; flip
 * `PAYWALL_AI_TEASER_ENABLED` and the Groq copy swaps in instead.
 */
export function planTeaser(plan: PlanUpsellContext, seed = 0): PaywallTeaser {
  const planned = plan.plannedDateKey ? weekdayOf(plan.plannedDateKey) : null;
  const locked = plan.lockedDateKeys.map(weekdayOf);
  const lockedLine = joinDays(locked);
  const many = locked.length > 1;
  const key = [plan.plannedDateKey ?? '', ...plan.lockedDateKeys].join('|');

  const opener = !planned
    ? pickPlan(PLAN_OPENERS_SPENT, key, seed)({})
    : lockedLine
      ? pickPlan(PLAN_OPENERS_PLANNED, key, seed)({ planned, lockedLine, many })
      : pickPlan(PLAN_OPENERS_PLANNED_ONLY, key, seed)({ planned });

  return {
    opener,
    hook: pick(PLAN_HOOKS, key, seed),
    source: 'fallback',
    modelVersion: 'plan-hardcoded-v1',
  };
}

/** FNV-1a — one rescue keeps one voice, all opens of that rescue agree. */
function hashOf(value: string): number {
  let hash = 2166136261;
  for (const ch of value) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic pick that still moves when `seed` (per open) changes. */
function pick<T>(pool: readonly T[], key: string, seed: number): T {
  return pool[(hashOf(key) + Math.abs(Math.trunc(seed))) % pool.length]!;
}

interface PlanCopyArgs {
  planned?: string | null;
  lockedLine?: string;
  many?: boolean;
}

type PlanOpener = (args: PlanCopyArgs) => string;

function pickPlan(pool: readonly PlanOpener[], key: string, seed: number): PlanOpener {
  return pool[(hashOf(key) + Math.abs(Math.trunc(seed))) % pool.length]!;
}

/** Day 1 free + days behind the lock. */
const PLAN_OPENERS_PLANNED: readonly PlanOpener[] = [
  ({ planned, lockedLine, many }) =>
    `Day 1 planned for ${planned}. ${lockedLine} ${many ? 'are' : 'is'} one tap away.`,
  ({ planned, lockedLine, many }) =>
    `${lockedLine} ${many ? 'are' : 'is'} one tap away — ${planned} is already planned.`,
  ({ planned, lockedLine, many }) =>
    `Your week has a start: ${planned}. ${lockedLine} ${many ? 'are' : 'is'} one tap away.`,
];

/** Day 1 accepted, nothing left behind a lock (allowance spent preview). */
const PLAN_OPENERS_PLANNED_ONLY: readonly PlanOpener[] = [
  ({ planned }) => `Day 1 planned for ${planned}. The rest of your week is one tap away.`,
  ({ planned }) => `${planned} is planned. The rest of your week is one tap away.`,
  ({ planned }) => `Your week has a start: ${planned}. The rest is one tap away.`,
];

/** No free day left — every remaining day sits behind the lock. */
const PLAN_OPENERS_SPENT: readonly PlanOpener[] = [
  () => 'Your one free plan day is used. The rest of your week is one tap away.',
  () => 'Day 1 is in the books. The rest of your week is one tap away.',
  () => 'Your week has a start — the remaining days are one tap away.',
];

const PLAN_HOOKS = [
  'Easily plan meals for your busy days, even the chaotic ones.',
  'Two more days, planned as easily as the first.',
  'The rest of your week, planned in a single tap.',
  'Plan the rest of the week without the mental load.',
] as const;

// ---------------------------------------------------------------------------
// Loved-rescue teaser — what Profile → Upgrade greets the user with
// ---------------------------------------------------------------------------

/** Pinned loved-rescue copy — one pair, no per-rescue variation. */
const LOVED_OPENER = 'You loved what the curd did with pomegranate and roasted peanuts!';
const LOVED_HOOK = 'The next combination might leave you craving another bite.';

/**
 * Loved-rescue teaser — fixed copy for Profile → Upgrade (Groq copy waits
 * behind `PAYWALL_AI_TEASER_ENABLED`):
 *   "You loved what the curd did with pomegranate and roasted peanuts!"
 *   "The next combination might leave you craving another bite."
 */
export function lovedTeaser(_loved: LovedRescueContext, _seed = 0): PaywallTeaser {
  return {
    opener: LOVED_OPENER,
    hook: LOVED_HOOK,
    source: 'fallback',
    modelVersion: 'loved-hardcoded-v1',
  };
}
