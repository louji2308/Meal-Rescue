import type {
  AiPlannerResponse,
  MealEvent,
  MealMemoryConfirmRequest,
  MealMemoryConfirmResponse,
  MealMemoryCreateRuleRequest,
  MealMemoryDeactivateRuleResponse,
  MealMemoryFeedbackRequest,
  MealMemoryFeedbackResponse,
  MealMemoryIntentRequest,
  MealMemoryIntentResponse,
  MealMemoryMealDetailResponse,
  MealMemoryMoveMealRequest,
  MealMemoryRecentsResponse,
  MealMemoryRecordActualRequest,
  MealMemoryRecordActualResponse,
  MealMemoryRememberRequest,
  MealMemoryRememberResponse,
  MealMemoryReuseWeekRequest,
  MealMemoryReuseWeekResponse,
  MealMemoryRulesResponse,
  MealMemoryUpdateMealRequest,
  MealMemoryWeekResponse,
  MealRule,
  PlanConfirmRequest,
  PlanConfirmResponse,
  PlanPreviewResponse,
  PlanWeekRequest,
  PlanWeekResponse,
} from '@meal-rescue/shared-types';

import { api } from './api';

/**
 * Meal Memory API client — the intent-aware household food agent.
 *
 * All routes live under /api/v1/meal-memory and answer with the shared
 * Meal Memory contract types.
 */

export async function postIntent(
  input: MealMemoryIntentRequest,
): Promise<MealMemoryIntentResponse> {
  const res = await api.post<MealMemoryIntentResponse>('/api/v1/meal-memory/intent', input);
  return res.data;
}

export async function confirmIntent(
  input: MealMemoryConfirmRequest,
): Promise<MealMemoryConfirmResponse> {
  const res = await api.post<MealMemoryConfirmResponse>('/api/v1/meal-memory/confirm', input);
  return res.data;
}

export async function planWeek(input: PlanWeekRequest): Promise<PlanWeekResponse> {
  const res = await api.post<PlanWeekResponse>('/api/v1/meal-memory/plan-week', input);
  return res.data;
}

export async function getWeek(
  weekStart?: string,
  memberId?: string,
): Promise<MealMemoryWeekResponse> {
  const res = await api.get<MealMemoryWeekResponse>('/api/v1/meal-memory/week', {
    params: { weekStart, memberId },
  });
  return res.data;
}

export async function reuseWeek(
  input: MealMemoryReuseWeekRequest,
): Promise<MealMemoryReuseWeekResponse> {
  const res = await api.post<MealMemoryReuseWeekResponse>('/api/v1/meal-memory/reuse-week', input);
  return res.data;
}

export async function getRecents(): Promise<MealMemoryRecentsResponse> {
  const res = await api.get<MealMemoryRecentsResponse>('/api/v1/meal-memory/recent');
  return res.data;
}

export async function getMealDetail(eventId: string): Promise<MealMemoryMealDetailResponse> {
  const res = await api.get<MealMemoryMealDetailResponse>(
    `/api/v1/meal-memory/meals/${eventId}/detail`,
  );
  return res.data;
}

export async function updateMeal(
  eventId: string,
  input: MealMemoryUpdateMealRequest,
): Promise<MealEvent> {
  const res = await api.patch<{ event: MealEvent }>(`/api/v1/meal-memory/meals/${eventId}`, input);
  return res.data.event;
}

export async function moveMeal(
  eventId: string,
  input: MealMemoryMoveMealRequest,
): Promise<MealEvent> {
  const res = await api.post<{ event: MealEvent }>(
    `/api/v1/meal-memory/meals/${eventId}/move`,
    input,
  );
  return res.data.event;
}

export async function removeMeal(eventId: string): Promise<MealEvent> {
  const res = await api.post<{ event: MealEvent }>(`/api/v1/meal-memory/meals/${eventId}/remove`);
  return res.data.event;
}

export async function recordActual(
  input: MealMemoryRecordActualRequest,
): Promise<MealMemoryRecordActualResponse> {
  const res = await api.post<MealMemoryRecordActualResponse>(
    '/api/v1/meal-memory/record-actual',
    input,
  );
  return res.data;
}

export async function remember(
  input: MealMemoryRememberRequest,
): Promise<MealMemoryRememberResponse> {
  const res = await api.post<MealMemoryRememberResponse>('/api/v1/meal-memory/remember', input);
  return res.data;
}

export async function createRule(input: MealMemoryCreateRuleRequest): Promise<MealRule> {
  const res = await api.post<{ rule: MealRule }>('/api/v1/meal-memory/rules', input);
  return res.data.rule;
}

export async function listRules(): Promise<MealRule[]> {
  const res = await api.get<MealMemoryRulesResponse>('/api/v1/meal-memory/rules');
  return res.data.rules;
}

export async function deactivateRule(ruleId: string): Promise<MealRule> {
  const res = await api.post<MealMemoryDeactivateRuleResponse>(
    `/api/v1/meal-memory/rules/${ruleId}/deactivate`,
  );
  return res.data.rule;
}

export async function postFeedback(
  input: MealMemoryFeedbackRequest,
): Promise<MealMemoryFeedbackResponse> {
  const res = await api.post<MealMemoryFeedbackResponse>('/api/v1/meal-memory/feedback', input);
  return res.data;
}

export async function getMealInstructions(
  eventId: string,
  concept: string,
  ingredients?: string[],
  mealSlot?: string,
): Promise<{ cookingInstructions: string[]; ingredients: string[]; tips: string[] }> {
  const res = await api.post<{
    cookingInstructions: string[];
    ingredients: string[];
    tips: string[];
  }>(`/api/v1/meal-memory/meals/${eventId}/instructions`, { concept, ingredients, mealSlot });
  return res.data;
}

export async function postPlanPreview(text: string): Promise<PlanPreviewResponse> {
  const res = await api.post<PlanPreviewResponse>('/api/v1/meal-memory/plan-preview', { text });
  return res.data;
}

export async function postAiPlan(input: {
  text: string;
  sessionId?: string | null;
}): Promise<AiPlannerResponse> {
  const res = await api.post<AiPlannerResponse>('/api/v1/meal-memory/ai-plan', {
    text: input.text,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });
  return res.data;
}

export async function postPlanConfirm(input: PlanConfirmRequest): Promise<PlanConfirmResponse> {
  const res = await api.post<PlanConfirmResponse>('/api/v1/meal-memory/plan-confirm', input);
  return res.data;
}
