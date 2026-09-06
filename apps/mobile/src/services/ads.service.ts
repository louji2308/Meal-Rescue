import { Platform } from 'react-native';
import type {
  AdEventType as GmaAdEventType,
  RewardedAd as GmaRewardedAd,
  RewardedAdEventType as GmaRewardedAdEventType,
} from 'react-native-google-mobile-ads';

import { randomUUID } from '../lib/uuid';
import { trackRewardedAdEvent } from './revenuecat.service';

/**
 * Rewarded-ad gateway backed by real Google AdMob rewarded ads.
 *
 * Model: app-backend rewards + RevenueCat ad attribution (Catvertising).
 * A real rewarded ad is loaded and shown; while it plays, every lifecycle
 * event is reported to RevenueCat's AdTracker so impressions, clicks and
 * impression-level revenue land in the RevenueCat Ads dashboard without any
 * RevenueCat-side reward rules. When the user earns the reward, this resolves
 * with a unique transaction id that the app's own backend ledger
 * (/ads/rewards/*) treats as an idempotent claim.
 *
 * Requires a dev build (`expo run:android` / `expo run:ios`) - the native
 * Google Mobile Ads SDK cannot run in Expo Go. In dev builds the SDK's
 * built-in TestIds are used; production builds read real ad-unit ids from env.
 *
 * The AdMob module is loaded lazily so merely importing this file never
 * touches native code (Expo Go safe). The module itself runs module-level
 * side effects on import, so every access is behind a require() guard.
 *
 * RevenueCat ad tracking requires:
 *   react-native-purchases >= 10.2.0, "Impression-level ad revenue" enabled in
 *   the AdMob dashboard, and opt-in via the RevenueCat Ads page.
 * Sources:
 *   https://www.revenuecat.com/docs/ad-monetization/manual-integration
 *   https://docs.page/invertase/react-native-google-mobile-ads/displaying-ads#rewarded-ads
 */

let adsReady = false;

type GmaModule = typeof import('react-native-google-mobile-ads');

let _gmaModule: GmaModule | null | undefined;
let _gmaLoadError = false;

/** Cached access to the AdMob module; null when the native module is missing. */
function getAdMob(): GmaModule | null {
  if (_gmaModule !== undefined) return _gmaModule;
  if (_gmaLoadError) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _gmaModule = require('react-native-google-mobile-ads');
    if (!_gmaModule) _gmaModule = null;
  } catch {
    _gmaLoadError = true;
    _gmaModule = null;
  }
  return _gmaModule;
}

/** True when the native Mobile Ads SDK may be initialized (App ID present). */
export function hasAdMobAppId(): boolean {
  if (Platform.OS === 'android') {
    return Boolean(process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID);
  }
  return Boolean(process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID);
}

/** Initializes the Google Mobile Ads SDK once the native build has an App ID. */
export async function initializeAdsIfConfigured(): Promise<void> {
  if (adsReady || !hasAdMobAppId()) return;
  const gma = getAdMob();
  if (!gma) return;
  try {
    const MobileAds = gma.MobileAds ?? gma.default;
    if (!MobileAds) return;
    await MobileAds().initialize();
    adsReady = true;
  } catch {
    adsReady = false;
  }
}

function rewardedAdUnitId(): string | null {
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID || null;
  }
  return process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS_ID || null;
}

/**
 * Shows a real rewarded ad. Resolves with a unique transaction id when the
 * user earns the reward; rejects when the ad is dismissed, fails, or the
 * native SDK is unavailable (Expo Go / missing App ID).
 */
export function showRewardedAd(purpose = 'reward'): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const gma = getAdMob();
    if (!gma || !adsReady || !hasAdMobAppId()) {
      reject(new Error('AdMob is not configured - set an AdMob App ID and run a dev build.'));
      return;
    }

    const { RewardedAd, AdEventType, RewardedAdEventType, TestIds } = gma;
    const impressionId = randomUUID();
    const adUnitId = rewardedAdUnitId() ?? (__DEV__ ? TestIds.REWARDED : '');

    if (!adUnitId) {
      reject(new Error('No rewarded ad unit configured - set an ad unit id in env.'));
      return;
    }

    const rewarded: GmaRewardedAd = RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    const removeListeners: (() => void)[] = [];
    let settled = false;

    const track = (event: Parameters<typeof trackRewardedAdEvent>[0]) => {
      trackRewardedAdEvent(event, {
        adUnitId,
        impressionId,
        placement: purpose,
      });
    };

    const settle = (result: string | null, error?: Error) => {
      if (settled) return;
      settled = true;
      removeListeners.forEach((r) => r());
      removeListeners.length = 0;
      if (result) resolve(result);
      else reject(error ?? new Error('Rewarded ad dismissed.'));
    };

    const on = (
      type: GmaAdEventType | GmaRewardedAdEventType,
      listener: (payload: unknown) => void,
    ) => {
      removeListeners.push(rewarded.addAdEventListener(type, listener as never));
    };

    on(RewardedAdEventType.LOADED, () => {
      track({ type: 'loaded' });
      rewarded.show().catch(() => settle(null));
    });

    on(RewardedAdEventType.EARNED_REWARD, () => {
      settle(impressionId);
    });

    on(AdEventType.OPENED, () => {
      track({ type: 'displayed' });
    });

    on(AdEventType.CLICKED, () => {
      track({ type: 'opened' });
    });

    on(AdEventType.CLOSED, () => {
      settle(null);
    });

    on(AdEventType.ERROR, (payload) => {
      track({ type: 'failed' });
      settle(null, payload instanceof Error ? payload : new Error('Rewarded ad failed to load.'));
    });

    // Impression-level ad revenue (ILRD) - only fired by real (non-test) ads.
    on(AdEventType.PAID, (payload) => {
      const paid = payload as unknown as { value: number; currency: string };
      if (paid && typeof paid.value === 'number' && paid.currency) {
        track({ type: 'revenue', value: paid.value, currency: paid.currency });
      }
    });

    rewarded.load();
  });
}
