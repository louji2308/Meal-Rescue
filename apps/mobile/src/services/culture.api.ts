import type { CulinaryFamily } from '@meal-rescue/shared-types';

import { api } from './api';

export interface CultureView {
  affinities: Record<CulinaryFamily, number>;
  traditionVsModern: number;
  seeded: boolean;
}

export async function getCulture(): Promise<CultureView> {
  const res = await api.get<CultureView>('/api/v1/user/taste/culture');
  return res.data;
}
