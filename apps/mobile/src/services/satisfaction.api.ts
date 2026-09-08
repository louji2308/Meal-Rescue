import type {
  SatisfactionRecordRequest,
  SatisfactionRecordResponse,
} from '@meal-rescue/shared-types';

import { api, toApiError } from './api';

/**
 * POST /api/v1/rescue/:id/satisfaction — records a one-tap satisfaction
 * check-in. The response carries personalizationImpact strings the UI
 * can show immediately ("Your next rescue will lean toward quicker options").
 *
 * Route contract coded against:
 *   POST /api/v1/rescue/:rescueId/satisfaction
 *   Body:  SatisfactionRecordRequest  { result, reason? }
 *   201:   SatisfactionRecordResponse { success, recorded, personalizationImpact }
 */
export async function recordSatisfaction(
  rescueId: string,
  body: SatisfactionRecordRequest,
): Promise<SatisfactionRecordResponse> {
  const { data } = await api.post<SatisfactionRecordResponse>(
    `/api/v1/rescue/${encodeURIComponent(rescueId)}/satisfaction`,
    body,
  );
  return data;
}

/**
 * Graceful wrapper that surfaces the structured error without crashing.
 */
export async function recordSatisfactionSafe(
  rescueId: string,
  body: SatisfactionRecordRequest,
): Promise<
  | { ok: true; data: SatisfactionRecordResponse }
  | { ok: false; error: ReturnType<typeof toApiError> }
> {
  try {
    const data = await recordSatisfaction(rescueId, body);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toApiError(err) };
  }
}
