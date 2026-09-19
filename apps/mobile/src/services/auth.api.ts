import type { AuthTokens } from '@meal-rescue/shared-types';

import { api } from './api';

interface Credentials {
  email: string;
  password: string;
  verificationToken: string;
}

export function checkEmail(email: string): Promise<{ exists: boolean }> {
  return api.post<{ exists: boolean }>('/api/v1/auth/check-email', { email }).then((res) => res.data);
}

export function sendVerificationCode(email: string): Promise<{ sent: boolean }> {
  return api.post<{ sent: boolean }>('/api/v1/auth/send-code', { email }).then((res) => res.data);
}

export function verifyCode(email: string, code: string): Promise<{ verified: boolean; token: string }> {
  return api.post<{ verified: boolean; token: string }>('/api/v1/auth/verify-code', { email, code }).then((res) => res.data);
}

export function registerAccount({ email, password, verificationToken }: Credentials): Promise<AuthTokens> {
  return api.post<AuthTokens>('/api/v1/auth/register', { email, password, verificationToken }).then((res) => res.data);
}

export function loginWithCredentials({ email, password, verificationToken }: Credentials): Promise<AuthTokens> {
  return api.post<AuthTokens>('/api/v1/auth/login', { email, password, verificationToken }).then((res) => res.data);
}

export function loginWithGoogle(idToken: string): Promise<AuthTokens> {
  return api.post<AuthTokens>('/api/v1/auth/google', { idToken }).then((res) => res.data);
}

export function completeOnboarding(): Promise<{ onboardingCompleted: boolean }> {
  return api.post<{ onboardingCompleted: boolean }>('/api/v1/user/complete-onboarding').then((res) => res.data);
}
