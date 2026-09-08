import type {
  Constraints,
  MealAnalysisResponse,
  RealityContext,
  RescueGenerateResponse,
  RescueGenerateV2ContextInput,
} from '@meal-rescue/shared-types';

import { api } from './api';

/** Map V2 reality -> legacy constraints so the pre-integration backend still works. */
function constraintsFromReality(reality: RealityContext): Constraints {
  const constraints: Constraints = {};
  if (reality.timeAvailable) {
    constraints.timeMinutes = reality.timeAvailable;
    constraints.cookingRequired = reality.cookingAllowed;
  } else if (!reality.cookingAllowed) {
    constraints.cookingRequired = false;
  }
  if (reality.budgetLevel === 'LOW') {
    constraints.budget = 'low';
  }
  return constraints;
}

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

/**
 * V2 decision-aware generate.
 *
 * Ships BOTH the legacy `constraints` (derived from reality) and the frozen
 * `request.v2` context (intent / reality / craving). The backend contract
 * freeze added `v2` to RescueGenerateRequest; if the currently-running backend
 * still rejects the unknown key (strict schema), we transparently retry with
 * constraints-only so the loop never dead-ends pre-integration.
 */
export async function generateRescueV2(
  mealId: string,
  v2: RescueGenerateV2ContextInput,
): Promise<RescueGenerateResponse> {
  const constraints = v2.reality ? constraintsFromReality(v2.reality) : {};
  const payload = { mealId, constraints, v2 };
  try {
    const res = await api.post<RescueGenerateResponse>('/api/v1/rescue/generate', payload);
    return res.data;
  } catch (err) {
    const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data
      ?.error?.code;
    // The strict pre-integration schema rejects the unknown "v2" key with
    // INVALID_GENERATE_INPUT. Any OTHER failure should surface normally.
    if (code === 'INVALID_GENERATE_INPUT') {
      const res = await api.post<RescueGenerateResponse>('/api/v1/rescue/generate', {
        mealId,
        constraints,
      });
      return res.data;
    }
    throw err;
  }
}
