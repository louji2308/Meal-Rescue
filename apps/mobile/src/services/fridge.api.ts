import type {
  FridgeNegotiateRequest,
  FridgeNegotiateResponse,
  HungerLevel,
} from '@meal-rescue/shared-types';

import { useAuthStore } from '../stores/auth.store';
import { api } from './api';

/**
 * POST /api/v1/fridge/negotiate
 * "I'm hungry, here's what I have" -> up to 3 meal recommendations.
 * userId is injected from the session - the backend derives identity from the JWT.
 */
export async function negotiateFridge(payload: {
  availableIngredients: string[];
  timeMinutes: number;
  hungerLevel?: HungerLevel;
}): Promise<FridgeNegotiateResponse> {
  const userId = useAuthStore.getState().user?.id ?? '';
  const body: FridgeNegotiateRequest = { ...payload, userId };
  const res = await api.post<FridgeNegotiateResponse>('/api/v1/fridge/negotiate', body);
  return res.data;
}
