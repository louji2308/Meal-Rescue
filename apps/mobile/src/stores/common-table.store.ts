import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type {
  CommonTableResult,
  CreateMemberRequest,
  Household,
  HouseholdMemberProfile,
  UpdateMemberRequest,
} from '@meal-rescue/shared-types';

import {
  getHousehold as fetchHousehold,
  createHousehold,
  addHouseholdMember,
  updateHouseholdMember,
  removeHouseholdMember,
} from '../services/common-table.api';

const STORAGE_KEY = 'meal-rescue/common-table/active';

interface CommonTableState {
  /** Full household (includes owner). */
  household: Household | null;
  /** Derived member list for quick lookups. */
  members: HouseholdMemberProfile[];
  /** Member IDs currently selected for a convergence session. */
  selectedMemberIds: string[];
  /** The most recently converged CommonTableResult (for the active session). */
  result: CommonTableResult | null;
  /** Shared meal ID persisted so the app can resume mid-cook after restart. */
  activeSharedMealId: string | null;
  /** Back-reference used for resume: only resume when status is cooking/split. */
  activeSharedMealStatus: string | null;

  loadHousehold: () => Promise<void>;
  ensureHousehold: () => Promise<void>;
  setSelectedMemberIds: (ids: string[]) => void;
  toggleSelectedMember: (id: string) => void;
  setResult: (result: CommonTableResult | null) => void;
  setActiveSheet: (id: string | null, status: string | null) => void;
  hydrate: () => Promise<void>;
  reset: () => void;

  addMember: (input: CreateMemberRequest) => Promise<HouseholdMemberProfile>;
  updateMember: (memberId: string, input: UpdateMemberRequest) => Promise<HouseholdMemberProfile>;
  removeMember: (memberId: string) => Promise<void>;
}

export const useCommonTableStore = create<CommonTableState>((set, get) => ({
  household: null,
  members: [],
  selectedMemberIds: [],
  result: null,
  activeSharedMealId: null,
  activeSharedMealStatus: null,

  loadHousehold: async () => {
    const household = await fetchHousehold();
    set({ household, members: household?.members ?? [] });
  },

  ensureHousehold: async () => {
    const current = get().household;
    if (current) return;
    const household = await createHousehold();
    set({ household, members: household.members ?? [] });
  },

  setSelectedMemberIds: (ids) => set({ selectedMemberIds: ids }),

  toggleSelectedMember: (id) => {
    const current = get().selectedMemberIds;
    set({
      selectedMemberIds: current.includes(id)
        ? current.filter((m) => m !== id)
        : [...current, id],
    });
  },

  setResult: (result) => set({ result }),

  setActiveSheet: async (id, status) => {
    set({ activeSharedMealId: id, activeSharedMealStatus: status });
    if (id && status) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ id, status }));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { id, status } = JSON.parse(raw) as { id: string; status: string };
      if (id && (status === 'cooking' || status === 'split')) {
        set({ activeSharedMealId: id, activeSharedMealStatus: status });
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Corrupt — start fresh.
    }
  },

  reset: () => {
    void AsyncStorage.removeItem(STORAGE_KEY);
    set({
      result: null,
      selectedMemberIds: [],
      activeSharedMealId: null,
      activeSharedMealStatus: null,
    });
  },

  addMember: async (input) => {
    const member = await addHouseholdMember(input);
    // Reload household to keep members array fresh.
    await get().loadHousehold();
    return member;
  },

  updateMember: async (memberId, input) => {
    const member = await updateHouseholdMember(memberId, input);
    await get().loadHousehold();
    return member;
  },

  removeMember: async (memberId) => {
    await removeHouseholdMember(memberId);
    // Also drop from selection if it was selected.
    const selected = get().selectedMemberIds.filter((id) => id !== memberId);
    set({ selectedMemberIds: selected });
    await get().loadHousehold();
  },
}));
