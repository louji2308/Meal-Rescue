import { ZodIssue } from 'zod';

/**
 * Human-readable formatting of Zod issues for API error details.
 * Kept separate from the error handler so it is trivially unit-testable.
 */
export function zodValidationError(error: { issues: ZodIssue[] }): Array<{
  path: string;
  message: string;
}> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}
