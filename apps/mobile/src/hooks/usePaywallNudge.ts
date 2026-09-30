import { useEffect, useState } from 'react';

import { getAdEligibility } from '../services/ads.api';

/**
 * One personalized paywall line built from live usage. Returns null while
 * loading or when there is nothing personal worth saying.
 */
export function usePaywallNudge(): string | null {
  const [nudge, setNudge] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdEligibility()
      .then((eligibility) => {
        if (cancelled) return;
        const used = eligibility.rescuesUsed ?? 0;
        const limit = eligibility.freeRescueLimit ?? 3;
        if (eligibility.tier !== 'free') {
          setNudge(null);
        } else if (used >= limit) {
          setNudge("You've used your free rescues - unlimited is one tap away.");
        } else {
          setNudge(null);
        }
      })
      .catch(() => {
        if (!cancelled) setNudge(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return nudge;
}
