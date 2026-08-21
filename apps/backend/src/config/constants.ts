import { ErrorCategory } from '@meal-rescue/shared-types';

/**
 * Routes that never require authentication.
 * Everything under /api/v1 not listed here requires a valid JWT.
 */
export const PUBLIC_ROUTES = [
  '/health',
  '/docs',
  '/docs/',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
] as const;

/** Per-tier rate limits from the architecture doc (security section). */
export const RATE_LIMITS = {
  free: {
    rescuesPerDay: 3,
    requestsPerMinute: 10,
  },
  pro: {
    rescuesPerDay: Number.POSITIVE_INFINITY,
    requestsPerMinute: 60,
  },
} as const;

export const API_PREFIX = '/api/v1';

export const ERROR_CATEGORIES_RECOVERABLE: ReadonlySet<ErrorCategory> = new Set([
  ErrorCategory.RATE_LIMIT_EXCEEDED,
  ErrorCategory.EXTERNAL_SERVICE_FAILURE,
]);
