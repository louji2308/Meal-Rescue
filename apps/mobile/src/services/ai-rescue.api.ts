import { api } from './api';

export interface AiRescueData {
  bestMove: string;
  reasoning: string;
  timeMinutes: number;
  effort: 'low' | 'medium' | 'high';
  whatYouKept: string[];
  whatYouAdded: string[];
  alternatives: Array<{ name: string; reasoning: string }>;
}

export interface AiRescueResponse {
  success: boolean;
  data: AiRescueData;
}

export interface AiNegotiateResponse {
  success: boolean;
  data: AiRescueData;
}

/**
 * POST /api/v1/ai-rescue/generate — single AI call for meal rescue.
 */
export async function generateAiRescue(params: {
  foods: string[];
  ingredients?: string[];
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  userMood?: string;
  kitchenItems?: Array<{ name: string; state: string; expiresSoon: boolean }>;
}): Promise<AiRescueData> {
  const res = await api.post<AiRescueResponse>('/api/v1/ai-rescue/generate', params);
  return res.data.data;
}

/**
 * POST /api/v1/ai-rescue/negotiate — user pushes back, AI adapts.
 */
export async function negotiateAiRescue(params: {
  conversation: Array<{ role: 'user' | 'ai'; content: string }>;
  originalFoods: string[];
  pushback: string;
}): Promise<AiRescueData> {
  const res = await api.post<AiNegotiateResponse>('/api/v1/ai-rescue/negotiate', params);
  return res.data.data;
}
