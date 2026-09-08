import { create } from 'zustand';

import type {
  CravingProfile,
  MealIntent,
  RealityBudgetLevel,
  RealityContext,
  RealityTimeBudget,
  RescueGenerateV2ContextInput,
} from '@meal-rescue/shared-types';

/**
 * Per-rescue decision state: intent -> reality -> craving.
 * Lives for one rescue loop only (no persistence) - reset before a fresh capture.
 *
 * Reality defaults are PERMISSIVE so a tired, hungry cook never fights the form:
 * generous time, cooking allowed, no budget worry, use what's on hand, relaxed cleanup.
 */
export const DEFAULT_REALITY: RealityContext = {
  timeAvailable: 15,
  cookingAllowed: true,
  budgetLevel: 'OPEN',
  useAvailableIngredients: true,
  cleanupTolerance: 'MEDIUM',
};

export function fallbackIntent(): MealIntent {
  return 'DECIDE';
}

export function humanReality(): RealityContext {
  return { ...DEFAULT_REALITY };
}

interface DecisionState {
  intent: MealIntent | null;
  reality: RealityContext;
  craving: CravingProfile | null;
  setIntent: (intent: MealIntent) => void;
  setReality: (patch: Partial<RealityContext>) => void;
  setTimeAvailable: (time: RealityTimeBudget) => void;
  setBudget: (budget: RealityBudgetLevel) => void;
  setCraving: (craving: CravingProfile) => void;
  clearCraving: () => void;
  buildV2Context: () => RescueGenerateV2ContextInput;
  reset: () => void;
}

function initialState() {
  return {
    intent: null,
    reality: humanReality(),
    craving: null,
  };
}

export const useDecisionStore = create<DecisionState>((set, get) => ({
  ...initialState(),

  setIntent: (intent) => set({ intent }),

  setReality: (patch) => set((state) => ({ reality: { ...state.reality, ...patch } })),

  setTimeAvailable: (timeAvailable) =>
    set((state) => ({ reality: { ...state.reality, timeAvailable } })),

  setBudget: (budgetLevel) => set((state) => ({ reality: { ...state.reality, budgetLevel } })),

  setCraving: (craving) => set({ craving }),

  clearCraving: () => set({ craving: null }),

  buildV2Context: () => {
    const { intent, reality, craving } = get();
    const ctx: RescueGenerateV2ContextInput = {};
    if (intent) ctx.intent = intent;
    ctx.reality = reality;
    if (craving) ctx.craving = craving;
    return ctx;
  },

  reset: () => set(initialState()),
}));
