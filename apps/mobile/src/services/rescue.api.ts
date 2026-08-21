import type {
  Constraints,
  MealAnalysisResponse,
  RescueGenerateResponse,
} from '@meal-rescue/shared-types';

import { api } from './api';

export interface PickedImage {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 * POST /api/v1/meal/analyze - accepts either a photo (multipart "image")
 * or a plain-text description, mirroring the backend route contract.
 */
export async function analyzeMeal(input: {
  text?: string;
  image?: PickedImage;
}): Promise<MealAnalysisResponse> {
  if (input.image) {
    const form = new FormData();
    // React Native FormData accepts { uri, name, type } file descriptors.
    form.append('image', {
      uri: input.image.uri,
      name: input.image.name,
      type: input.image.mimeType,
    } as unknown as Blob);
    const res = await api.post<MealAnalysisResponse>('/api/v1/meal/analyze', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  const res = await api.post<MealAnalysisResponse>('/api/v1/meal/analyze', { text: input.text });
  return res.data;
}

/**
 * POST /api/v1/rescue/generate - runs the minimum-intervention funnel.
 * Returns ONE recommendation plus at most TWO alternatives.
 */
export async function generateRescue(
  mealId: string,
  constraints: Constraints = {},
): Promise<RescueGenerateResponse> {
  const res = await api.post<RescueGenerateResponse>('/api/v1/rescue/generate', {
    mealId,
    constraints,
  });
  return res.data;
}
