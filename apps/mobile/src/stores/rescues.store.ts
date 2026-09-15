import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export interface RecentRescue {
  id: string;
  rescueId: string;
  recommendation: string;
  foods: string[];
  createdAt: string;
}

interface RescuesState {
  recent: RecentRescue[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addRescue: (input: Omit<RecentRescue, 'id' | 'createdAt'>) => void;
  clear: () => void;
}

const STORAGE_KEY = 'meal-rescue/rescues/recent';
const MAX_RECENT = 8;

let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `r-${Date.now()}-${idCounter}`;
}

export const useRescuesStore = create<RescuesState>((set, get) => ({
  recent: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const recent = JSON.parse(raw) as RecentRescue[];
        set({ recent, hydrated: true });
        return;
      }
    } catch {
      // Corrupt history — start fresh.
    }
    set({ hydrated: true });
  },

  addRescue: (input) => {
    const { recent } = get();
    const next = [{ ...input, id: makeId(), createdAt: new Date().toISOString() }, ...recent]
      .filter((r, i, all) => i === 0 || all.findIndex((x) => x.rescueId === r.rescueId) === i)
      .slice(0, MAX_RECENT);
    set({ recent: next });
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  },

  clear: () => {
    set({ recent: [] });
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },
}));