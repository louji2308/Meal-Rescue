import type { CulinaryCompassSeed, CulinaryFamily } from '@meal-rescue/shared-types';

import { api } from './api';

export interface CultureView {
  affinities: Record<CulinaryFamily, number>;
  traditionVsModern: number;
  seeded: boolean;
}

export async function seedCompass(seed: CulinaryCompassSeed): Promise<void> {
  await api.post('/api/v1/user/taste/compass', seed);
}

export async function skipCompass(): Promise<void> {
  await api.post('/api/v1/user/taste/compass', { family: 'none', traditionVsModern: 0 });
}

export async function getCulture(): Promise<CultureView> {
  const res = await api.get<CultureView>('/api/v1/user/taste/culture');
  return res.data;
}
