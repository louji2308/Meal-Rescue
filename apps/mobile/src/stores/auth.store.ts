import { create } from 'zustand';

import { setAuthToken } from '../services/api';

/**
 * Auth session store (Phase 1: local JWT flow).
 * Firebase-backed auth will slot in behind the same interface.
 */
export interface SessionUser {
  id: string;
  email: string;
  subscriptionTier: 'free' | 'pro';
}

interface AuthState {
  token: string | null;
  user: SessionUser | null;
  setSession: (token: string, user: SessionUser) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  setSession: (token, user) => {
    setAuthToken(token);
    set({ token, user });
  },
  clearSession: () => {
    setAuthToken(null);
    set({ token: null, user: null });
  },
}));
