import type { AftercareEligibility } from '@meal-rescue/shared-types';

import { api, toApiError } from './api';

/**
 * GET /api/v1/rescue/:id/aftercare-eligibility — tells the client whether
 * an aftercare notification should be scheduled for this rescue. The backend
 * enforces cooldown, deduplication, and user preference rules.
 *
 * Route contract coded against:
 *   GET /api/v1/rescue/:rescueId/aftercare-eligibility
 *   200: AftercareEligibility { eligible, reason? }
 *
 * reason is one of: COOLDOWN | NO_RESCUE | ALREADY_SENT | FEEDBACK_DISABLED | OK
 */
export async function getAftercareEligibility(rescueId: string): Promise<AftercareEligibility> {
  const { data } = await api.get<AftercareEligibility>(
    `/api/v1/rescue/${encodeURIComponent(rescueId)}/aftercare-eligibility`,
  );
  return data;
}

export async function getAftercareEligibilitySafe(
  rescueId: string,
): Promise<
  { ok: true; data: AftercareEligibility } | { ok: false; error: ReturnType<typeof toApiError> }
> {
  try {
    const data = await getAftercareEligibility(rescueId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toApiError(err) };
  }
}
