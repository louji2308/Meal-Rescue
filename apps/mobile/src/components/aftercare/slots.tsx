import type { RescueGenerateResponse } from '@meal-rescue/shared-types';

/**
 * Aftercare/Living Plate integration slots (OWNED BY v2/aftercare branch).
 *
 * The v2/mobile-core branch renders these components from the result screen.
 * Placeholder returns null until the aftercare agent lands its implementations;
 * do not change the exported names or prop shapes - they are a frozen contract.
 */

/** Living Plate: tap an addition -> animated before/after + counterfactual explanation. */
export function LivingPlateSlot({ result: _result }: { result: RescueGenerateResponse }) {
  return null;
}

/** Post-result satisfaction check-in ("Did that hit the spot?"). */
export function SatisfactionCheckinSlot({
  rescueId: _rescueId,
  recommendation: _recommendation,
}: {
  rescueId: string;
  recommendation: string;
}) {
  return null;
}

/** Route name the mobile-core navigator registers for the check-in screen. */
export const SATISFACTION_ROUTE = 'SatisfactionCheckin' as const;
