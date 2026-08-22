import type { PersonalizationInsight, PreferenceLearned } from '@meal-rescue/shared-types';

import { api } from './api';

/**
 * GET /api/v1/user/preferences
 * Returns learned preferences with confidence scores.
 */
export async function getLearnedPreferences(): Promise<PreferenceLearned[]> {
  const res = await api.get<PreferenceLearned[]>('/api/v1/user/preferences');
  return res.data;
}

/**
 * GET /api/v1/user/insights
 * Returns personalization insights from feedback.
 */
export async function getPersonalizationInsights(): Promise<PersonalizationInsight[]> {
  const res = await api.get<PersonalizationInsight[]>('/api/v1/user/insights');
  return res.data;
}
