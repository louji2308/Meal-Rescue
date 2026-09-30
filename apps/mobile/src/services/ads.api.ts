import type {
  AdEligibilityResponse,
  ProPassClaimResponse,
  RescueFuelClaimResponse,
} from '@meal-rescue/shared-types';

import { api } from './api';

/** GET /api/v1/ads/eligibility */
export async function getAdEligibility(): Promise<AdEligibilityResponse> {
  const res = await api.get<AdEligibilityResponse>('/api/v1/ads/eligibility');
  return res.data;
}

/** POST /api/v1/ads/rewards/rescue-fuel - idempotent per ad transaction. */
export async function claimRescueFuel(adTransactionId: string): Promise<RescueFuelClaimResponse> {
  const res = await api.post<RescueFuelClaimResponse>('/api/v1/ads/rewards/rescue-fuel', {
    adTransactionId,
  });
  return res.data;
}

/** POST /api/v1/ads/rewards/pro-pass - idempotent per ad transaction. */
export async function claimProPass(adTransactionId: string): Promise<ProPassClaimResponse> {
  const res = await api.post<ProPassClaimResponse>('/api/v1/ads/rewards/pro-pass', {
    adTransactionId,
  });
  return res.data;
}

/**
 * Sync subscription tier from RevenueCat to the backend.
 * Call after purchase, restore, or on app start to ensure the backend's
 * subscription_tier matches RevenueCat's entitlement state.
 *
 * `entitlement` carries the SDK's own verdict (react-native-purchases
 * getCustomerInfo) so the backend can still record the tier when
 * RevenueCat's REST API refuses the key (test-store purchases). The
 * response is authoritative: the app only shows Pro when it says 'pro'.
 */
export async function syncSubscription(
  entitlement?: { active: boolean; expiresAt?: string | null } | null,
): Promise<{ tier: 'free' | 'pro'; verifiedBy?: string }> {
  const res = await api.post<{ tier: 'free' | 'pro'; verifiedBy?: string }>(
    '/api/v1/subscription/sync',
    entitlement ? { entitlement } : {},
  );
  return res.data;
}
