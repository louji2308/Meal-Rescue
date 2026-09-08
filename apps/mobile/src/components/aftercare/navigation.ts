import { createNavigationContainerRef } from '@react-navigation/native';

import { SATISFACTION_ROUTE } from './slots';

/**
 * App-level navigation ref owned by the aftercare slice.
 *
 * The AppNavigator registers the SatisfactionCheckin route against
 * SATISFACTION_ROUTE; this ref lets the root notification-open listener
 * (App.tsx) navigate there from outside the render tree. It is additive
 * to - never a replacement for - the navigation inside AppNavigator.
 *
 * Merge dependency: the coordinator must pass this same ref to the
 * NavigationContainer in AppNavigator so `navigate()` here reaches the
 * navigator at runtime (`<NavigationContainer ref={navigationRef}>`).
 */
export interface AftercareRouteParams {
  [SATISFACTION_ROUTE]: { rescueId: string; recommendation: string };
}

export const navigationRef = createNavigationContainerRef<AftercareRouteParams>();
