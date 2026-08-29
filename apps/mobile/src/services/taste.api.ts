import type {
  FoodPersonality,
  TasteJournalEntry,
  TasteMemoryEntry,
} from '@meal-rescue/shared-types';

import { api } from './api';

export async function getTasteProfile(): Promise<TasteMemoryEntry[]> {
  const res = await api.get<TasteMemoryEntry[]>('/api/v1/user/taste/profile');
  return res.data;
}

export async function getPersonality(): Promise<FoodPersonality | null> {
  const res = await api.get<FoodPersonality | null>('/api/v1/user/taste/personality');
  return res.data;
}

export async function getJournal(): Promise<TasteJournalEntry[]> {
  const res = await api.get<TasteJournalEntry[]>('/api/v1/user/taste/journal');
  return res.data;
}

export async function getTasteBundle(): Promise<{
  memories: TasteMemoryEntry[];
  personality: FoodPersonality | null;
  journal: TasteJournalEntry[];
}> {
  const res = await api.get<{
    memories: TasteMemoryEntry[];
    personality: FoodPersonality | null;
    journal: TasteJournalEntry[];
  }>('/api/v1/user/taste');
  return res.data;
}
