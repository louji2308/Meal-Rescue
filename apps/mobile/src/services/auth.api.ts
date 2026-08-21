import type { AuthTokens } from '@meal-rescue/shared-types';

import { api } from './api';

interface Credentials {
  email: string;
  password: string;
}

export function registerAccount({ email, password }: Credentials): Promise<AuthTokens> {
  return api.post<AuthTokens>('/api/v1/auth/register', { email, password }).then((res) => res.data);
}

export function loginWithCredentials({ email, password }: Credentials): Promise<AuthTokens> {
  return api.post<AuthTokens>('/api/v1/auth/login', { email, password }).then((res) => res.data);
}
