import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

/**
 * Thin wrapper around RevenueCat's react-native-purchases.
 *
 * The SDK is configured only when platform API keys are present in env
 * (EXPO_PUBLIC_REVENUECAT_ANDROID_KEY / EXPO_PUBLIC_REVENUECAT_IOS_KEY).
 * Without keys - the default for local dev builds - every call degrades to
 * a safe no-op so the app never crashes and purchases stay disabled.
 *
 * The native module is loaded lazily so the app never crashes when
 * react-native-purchases is not linked (e.g. Expo Go). All static imports
 * in this file are type-only, which transpiles away and never touches the
 * native binary.
 */

const ENTITLEMENT_ID = 'pro';

let configured = false;

type PurchasesApi = typeof import('react-native-purchases').default;

let _purchasesModule: PurchasesApi | null | undefined;

function getPurchases(): PurchasesApi | null {
  if (_purchasesModule !== undefined) return _purchasesModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _purchasesModule = require('react-native-purchases').default;
    if (!_purchasesModule) _purchasesModule = null;
  } catch {
    _purchasesModule = null;
  }
  return _purchasesModule;
}

export function hasRevenueCatKeys(): boolean {
  if (Platform.OS === 'android') {
    return Boolean(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY);
  }
  return Boolean(process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY);
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

export function configurePurchasesIfReady(appUserId?: string): void {
  if (configured || !hasRevenueCatKeys()) {
    return;
  }
  try {
    const apiKey =
      Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    const purchases = getPurchases();
    if (!purchases) return;
    purchases.configure({ apiKey: apiKey!, appUserID: appUserId });
    configured = true;
  } catch {
    // Configuration failures (missing native module in Expo Go, bad key
    // shape) must never take the app down. Purchases stay disabled.
    configured = false;
  }
}

/** Links an authenticated backend user to their RevenueCat identity. */
export async function logInToRevenueCat(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await getPurchases()?.logIn(userId);
  } catch {
    // Identity sync is best-effort; entitlements refresh on next launch.
  }
}

export async function logOutFromRevenueCat(): Promise<void> {
  if (!configured) return;
  try {
    await getPurchases()?.logOut();
  } catch {
    // Ignore - signing out of RevenueCat must not block app sign-out.
  }
}

function hasProEntitlement(info: CustomerInfo | null): boolean {
  return info?.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

export async function fetchIsPro(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await getPurchases()?.getCustomerInfo();
    return hasProEntitlement(info ?? null);
  } catch {
    return false;
  }
}

export async function fetchOfferings(): Promise<PurchasesOfferings | null> {
  if (!configured) return null;
  try {
    const offerings = await getPurchases()?.getOfferings();
    return offerings?.current ? offerings : null;
  } catch {
    return null;
  }
}

export async function fetchCurrentPackages(): Promise<PurchasesPackage[]> {
  const offerings = await fetchOfferings();
  if (!offerings?.current) return [];
  return offerings.current.availablePackages;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  if (!configured) return false;
  try {
    const result = await getPurchases()?.purchasePackage(pkg);
    return hasProEntitlement(result?.customerInfo ?? null);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'PURCHASE_CANCELLED_ERROR') {
      return false;
    }
    throw error;
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await getPurchases()?.restorePurchases();
    return hasProEntitlement(info ?? null);
  } catch {
    return false;
  }
}

export function onCustomerInfoChanged(listener: (info: CustomerInfo) => void): () => void {
  if (!configured) return () => undefined;
  getPurchases()?.addCustomerInfoUpdateListener(listener);
  return () => getPurchases()?.removeCustomerInfoUpdateListener(listener);
}

/**
 * RevenueCat Ads tracking (manual integration).
 *
 * Reports rewarded-ad lifecycle events to RevenueCat for Ads attribution
 * (Catvertising). No RevenueCat-side reward rules are required here - the
 * app's own backend ledger grants the reward; the adTracker calls only feed
 * revenue/impression data into the RevenueCat Ads dashboard.
 *
 * Requires react-native-purchases >= 10.2.0 and "Impression-level ad revenue"
 * enabled in the AdMob dashboard.
 * Source: https://www.revenuecat.com/docs/ad-monetization/manual-integration
 */
type AdTrackerEvent =
  | { type: 'loaded' | 'displayed' | 'opened' }
  | { type: 'revenue'; value: number; currency: string }
  | { type: 'failed' };

type AdTrackerInput = {
  adUnitId: string;
  impressionId: string;
  placement: string;
};

export function trackRewardedAdEvent(event: AdTrackerEvent, ctx: AdTrackerInput): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AdMediatorName, AdFormat, AdRevenuePrecision } = require('react-native-purchases');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Purchases = require('react-native-purchases').default;
    const tracker = Purchases?.adTracker;
    if (!tracker) return;
    const base = {
      networkName: null,
      mediatorName: AdMediatorName.adMob,
      adFormat: AdFormat.rewarded,
      placement: ctx.placement,
      adUnitId: ctx.adUnitId,
      impressionId: ctx.impressionId,
    };
    switch (event.type) {
      case 'loaded':
        void tracker.trackAdLoaded(base);
        break;
      case 'displayed':
        void tracker.trackAdDisplayed(base);
        break;
      case 'opened':
        void tracker.trackAdOpened(base);
        break;
      case 'revenue':
        void tracker.trackAdRevenue({
          ...base,
          revenueMicros: Math.round(event.value * 1_000_000),
          currency: event.currency,
          precision: AdRevenuePrecision.exact,
        });
        break;
      case 'failed':
        void tracker.trackAdFailedToLoad({
          mediatorName: AdMediatorName.adMob,
          adFormat: AdFormat.rewarded,
          placement: ctx.placement,
          adUnitId: ctx.adUnitId,
        });
        break;
    }
  } catch {
    // Ad tracking is best-effort - never break the ad flow with it.
  }
}
