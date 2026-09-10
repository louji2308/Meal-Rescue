import type {
  FoodPersonality,
  OnboardingAnswer,
  OnboardingAnswerResponse,
  OnboardingPair,
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

export async function startOnboarding(): Promise<{
  pair: OnboardingPair | null;
  seeded: boolean;
}> {
  const res = await api.get<{ pair: OnboardingPair | null; seeded: boolean }>(
    '/api/v1/user/taste/onboarding',
  );
  return res.data;
}

export async function answerOnboarding(
  answer: OnboardingAnswer,
): Promise<OnboardingAnswerResponse> {
  const res = await api.post<OnboardingAnswerResponse>('/api/v1/user/taste/onboarding/answers', {
    answer,
  });
  return res.data;
}
