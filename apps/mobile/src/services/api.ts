import axios from 'axios';

import type { ErrorResponse } from '@meal-rescue/shared-types';

/**
 * Typed API client for the Meal Rescue backend.
 *
 * Base URL comes from EXPO_PUBLIC_API_BASE_URL. Note for local dev:
 * - iOS simulator: http://localhost:3000 works
 * - Android emulator: use http://10.0.2.2:3000 (host loopback alias)
 */
export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
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
