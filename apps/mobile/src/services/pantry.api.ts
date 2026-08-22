import type {
  PantryDeleteResponse,
  PantryGetResponse,
  PantryItem,
  PantryUpsertRequest,
} from '@meal-rescue/shared-types';

import { api } from './api';

/**
 * GET  /api/v1/pantry
 * POST /api/v1/pantry
 * DELETE /api/v1/pantry/:id
 * POST /api/v1/pantry/:id/use
 */
export async function getPantry(): Promise<PantryGetResponse> {
  const res = await api.get<PantryGetResponse>('/api/v1/pantry');
  return res.data;
}

export async function upsertPantryItem(payload: PantryUpsertRequest): Promise<PantryItem> {
  const res = await api.post<PantryItem>('/api/v1/pantry', payload);
  return res.data;
}

export async function deletePantryItem(itemId: string): Promise<PantryDeleteResponse> {
  const res = await api.delete<PantryDeleteResponse>(`/api/v1/pantry/${itemId}`);
  return res.data;
}

export async function markPantryItemUsed(itemId: string): Promise<{ success: boolean }> {
  const res = await api.post<{ success: boolean }>(`/api/v1/pantry/${itemId}/use`);
  return res.data;
}
