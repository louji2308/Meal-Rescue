import type { FeedbackRequest, FeedbackResponse } from '@meal-rescue/shared-types';

import { api } from './api';

/**
 * POST /api/v1/rescue/:id/feedback
 * Submit post-rescue satisfaction feedback.
 */
export async function submitFeedback(
  rescueId: string,
  payload: FeedbackRequest,
): Promise<FeedbackResponse> {
  const res = await api.post<FeedbackResponse>(`/api/v1/rescue/${rescueId}/feedback`, payload);
  return res.data;
}
