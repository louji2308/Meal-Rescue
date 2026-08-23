import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  PURCHASES_ERROR_CODE,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';

/**
 * Thin wrapper around RevenueCat's react-native-purchases.
 *
 * The SDK is configured only when platform API keys are present in env
 * (EXPO_PUBLIC_REVENUECAT_ANDROID_KEY / EXPO_PUBLIC_REVENUECAT_IOS_KEY).
 * Without keys - the default for local dev builds - every call degrades to
 * a safe no-op so the app never crashes and purchases stay disabled.
 */

const ENTITLEMENT_ID = 'pro';

let configured = false;

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
    Purchases.configure({ apiKey: apiKey!, appUserID: appUserId });
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
    await Purchases.logIn(userId);
  } catch {
    // Identity sync is best-effort; entitlements refresh on next launch.
  }
}

export async function logOutFromRevenueCat(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
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
    const info = await Purchases.getCustomerInfo();
    return hasProEntitlement(info);
  } catch {
    return false;
  }
}

export async function fetchOfferings(): Promise<PurchasesOfferings | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ? offerings : null;
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
    const result = await Purchases.purchasePackage(pkg);
    return hasProEntitlement(result.customerInfo);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return false;
    }
    throw error;
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await Purchases.restorePurchases();
    return hasProEntitlement(info);
  } catch {
    return false;
  }
}

export function onCustomerInfoChanged(listener: (info: CustomerInfo) => void): () => void {
  if (!configured) return () => undefined;
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}
