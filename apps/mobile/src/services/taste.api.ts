import type {
  CulinaryFamily,
  FoodPersonality,
  OnboardingAnswer,
  OnboardingAnswerResponse,
  OnboardingStartResponse,
  TasteJournalEntry,
  TasteMemoryEntry,
  TasteV2Response,
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

export async function startOnboarding(): Promise<OnboardingStartResponse> {
  const res = await api.get<OnboardingStartResponse>('/api/v1/user/taste/onboarding');
  return res.data;
}

export async function submitCuisinePreferences(
  cuisines: CulinaryFamily[],
): Promise<OnboardingStartResponse> {
  const res = await api.post<OnboardingStartResponse>('/api/v1/user/taste/onboarding/cuisines', {
    cuisines,
  });
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

export async function getTasteV2(): Promise<TasteV2Response> {
  const res = await api.get<TasteV2Response>('/api/v1/user/taste/v2');
  return res.data;
}
