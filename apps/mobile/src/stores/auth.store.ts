import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { setAuthToken } from '../services/api';

/**
 * Auth session store. The JWT survives app restarts via AsyncStorage;
 * `hydrate()` must run once at boot before gating navigation.
 */
export interface SessionUser {
  id: string;
  email: string;
  subscriptionTier: 'free' | 'pro';
}

interface AuthState {
  token: string | null;
  user: SessionUser | null;
  hydrated: boolean;
  setSession: (token: string, user: SessionUser) => void;
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
  clearSession: () => {
    setAuthToken(null);
    void AsyncStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null });
  },
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { token: string; user: SessionUser };
        setAuthToken(saved.token);
        set({ token: saved.token, user: saved.user });
      }
    } catch {
      // Corrupt or missing session - start signed out.
    } finally {
      set({ hydrated: true });
    }
  },
}));
