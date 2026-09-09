import type { DecideRequest, DecideResponse, UserDecision } from '@meal-rescue/shared-types';

import { api, toApiError } from './api';

/**
 * POST /api/v1/rescue/:id/decide — commits the user's ACTUAL action for a
 * rescue (plan §9 / §27). This is what flips rescue.userDecision off
 * 'pending' server-side; the feedback loop and the meal_completed aftercare
 * gate both depend on it, so the UI commits BEFORE navigating to Feedback.
 *
 * Route contract:
 *   POST /api/v1/rescue/:rescueId/decide
 *   Body:  DecideRequest  { action: UserDecision }
 *   201:   DecideResponse { success, rescueId, userDecision, decisionTimestamp }
 */
export async function commitDecision(
  rescueId: string,
  action: UserDecision,
): Promise<DecideResponse> {
  const payload: DecideRequest = { action };
  const { data } = await api.post<DecideResponse>(
    `/api/v1/rescue/${encodeURIComponent(rescueId)}/decide`,
    payload,
  );
  return data;
}

/**
 * Graceful wrapper that surfaces the structured error without crashing.
 */
export async function commitDecisionSafe(
  rescueId: string,
  action: UserDecision,
): Promise<
  { ok: true; data: DecideResponse } | { ok: false; error: ReturnType<typeof toApiError> }
> {
  try {
    const data = await commitDecision(rescueId, action);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toApiError(err) };
  }
}
