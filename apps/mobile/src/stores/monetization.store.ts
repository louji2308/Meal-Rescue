import { create } from 'zustand';

import { getAdEligibility } from '../services/ads.api';

export type AdTier = 'free' | 'pro' | null;

/**
 * Shared effective-tier state for global Pro surfaces (e.g. the Profile tab
 * paw icon). Reads the backend's eligibility endpoint, which reports 'pro'
 * for BOTH a paid subscription and an active 1-hour pro-pass.
 */
interface MonetizationState {
  tier: AdTier;
  isPro: boolean;
  rescueCredits: number;
  refresh: () => Promise<void>;
}

export const useMonetization = create<MonetizationState>((set) => ({
  tier: null,
  isPro: false,
  rescueCredits: 0,
  refresh: async () => {
    try {
      const eligibility = await getAdEligibility();
      set({
        tier: eligibility.tier,
        isPro: eligibility.tier === 'pro',
        rescueCredits: eligibility.rescueCredits,
      });
    } catch {
      set({ tier: null, isPro: false, rescueCredits: 0 });
    }
  },
}));
