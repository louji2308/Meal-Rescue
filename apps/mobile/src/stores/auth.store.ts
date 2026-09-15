import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { setAuthToken } from '../services/api';
import { useCommonTableStore } from './common-table.store';
import { useDecisionStore } from './decision.store';
import { useMealMemoryStore } from './meal-memory.store';

/**
 * Auth session store. The JWT survives app restarts via AsyncStorage;
 * `hydrate()` must run once at boot before gating navigation.
 */
export interface SessionUser {
  id: string;
  email: string;
  subscriptionTier: 'free' | 'pro';
  onboardingCompleted?: boolean;
}

interface AuthState {
  token: string | null;
  user: SessionUser | null;
  hydrated: boolean;
  setSession: (token: string, user: SessionUser) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  clearSession: () => void;
  hydrate: () => Promise<void>;
}

const STORAGE_KEY = 'meal-rescue/session';

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,
  setSession: (token, user) => {
    setAuthToken(token);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
    set({ token, user });
  },
  setOnboardingCompleted: (completed) => {
    set((state) => {
      if (!state.user) return state;
      const user = { ...state.user, onboardingCompleted: completed };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, user }));
      return { user };
    });
  },
  clearSession: () => {
    setAuthToken(null);
    void AsyncStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null });
    useCommonTableStore.getState().reset();
    useMealMemoryStore.getState().reset();
    useDecisionStore.getState().reset();
  },
  hydrate: async () => {
    try {
      // Always clear session on boot so the login screen shows first.
      // The user must explicitly sign in each app session.
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    } finally {
      set({ hydrated: true });
    }
  },
}));
