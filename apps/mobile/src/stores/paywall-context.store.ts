import { create } from 'zustand';

import type { PlanPreviewResponse } from '@meal-rescue/shared-types';

import type { PlanUpsellContext } from '../services/paywall.api';

/**
 * Paywall context store — remembers WHY the paywall was opened so the screen
 * can greet the user with copy about their actual plan instead of a generic
 * line. Cleared on purchase/restore and whenever the plan changes.
 */
interface PaywallContextState {
  plan: PlanUpsellContext | null;
  setPlan: (plan: PlanUpsellContext) => void;
  setPlanFromPreview: (preview: PlanPreviewResponse) => void;
  clearPlan: () => void;
}

/** Free day first, then the locked days — both in date order. */
export function contextFromPreview(preview: PlanPreviewResponse): PlanUpsellContext {
  const unlocked = preview.days.filter((day) => !day.locked);
  const locked = preview.days.filter((day) => day.locked);
  const first = unlocked[0] ?? null;
  return {
    plannedDateKey: first?.dateKey ?? null,
    plannedMeals: first ? first.meals.map((meal) => meal.name).filter(Boolean) : [],
    lockedDateKeys: locked.map((day) => day.dateKey),
  };
}

export const usePaywallContext = create<PaywallContextState>((set) => ({
  plan: null,
  setPlan: (plan) => set({ plan }),
  setPlanFromPreview: (preview) => set({ plan: contextFromPreview(preview) }),
  clearPlan: () => set({ plan: null }),
}));
