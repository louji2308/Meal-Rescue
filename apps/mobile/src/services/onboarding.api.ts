import type {
  OnboardingAnswer,
  OnboardingAnswerResponse,
  OnboardingStartResponse,
} from '@meal-rescue/shared-types';

import { api } from './api';

export async function startOnboarding(): Promise<OnboardingStartResponse> {
  const res = await api.get<OnboardingStartResponse>('/api/v1/user/taste/onboarding');
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
