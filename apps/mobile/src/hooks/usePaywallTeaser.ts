import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

import {
  type LastBestMoveContext,
  type PaywallTeaser,
  deterministicTeaser,
  generatePaywallTeaser,
  lastMoveFromRecent,
} from '../services/paywall.api';
import { useRescuesStore } from '../stores/rescues.store';

const CACHE_KEY = 'meal-rescue/paywall/teaser-cache-v1';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

interface CachedTeaser {
  sig: string;
  teaser: PaywallTeaser;
  savedAt: number;
}

function signatureOf(move: LastBestMoveContext | null): string {
  if (!move) return 'none';
  return JSON.stringify([move.foods, move.label ?? '']);
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

/**
 * Curiosity copy for the paywall. Deterministic copy renders instantly, then
 * the AI teaser (scoped to the last best move) swaps in on arrival. Cached per
 * move for ~3h so returning users see the nice copy without a round-trip.
 */
export function usePaywallTeaser(): { teaser: PaywallTeaser; hasMove: boolean } {
  const recent = useRescuesStore((s) => s.recent);
  const hydrate = useRescuesStore((s) => s.hydrate);
  const [teaser, setTeaser] = useState<PaywallTeaser>(() =>
    deterministicTeaser(lastMoveFromRecent(recent)),
  );
  const lastSigRef = useRef<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const lastMove = lastMoveFromRecent(recent);
    const sig = signatureOf(lastMove);
    const sigChanged = lastSigRef.current !== sig;
    if (sigChanged) {
      lastSigRef.current = sig;
      setTeaser(deterministicTeaser(lastMove));
    }
    let cancelled = false;

    (async () => {
      const cached = await readCachedTeaser();
      if (cancelled) return;
      if (cached && cached.sig === sig && Date.now() - cached.savedAt < CACHE_TTL_MS) {
        setTeaser(cached.teaser);
        return;
      }
      try {
        const fresh = await generatePaywallTeaser(lastMove);
        if (cancelled) return;
        setTeaser(fresh);
        writeCachedTeaser({ sig, teaser: fresh, savedAt: Date.now() });
      } catch {
        // Keep the deterministic copy — the paywall never goes blank.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recent]);

  return { teaser, hasMove: lastSigRef.current !== null && lastSigRef.current !== 'none' };
}
