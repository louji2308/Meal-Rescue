import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { ErrorBanner } from '../components/ErrorBanner';
import { Skeleton } from '../components/Skeleton';
import { FadeInView } from '../components/motion/FadeInView';
import { Pressable } from '../components/motion/Pressable';
import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywallNudge } from '../hooks/usePaywallNudge';
import { usePaywallTeaser } from '../hooks/usePaywallTeaser';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { claimProPass } from '../services/ads.api';
import { syncSubscription } from '../services/ads.api';
import { hasAdMobAppId, showRewardedAd } from '../services/ads.service';
import { ApiError, toApiError } from '../services/api';
import { lastLovedFromStore, planTeaser } from '../services/paywall.api';
import {
  fetchCurrentPackages,
  fetchEntitlementClaim,
  hasRevenueCatKeys,
  purchasePackage,
  restorePurchases,
} from '../services/revenuecat.service';
import { useMealMemoryStore } from '../stores/meal-memory.store';
import { useMonetization } from '../stores/monetization.store';
import { usePaywallContext } from '../stores/paywall-context.store';
import { useRescuesStore } from '../stores/rescues.store';
import { colors, fonts, spacing, typography } from '../theme';

type PlanId = 'monthly' | 'yearly' | 'lifetime';

const STATIC_PRICING = [
  { id: 'monthly', title: 'Monthly', price: '$4.99' },
  { id: 'annual', title: 'Yearly', price: '$39.99' },
  { id: 'lifetime', title: 'Lifetime', price: '$79.99' },
];

const PLAN_LABELS: Record<PlanId, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  lifetime: 'Lifetime',
};

const PLAN_ORDER: Record<PlanId, number> = { monthly: 0, yearly: 1, lifetime: 2 };

const PLAN_PRICE_SUFFIX: Record<PlanId, string | null> = {
  monthly: '/ month',
  yearly: '/ year',
  lifetime: null,
};

/**
 * Resolves which billing tier a package belongs to.
 *
 * Store product titles are usually a single marketing string ("Pro") shared by
 * every tier, so they can never be used to tell the cards apart. The package
 * type RevenueCat derives from the predefined identifiers is authoritative;
 * after that we scan identifiers, then the ISO-8601 subscription period.
 */
function detectPlan(
  packageType: string | undefined,
  sources: Array<string | null | undefined>,
  product?: { subscriptionPeriod?: string | null; productCategory?: string | null } | null,
): PlanId | null {
  if (packageType === 'LIFETIME') return 'lifetime';
  if (packageType === 'ANNUAL') return 'yearly';
  if (packageType === 'MONTHLY') return 'monthly';

  const haystack = sources.filter(Boolean).join(' ').toLowerCase();
  if (/(lifetime|forever|one[-_ ]?time)/.test(haystack)) return 'lifetime';
  if (/(annual|yearly|year)/.test(haystack)) return 'yearly';
  if (/(monthly|month)/.test(haystack)) return 'monthly';

  const period = product?.subscriptionPeriod;
  if (period) {
    if (period.includes('Y')) return 'yearly';
    if (period.includes('M')) return 'monthly';
  }
  if (product?.productCategory === 'NON_SUBSCRIPTION') return 'lifetime';
  return null;
}

/**
 * Paywall - honest pricing, no fake timers, no dismiss-blocking.
 * With RevenueCat keys configured it renders live offerings; without them
 * (dev builds) static cards appear with purchases disabled and a note.
 */
export function PaywallScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Paywall'>>();
  // Copy-free variant: the Common Table "add someone" gate opens the paywall
  // with just the cat and the buttons — no tagline, no nudge, no teaser card.
  const minimal = route.params?.minimal === true;
  const { refresh: refreshEntitlement } = useEntitlement();
  const nudge = usePaywallNudge();
  const planUpsell = usePaywallContext((s) => s.plan);
  const clearPlan = usePaywallContext((s) => s.clearPlan);
  const loved = useRescuesStore((s) => s.loved);
  const lovedCtx = useMemo(() => lastLovedFromStore(loved), [loved]);
  // One seed per open — the hardcoded pools rotate with it, so Profile →
  // Upgrade reads differently every time the screen mounts.
  const seed = useMemo(() => Math.floor(Math.random() * 100_000), []);
  // No teaser request while a plan teaser is showing — or when the screen was
  // opened copy-free (nothing on screen would render it).
  const { teaser, hasMove, mode } = usePaywallTeaser({
    enabled: !minimal && planUpsell === null,
    loved: lovedCtx,
    seed,
  });

  // Teaser precedence — one paywall screen, three entrances:
  //   Meal Plan (locked day / spent allowance) → plan copy
  //   Profile (or anywhere else, when a rescue was loved) → loved copy
  //   otherwise → the original last-move rescue teaser (or a taste of Pro)
  const planCopy = planUpsell ? planTeaser(planUpsell, seed) : null;
  const teaserOpener = planCopy?.opener ?? teaser.opener;
  const teaserHook = planCopy?.hook ?? teaser.hook;
  const teaserEyebrow = planCopy
    ? 'Your plan'
    : mode === 'loved'
      ? 'Loved rescue'
      : hasMove
        ? 'From your last rescue'
        : 'A taste of Pro';
  const isPro = useMonetization((state) => state.isPro);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [restoredNote, setRestoredNote] = useState<string | null>(null);
  const [passBusy, setPassBusy] = useState(false);
  const [passNote, setPassNote] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentPackages()
      .then(setPackages)
      .catch(() => setPackages([]))
      .finally(() => setPackagesLoading(false));
  }, []);

  /**
   * RevenueCat → backend DB. The plan gate and the Profile tier read
   * `subscription_tier`, so Pro only counts once the server records it: the
   * SDK's entitlement travels with the request (test-store purchases can't be
   * verified by RevenueCat's REST API) and the response — not a local flag —
   * decides what the app shows. One immediate retry; a second failure is
   * surfaced (never swallowed) instead of pretending the purchase landed.
   */
  async function syncTier(): Promise<{ tier: 'free' | 'pro' }> {
    const claim = await fetchEntitlementClaim();
    try {
      return await syncSubscription(claim);
    } catch {
      return await syncSubscription(claim);
    }
  }

  async function handlePurchase(pkg?: PurchasesPackage, fallbackId?: string) {
    setError(null);
    setBusy(true);
    try {
      if (!hasRevenueCatKeys()) {
        setRestoredNote('Configure RevenueCat keys to enable purchases.');
        return;
      }
      let target = pkg;
      if (!target && fallbackId) {
        target = packages.find((p) => p.identifier === fallbackId);
      }
      if (!target) {
        setRestoredNote('No offering available yet.');
        return;
      }
      const granted = await purchasePackage(target);
      if (!granted) {
        // Cancelled - nothing to sync or unlock, just close.
        navigation.goBack();
        return;
      }
      // Accept ONLY what the server confirms — no optimistic Pro.
      const { tier } = await syncTier();
      if (tier !== 'pro') {
        throw new ApiError({
          message: 'The purchase did not activate Pro yet. Please try again.',
          code: 'PURCHASE_NOT_VERIFIED',
          category: 'SUBSCRIPTION_REQUIRED',
          recoverable: true,
        });
      }
      useMonetization.setState({ tier: 'pro', isPro: true });
      clearPlan();
      // The locked days were a teaser only — Pro drops the padlocks in the
      // calendar right away (server side unlocks every day from now on).
      useMealMemoryStore.getState().clearProLockedDays();
      await refreshEntitlement();
      void useMonetization.getState().refresh();
      navigation.goBack();
    } catch (err) {
      setError(toApiError(err));
      // Never leave a false "Pro" (or a stale free tier) on screen.
      void useMonetization.getState().refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setError(null);
    setRestoredNote(null);
    setBusy(true);
    try {
      const ok = await restorePurchases();
      setRestoredNote(ok ? 'Purchases restored.' : 'Nothing to restore yet.');
      if (ok) {
        // Same rule as a purchase: the server decides whether this is Pro.
        const { tier } = await syncTier();
        if (tier !== 'pro') {
          throw new ApiError({
            message: 'No active Pro subscription was found to restore.',
            code: 'PURCHASE_NOT_VERIFIED',
            category: 'SUBSCRIPTION_REQUIRED',
            recoverable: true,
          });
        }
        useMonetization.setState({ tier: 'pro', isPro: true });
        clearPlan();
        useMealMemoryStore.getState().clearProLockedDays();
        await refreshEntitlement();
        void useMonetization.getState().refresh();
      }
    } catch (err) {
      setError(toApiError(err));
      void useMonetization.getState().refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleFreeProHour() {
    setError(null);
    setPassNote(null);
    if (!hasAdMobAppId()) {
      setPassNote('Ads need a dev build with an AdMob App ID configured.');
      return;
    }
    setPassBusy(true);
    try {
      const txId = await showRewardedAd('pro-pass');
      const claim = await claimProPass(txId);
      if (claim.granted && claim.proPassUntil) {
        await refreshEntitlement();
        void useMonetization.getState().refresh();
        setPassNote(`You've got Pro free until ${new Date(claim.proPassUntil).toLocaleString()}.`);
      } else {
        setPassNote('Ad not counted this time - try again?');
      }
    } catch {
      setPassNote('Ad dismissed. No charge, of course.');
    } finally {
      setPassBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <FadeInView rise={16} duration={320}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close paywall"
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>

          {/* Minimal variant: cat + plan cards + one line. No headline,
              tagline, nudge or teaser — the "add someone" gate only needs
              the picture, the prices and the reason to subscribe. */}
          {!minimal && <Text style={[typography.title, styles.headline]}>Meal Rescue Pro</Text>}
          {!minimal && (
            <Text style={[typography.body, styles.tagline]}>
              Never settle for an unfinished meal
            </Text>
          )}
          <FadeInView delay={140} rise={20} duration={420}>
            <View style={styles.catFrame}>
              <Image
                source={require('../../assets/pro-cat.webp')}
                style={styles.cat}
                contentFit="contain"
                transition={160}
                accessible
                accessibilityLabel="Scraps the pro rescue cat"
              />
            </View>
          </FadeInView>
          {!minimal && nudge ? <Text style={styles.nudge}>{nudge}</Text> : null}

          {/* Teaser: plan-aware when opened from a locked plan day, rescue
              copy everywhere else. Hidden in the minimal
              variant — that paywall shows the cat and the buttons only. */}
          {!minimal && (
            <FadeInView key={teaserOpener} rise={10} duration={420} delay={240}>
              <View style={styles.teaserCard}>
                <Text style={styles.teaserEyebrow}>{teaserEyebrow}</Text>
                <Text style={styles.teaserOpener}>{teaserOpener}</Text>
                <Text style={styles.teaserHook}>{teaserHook}</Text>
              </View>
            </FadeInView>
          )}

          {packagesLoading ? (
            <>
              <View style={styles.planCard}>
                <Skeleton.Block width="40%" height={16} style={{ marginBottom: 6 }} />
                <Skeleton.Block width="30%" height={14} />
              </View>
              <View style={styles.planCard}>
                <Skeleton.Block width="40%" height={16} style={{ marginBottom: 6 }} />
                <Skeleton.Block width="30%" height={14} />
              </View>
              <View style={styles.planCard}>
                <Skeleton.Block width="40%" height={16} style={{ marginBottom: 6 }} />
                <Skeleton.Block width="30%" height={14} />
              </View>
            </>
          ) : (
            (packages.length > 0 ? packages : STATIC_PRICING)
              .map((item, i) => {
                const pkg = item as PurchasesPackage;
                const id = pkg.identifier ?? (item as { id: string }).id;
                const product = pkg.product;
                const fallbackTitle = (item as { title: string }).title;
                const plan =
                  detectPlan(pkg.packageType, [id, product?.identifier, product?.title], product) ??
                  detectPlan(undefined, [fallbackTitle]);
                const title = plan ? PLAN_LABELS[plan] : fallbackTitle;
                const rawPrice = product?.priceString ?? (item as { price: string }).price;
                const price =
                  plan && PLAN_PRICE_SUFFIX[plan]
                    ? `${rawPrice} ${PLAN_PRICE_SUFFIX[plan]}`
                    : rawPrice;
                const recommended = plan === 'yearly';
                return {
                  key: `${id}-${i}`,
                  pkg,
                  id,
                  title,
                  price,
                  recommended,
                  order: plan ? PLAN_ORDER[plan] : 99,
                };
              })
              .sort((a, b) => a.order - b.order)
              .map(({ key, pkg, id, title, price, recommended }, i) => {
                return (
                  <FadeInView key={key} delay={360 + i * 90} rise={12} duration={380}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Choose ${title} plan`}
                      style={[styles.planCard, recommended && styles.planCardRecommended]}
                      tintBorderRadius={12}
                      disabled={busy || isPro || !hasRevenueCatKeys()}
                      onPress={() => void handlePurchase(pkg, id)}
                    >
                      {recommended && (
                        <View style={styles.recommendedBadge}>
                          <Text style={styles.recommendedBadgeText}>Best value</Text>
                        </View>
                      )}
                      <Text style={styles.planTitle}>{title}</Text>
                      <Text style={styles.planPrice}>{price}</Text>
                    </Pressable>
                  </FadeInView>
                );
              })
          )}

          {minimal && (
            <Text style={styles.minimalNote}>Subscribe to add more people to your table</Text>
          )}

          {!minimal && passNote ? <Text style={styles.passNote}>{passNote}</Text> : null}

          {!minimal && (
            <FadeInView delay={680} rise={8} duration={340}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try Pro free for 1 hour"
                onPress={() => void handleFreeProHour()}
                disabled={passBusy || isPro}
                style={styles.passButton}
                tintBorderRadius={12}
              >
                <Text style={styles.passText}>
                  {isPro
                    ? 'You have Pro right now'
                    : passBusy
                      ? 'Loading…'
                      : 'Not sure yet? Taste it free for 1 hour'}
                </Text>
              </Pressable>
            </FadeInView>
          )}

          {!minimal && !hasRevenueCatKeys() && (
            <Text style={styles.devNote}>Configure RevenueCat keys to enable purchases.</Text>
          )}
          {!minimal && isPro && <Text style={styles.devNote}>You are already Pro.</Text>}

          <ErrorBanner error={error} />
          {restoredNote ? <Text style={styles.restoredNote}>{restoredNote}</Text> : null}

          <FadeInView delay={740} rise={8} duration={340}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restore purchases"
              onPress={() => void handleRestore()}
              disabled={busy}
              style={styles.restoreButton}
              tintBorderRadius={12}
            >
              <Text style={styles.restoreText}>Restore purchases</Text>
            </Pressable>
          </FadeInView>
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  closeButton: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  headline: {
    textAlign: 'center',
    // Bricolage Grotesque for the paywall headline (rides over typography.title)
    fontFamily: fonts.display,
    fontWeight: '700',
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  tagline: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  minimalNote: {
    textAlign: 'center',
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  catFrame: {
    width: 180,
    height: 180,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  cat: {
    width: 180,
    height: 180,
  },

  nudge: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  teaserCard: {
    marginBottom: spacing.lg,
  },
  teaserEyebrow: {
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  teaserOpener: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
    color: colors.text,
  },
  teaserHook: {
    fontFamily: fonts.regular,
    fontSize: 17,
    lineHeight: 24,
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
  planCard: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 68,
    justifyContent: 'center',
  },
  planCardRecommended: {
    borderColor: colors.borderStrong,
    borderWidth: 2,
    backgroundColor: colors.accentSoft,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -10,
    right: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  recommendedBadgeText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: '700',
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  planPrice: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  devNote: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  restoredNote: {
    textAlign: 'center',
    color: colors.primary,
    marginTop: spacing.sm,
    fontSize: 14,
  },
  passNote: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontSize: 14,
    fontWeight: '600',
  },
  passButton: {
    marginTop: spacing.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  passText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  restoreButton: {
    marginTop: spacing.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  restoreText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
