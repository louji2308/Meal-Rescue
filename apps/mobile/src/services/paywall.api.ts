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

interface PaywallTeaserResponse {
  success: boolean;
  data: PaywallTeaser;
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
