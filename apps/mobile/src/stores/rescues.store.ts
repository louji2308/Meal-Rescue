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
  /** Rescues the user explicitly loved, newest first. Powers the paywall. */
  loved: RecentRescue[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addRescue: (input: Omit<RecentRescue, 'id' | 'createdAt'>) => void;
  /**
   * Remember a rescue as loved ("Better" feedback / "Exactly" check-in).
   * Needs the rescue in `recent` (its foods ground the paywall copy); when it
   * is missing, `recommendation` seeds a food-less entry instead of dropping
   * the signal.
   */
  markLoved: (rescueId: string, recommendation?: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'meal-rescue/rescues/recent';
const LOVED_STORAGE_KEY = 'meal-rescue/rescues/loved';
const MAX_RECENT = 8;
const MAX_LOVED = 8;

let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `r-${Date.now()}-${idCounter}`;
}

async function readList(key: string): Promise<RecentRescue[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RecentRescue[]) : null;
  } catch {
    return null;
  }
}

export const useRescuesStore = create<RescuesState>((set, get) => ({
  recent: [],
  loved: [],
  hydrated: false,

  hydrate: async () => {
    const [recent, loved] = await Promise.all([readList(STORAGE_KEY), readList(LOVED_STORAGE_KEY)]);
    set({
      recent: recent ?? [],
      loved: loved ?? [],
      hydrated: true,
    });
  },

  addRescue: (input) => {
    const { recent } = get();
    const next = [{ ...input, id: makeId(), createdAt: new Date().toISOString() }, ...recent]
      .filter((r, i, all) => i === 0 || all.findIndex((x) => x.rescueId === r.rescueId) === i)
      .slice(0, MAX_RECENT);
    set({ recent: next });
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  },

  markLoved: (rescueId, recommendation) => {
    const { recent, loved } = get();
    const source = recent.find((r) => r.rescueId === rescueId);
    const entry: RecentRescue = source ?? {
      id: makeId(),
      rescueId,
      recommendation: (recommendation ?? '').trim() || 'that rescue',
      foods: [],
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...loved.filter((r) => r.rescueId !== rescueId)].slice(0, MAX_LOVED);
    set({ loved: next });
    void AsyncStorage.setItem(LOVED_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  },

  clear: () => {
    set({ recent: [], loved: [] });
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    void AsyncStorage.removeItem(LOVED_STORAGE_KEY).catch(() => {});
  },
}));
