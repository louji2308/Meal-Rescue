import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { NotificationKind } from '../services/notifications.api';

export type InAppNotificationKind =
  | NotificationKind
  | 'aftercare'
  | 'promo'
  | 'push'
  | 'system';

export interface InAppNotification {
  id: string;
  kind: InAppNotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  deepLink?: string;
}

interface NotificationsState {
  items: InAppNotification[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  pushNotification: (n: {
    kind: InAppNotificationKind;
    title: string;
    body: string;
    deepLink?: string;
  }) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

const STORAGE_KEY = 'meal-rescue/notifications/inbox';
const MAX_ITEMS = 30;

/** Guards against the same push being recorded twice (foreground + click). */
function isDuplicate(
  items: InAppNotification[],
  title: string,
  body: string,
): boolean {
  const now = Date.now();
  return items.some((n) => {
    if (n.title !== title || n.body !== body) return false;
    return now - new Date(n.createdAt).getTime() < 30_000;
  });
}

let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `n-${Date.now()}-${idCounter}`;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const items = JSON.parse(raw) as InAppNotification[];
        set({ items, hydrated: true });
        return;
      }
    } catch {
      // Corrupt inbox — start fresh.
    }
    set({ hydrated: true });
  },

  pushNotification: ({ kind, title, body, deepLink }) => {
    const { items } = get();
    if (isDuplicate(items, title, body)) return;
    const next = [
      {
        id: makeId(),
        kind,
        title,
        body,
        createdAt: new Date().toISOString(),
        read: false,
        ...(deepLink ? { deepLink } : {}),
      },
      ...items,
    ].slice(0, MAX_ITEMS);
    set({ items: next });
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  },

  markRead: (id) => {
    const item = get().items.find((n) => n.id === id);
    if (!item || item.read) return;
    const next = get().items.map((n) => (n.id === id ? { ...n, read: true } : n));
    set({ items: next });
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  },

  markAllRead: () => {
    const next = get().items.map((n) => (n.read ? n : { ...n, read: true }));
    set({ items: next });
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  },

  clear: () => {
    set({ items: [] });
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },
}));

/** Derived count of unread notifications. */
export function selectUnreadCount(state: NotificationsState): number {
  return state.items.filter((n) => !n.read).length;
}