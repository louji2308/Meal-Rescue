import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * "Import Kitchen" consent. The AI is deliberately never given pantry data
 * unless this is on — the Home button only passes kitchen contents to the
 * rescuer when enabled, and the enable switch lives in the Kitchen tab
 * (never on Home), so the Home "Import kitchen" action stays a one-way
 * action, not a toggle.
 */
interface SettingsState {
  kitchenImportEnabled: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setKitchenImportEnabled: (enabled: boolean) => void;
}

const STORAGE_KEY = 'meal-rescue/settings/kitchen-import';

export const useSettingsStore = create<SettingsState>((set) => ({
  kitchenImportEnabled: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        set({ kitchenImportEnabled: raw === 'true', hydrated: true });
        return;
      }
    } catch {
      // Corrupt/missing — default stays off.
    }
    set({ hydrated: true });
  },

  setKitchenImportEnabled: (enabled) => {
    set({ kitchenImportEnabled: enabled });
    void AsyncStorage.setItem(STORAGE_KEY, String(enabled)).catch(() => {});
  },
}));