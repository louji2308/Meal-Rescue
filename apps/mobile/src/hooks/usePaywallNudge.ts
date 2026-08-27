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
        const used = eligibility.rescuesToday ?? 0;
        if (eligibility.tier !== 'free') {
          setNudge(null);
        } else if (used >= 3) {
          setNudge("You've hit today's limit - unlimited is one tap away.");
        } else if (used > 0) {
          setNudge(
            `You've rescued ${used} meal${used === 1 ? '' : 's'} today. Members never run out.`,
          );
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
