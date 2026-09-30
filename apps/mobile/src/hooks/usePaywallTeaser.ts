import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

import {
  type LastBestMoveContext,
  type LovedRescueContext,
  PAYWALL_AI_TEASER_ENABLED,
  type PaywallTeaser,
  deterministicTeaser,
  generateLovedTeaser,
  generatePaywallTeaser,
  lastMoveFromRecent,
  lovedTeaser,
} from '../services/paywall.api';
import { useRescuesStore } from '../stores/rescues.store';

const CACHE_KEY = 'meal-rescue/paywall/teaser-cache-v1';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

/** Which teaser owns the screen when no plan context is in play. */
export type PaywallTeaserMode = 'loved' | 'move';

interface CachedTeaser {
  mode: PaywallTeaserMode;
  sig: string;
  teaser: PaywallTeaser;
  savedAt: number;
}

function moveSignature(move: LastBestMoveContext | null): string {
  if (!move) return 'none';
  return JSON.stringify([move.foods, move.label ?? '']);
}

/** One subject, one signature: the AI copy never outlives what it describes. */
function signatureOf(
  mode: PaywallTeaserMode,
  loved: LovedRescueContext | null,
  move: LastBestMoveContext | null,
): string {
  if (mode === 'loved') return `loved:${loved?.rescueId ?? 'none'}`;
  return moveSignature(move);
}

async function readCachedTeaser(): Promise<CachedTeaser | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedTeaser) : null;
  } catch {
    return null;
  }
}

function writeCachedTeaser(cached: CachedTeaser): void {
  void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cached)).catch(() => {});
}

export interface UsePaywallTeaserOptions {
  /**
   * `false` when the paywall opened from a locked plan day: the plan teaser
   * owns the screen, so no teaser request is made.
   */
  enabled?: boolean;
  /** The user's last loved rescue — greets Profile → Upgrade when present. */
  loved?: LovedRescueContext | null;
  /** Per-open seed so the hardcoded pools read differently every time. */
  seed?: number;
}

/**
 * Curiosity copy for the paywall, resolved in two modes:
 *
 *  - `loved`  — the rescue the user explicitly loved ("Better" feedback / the
 *               "Exactly" check-in). Hardcoded varied copy today; the Groq
 *               copy swaps in once `PAYWALL_AI_TEASER_ENABLED` flips.
 *  - `move`   — the original path: deterministic copy first, AI scoped to the
 *               last best move swaps in (cached ~3 h per move).
 *
 * Everything renders instantly — the paywall is never blank and never blocks
 * on a request.
 */
export function usePaywallTeaser(options?: UsePaywallTeaserOptions): {
  teaser: PaywallTeaser;
  hasMove: boolean;
  mode: PaywallTeaserMode;
} {
  const { enabled = true, loved = null, seed = 0 } = options ?? {};
  const recent = useRescuesStore((s) => s.recent);
  const hydrate = useRescuesStore((s) => s.hydrate);
  const mode: PaywallTeaserMode = loved ? 'loved' : 'move';

  const [aiTeaser, setAiTeaser] = useState<PaywallTeaser | null>(null);
  const sigRef = useRef<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const move = lastMoveFromRecent(recent);
    const sig = signatureOf(mode, loved, move);

    // The AI copy belongs to one subject only — drop it when that changes
    // (a new loved rescue, a different move). Base copy never waits on it.
    if (sigRef.current !== sig) {
      sigRef.current = sig;
      setAiTeaser(null);
    }

    if (!enabled) return;
    // The loved/plan teasers stay hardcoded until the Groq path flips on;
    // the original move teaser has always been AI-backed and keeps its path.
    if (mode === 'loved' && !PAYWALL_AI_TEASER_ENABLED) return;

    let cancelled = false;

    (async () => {
      const cached = await readCachedTeaser();
      if (cancelled) return;
      if (
        cached &&
        cached.mode === mode &&
        cached.sig === sig &&
        Date.now() - cached.savedAt < CACHE_TTL_MS
      ) {
        setAiTeaser(cached.teaser);
        return;
      }
      try {
        const fresh =
          mode === 'loved' && loved
            ? await generateLovedTeaser(loved)
            : await generatePaywallTeaser(move);
        if (cancelled) return;
        setAiTeaser(fresh);
        writeCachedTeaser({ mode, sig, teaser: fresh, savedAt: Date.now() });
      } catch {
        // Keep the deterministic copy — the paywall never goes blank.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, loved, recent, enabled, seed]);

  const lastMove = lastMoveFromRecent(recent);
  const base = loved ? lovedTeaser(loved, seed) : deterministicTeaser(lastMove);

  return {
    teaser: aiTeaser ?? base,
    hasMove: mode === 'move' && lastMove !== null,
    mode,
  };
}
