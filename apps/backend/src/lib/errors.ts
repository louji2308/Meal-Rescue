import { ErrorCategory } from '@meal-rescue/shared-types';

/**
 * Application error type carrying the structured error contract from the
 * architecture doc: category, code, recoverability, suggested action.
 *
 * Services throw AppError; the global error handler serializes it.
 */
export { ErrorCategory };
export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly code: string;
  public readonly statusCode: number;
  public readonly recoverable: boolean;
  public readonly suggestedAction?: string;
  public readonly details?: Record<string, unknown>;

  constructor(params: {
    category: ErrorCategory;
    code: string;
    message: string;
    statusCode: number;
    recoverable?: boolean;
    suggestedAction?: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = 'AppError';
    this.category = params.category;
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.recoverable = params.recoverable ?? false;
    this.suggestedAction = params.suggestedAction;
    this.details = params.details;
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown>): AppError {
    return new AppError({
      category: ErrorCategory.INPUT_VALIDATION,
      code,
      message,
      statusCode: 400,
      recoverable: true,
      suggestedAction: 'Fix the request payload and retry',
      details,
    });
  }

  static unauthorized(message = 'Invalid or missing authentication token'): AppError {
    return new AppError({
      category: ErrorCategory.UNAUTHORIZED,
      code: 'UNAUTHORIZED',
      message,
      statusCode: 401,
      recoverable: true,
      suggestedAction: 'Sign in again to obtain a fresh access token',
    });
  }

  static notFound(resource: string): AppError {
    return new AppError({
      category: ErrorCategory.NOT_FOUND,
      code: 'NOT_FOUND',
      message: `${resource} not found`,
      statusCode: 404,
      recoverable: true,
    });
  }

  static conflict(code: string, message: string): AppError {
    return new AppError({
      category: ErrorCategory.INPUT_VALIDATION,
      code,
      message,
      statusCode: 409,
      recoverable: true,
    });
  }

  static rateLimited(retryAfterSeconds: number): AppError {
    return new AppError({
      category: ErrorCategory.RATE_LIMIT_EXCEEDED,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down.',
      statusCode: 429,
      recoverable: true,
      suggestedAction: `Retry after ${retryAfterSeconds} seconds`,
      details: { retryAfterSeconds },
    });
  }

  static internal(message = 'An unexpected error occurred'): AppError {
    return new AppError({
      category: ErrorCategory.INTERNAL,
      code: 'INTERNAL_ERROR',
      message,
      statusCode: 500,
      recoverable: false,
    });
  }
}
