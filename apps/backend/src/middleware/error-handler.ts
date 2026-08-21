import { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { ErrorCategory, ErrorResponse } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { zodValidationError } from './zod-format';

/**
 * Global error handler producing the structured ErrorResponse contract:
 *
 * {
 *   success: false,
 *   error: { category, code, message, details?, recoverable, suggestedAction? },
 *   requestId,
 *   timestamp
 * }
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    const structured = toErrorResponse(error, request);
    const statusCode = resolveStatusCode(error);

    if (statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id }, 'Unhandled server error');
    } else {
      request.log.warn(
        { err: error, requestId: request.id, code: structured.error.code },
        'Request failed',
      );
    }

    void reply.status(statusCode).send(structured);
  });

  // Fastify's own 404 for unknown routes gets the same shape.
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      success: false,
      error: {
        category: ErrorCategory.NOT_FOUND,
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${request.method} ${request.url} does not exist`,
        recoverable: true,
        suggestedAction: 'Check the API documentation at /docs',
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    } satisfies ErrorResponse);
  });
}

function resolveStatusCode(error: FastifyError | AppError | ZodError): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  if (error instanceof ZodError) {
    return 400;
  }
  return error.statusCode ?? 500;
}

export function toErrorResponse(
  error: FastifyError | AppError | ZodError,
  request: FastifyRequest,
): ErrorResponse {
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        category: error.category,
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        recoverable: error.recoverable,
        ...(error.suggestedAction ? { suggestedAction: error.suggestedAction } : {}),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  }

  if (error instanceof ZodError) {
    return {
      success: false,
      error: {
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'VALIDATION_ERROR',
        message: 'Request payload failed validation',
        details: { issues: zodValidationError(error) },
        recoverable: true,
        suggestedAction: 'Fix the fields listed in details.issues and retry',
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  }

  // Fastify schema/validation errors
  if ('validation' in error && error.validation) {
    return {
      success: false,
      error: {
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'VALIDATION_ERROR',
        message: error.message || 'Request validation failed',
        details: { issues: error.validation },
        recoverable: true,
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  }

  // Fallback
  const statusCode = resolveStatusCode(error);
  return {
    success: false,
    error: {
      category:
        statusCode === 503 ? ErrorCategory.EXTERNAL_SERVICE_FAILURE : ErrorCategory.INTERNAL,
      code: error.code ?? 'INTERNAL_ERROR',
      message: statusCode >= 500 ? 'An unexpected error occurred' : error.message,
      recoverable: statusCode < 500,
    },
    requestId: request.id,
    timestamp: new Date().toISOString(),
  };
}

export function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  return reply.status(error.statusCode).send({
    success: false,
    error: {
      category: error.category,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      recoverable: error.recoverable,
      ...(error.suggestedAction ? { suggestedAction: error.suggestedAction } : {}),
    },
    requestId: reply.request.id,
    timestamp: new Date().toISOString(),
  } satisfies ErrorResponse);
}
