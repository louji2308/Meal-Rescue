import { create } from 'zustand';

import { randomUUID } from '../lib/uuid';

/**
 * Rewarded-ad gateway.
 *
 * A real AdMob integration loads a rewarded ad and resolves when the user
 * earns the reward (server-side verification lands later via RevenueCat).
 * This build ships the SIMULATED path only: a full-screen branded countdown
 * presented by SimulatedAdModal, resolving with a synthetic transaction id
 * that the backend ledger treats like any other idempotent claim.
 *
 * The modal is mounted once at the app root; showAd() returns a promise that
 * resolves on completion or rejects on dismissal, so call sites stay linear:
 *
 *   const txId = await showRewardedAd();
 *   await claimRescueFuel(txId);
 */

type AdStore = {
  visible: boolean;
  purpose: string | null;
  resolver: ((txId: string) => void) | null;
  rejecter: (() => void) | null;
  complete: () => void;
  dismiss: () => void;
};

export const useAdStore = create<AdStore>((set, get) => ({
  visible: false,
  purpose: null,
  resolver: null,
  rejecter: null,
  complete: () => {
    const { resolver } = get();
    if (resolver) resolver(`sim-${randomUUID()}`);
    set({ visible: false, purpose: null, resolver: null, rejecter: null });
  },
  dismiss: () => {
    const { rejecter } = get();
    if (rejecter) rejecter();
    set({ visible: false, purpose: null, resolver: null, rejecter: null });
  },
}));

export function showRewardedAd(purpose = 'reward'): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    useAdStore.setState({ visible: true, purpose, resolver: resolve, rejecter: reject });
  });
}
