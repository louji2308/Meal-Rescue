import { useCallback, useState } from 'react';

import type { SatisfactionRecordResponse } from '@meal-rescue/shared-types';

import type { ApiError } from '../../services/api';
import { recordSatisfactionSafe } from '../../services/satisfaction.api';

export type SatisfactionResult = 'EXACTLY' | 'ALMOST' | 'NOT_REALLY';

export interface UseSatisfactionCheckinOptions {
  rescueId: string;
}

/**
 * Posts a one-tap satisfaction check-in ("Did that hit the spot?").
 *
 * State machine:
 *   idle -> submitting -> success (personalizationImpact shown)
 *                    -> error (recoverable; retry keeps the record)
 *
 * The screen is never blocked from being dismissed: `idle` is the resting
 * state, and any network error degrades to a friendly message instead of an
 * unresponsive UI.
 */
export function useSatisfactionCheckin({ rescueId }: UseSatisfactionCheckinOptions) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [response, setResponse] = useState<SatisfactionRecordResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = useCallback(
    async (result: SatisfactionResult, reasons?: string[]) => {
      if (status === 'submitting') return;
      setStatus('submitting');
      setError(null);
      const outcome = await recordSatisfactionSafe(rescueId, {
        result,
        ...(reasons && reasons.length > 0 ? { reason: reasons } : {}),
      });
      if (outcome.ok) {
        setResponse(outcome.data);
        setStatus('success');
      } else {
        setError(outcome.error);
        setStatus('error');
      }
    },
    [rescueId, status],
  );

  return {
    status,
    response,
    error,
    submit,
  };
}
