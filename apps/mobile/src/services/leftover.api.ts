import type {
  LeftoverAlchemistRequest,
  LeftoverAlchemistResponse,
} from '@meal-rescue/shared-types';

import { useAuthStore } from '../stores/auth.store';
import { api } from './api';

/**
 * POST /api/v1/leftover/alchemist
 * "Photograph leftovers -> Transform what exists" -> up to 3 transformations.
 * userId is injected from the session - the backend derives identity from the JWT.
 */
export async function alchemizeLeftovers(payload: {
  image?: { uri: string; name: string; mimeType: string };
  description?: string;
}): Promise<LeftoverAlchemistResponse> {
  const userId = useAuthStore.getState().user?.id ?? '';

  if (payload.image) {
    const form = new FormData();
    form.append('image', {
      uri: payload.image.uri,
      name: payload.image.name,
      type: payload.image.mimeType,
    } as unknown as Blob);
    if (payload.description) {
      form.append('description', payload.description);
    }
    form.append('userId', userId);
    const res = await api.post<LeftoverAlchemistResponse>('/api/v1/leftover/alchemist', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  const body: LeftoverAlchemistRequest = {
    description: payload.description,
    userId,
  };
  const res = await api.post<LeftoverAlchemistResponse>('/api/v1/leftover/alchemist', body);
  return res.data;
}
