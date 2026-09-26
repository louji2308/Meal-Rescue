import axios from 'axios';

import type { ErrorResponse } from '@meal-rescue/shared-types';

/**
 * Base URLs tried in order on pure network failures (no HTTP response).
 * - Configured URL first (LAN / EXPO_PUBLIC_API_BASE_URL)
 * - 127.0.0.1: adb reverse over USB
 * - 10.0.2.2: Android emulator host loopback
 */
const BASE_URLS = Array.from(
  new Set(
    [
      process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.57.6.237:3010',
      'http://127.0.0.1:3010',
      'http://10.0.2.2:3010',
    ].filter(Boolean),
  ),
);

let baseIndex = 0;

export const api = axios.create({
  baseURL: BASE_URLS[0],
  timeout: 30_000,
});

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

type RetryConfig = { baseURL?: string; __baseTried?: number[] } & Record<string, unknown>;

// On network-level failures only (no HTTP response), walk remaining base URLs
// before surfacing "Cannot reach Meal Rescue".
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || error.response || !error.config) {
      throw error;
    }
    const config = error.config as unknown as RetryConfig;
    const tried = config.__baseTried ?? [];
    for (let i = 0; i < BASE_URLS.length; i++) {
      if (i === baseIndex || tried.includes(i)) continue;
      tried.push(i);
      try {
        const next = await api.request({
          ...(config as unknown as Record<string, unknown>),
          baseURL: BASE_URLS[i],
          ...({ __baseTried: tried } as Record<string, unknown>),
        });
        baseIndex = i;
        api.defaults.baseURL = BASE_URLS[i];
        return next;
      } catch (retryErr) {
        if (axios.isAxiosError(retryErr) && retryErr.response) {
          throw retryErr;
        }
      }
    }
    throw error;
  },
);

/**
 * Normalized error surfaced to screens. The backend always answers failures
 * with the structured ErrorResponse contract; network failures are mapped
 * onto the same shape so UI code handles exactly one error type.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly category: string;
  readonly recoverable: boolean;
  readonly suggestedAction?: string;

  constructor(
    init: Pick<ApiError, 'code' | 'category' | 'recoverable' | 'suggestedAction'> & {
      message: string;
    },
  ) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.category = init.category;
    this.recoverable = init.recoverable;
    this.suggestedAction = init.suggestedAction;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) {
    return err;
  }

  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ErrorResponse | undefined;
    if (body && body.success === false && body.error) {
      return new ApiError({
        message: body.error.message,
        code: body.error.code,
        category: body.error.category,
        recoverable: body.error.recoverable,
        suggestedAction: body.error.suggestedAction,
      });
    }
    return new ApiError({
      message: 'Cannot reach Meal Rescue. Check your connection and try again.',
      code: 'NETWORK_ERROR',
      category: 'EXTERNAL_SERVICE_FAILURE',
      recoverable: true,
    });
  }

  return new ApiError({
    message: 'Something went wrong. Please try again.',
    code: 'UNKNOWN',
    category: 'INTERNAL',
    recoverable: true,
  });
}
