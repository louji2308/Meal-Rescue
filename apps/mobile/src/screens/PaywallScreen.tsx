import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '../components/ErrorBanner';
import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywallNudge } from '../hooks/usePaywallNudge';
import { claimProPass } from '../services/ads.api';
import { showRewardedAd } from '../services/ads.service';
import { toApiError } from '../services/api';
import {
  fetchCurrentPackages,
  hasRevenueCatKeys,
  purchasePackage,
  restorePurchases,
} from '../services/revenuecat.service';
import { colors, spacing, typography } from '../theme';

const VALUE_PROPS = [
  'Unlimited daily rescues',
  'Priority AI ranking for your meals',
  'Zero ads - subscribers never see one',
  'Early access to smart reminders',
];

const STATIC_PRICING = [
  { id: 'monthly', title: 'Monthly', price: '$4.99 / month' },
  { id: 'annual', title: 'Annual', price: '$39.99 / year' },
];

/**
 * Paywall - honest pricing, no fake timers, no dismiss-blocking.
 * With RevenueCat keys configured it renders live offerings; without them
 * (dev builds) static cards appear with purchases disabled and a note.
 */
export function PaywallScreen() {
  const navigation = useNavigation();
  const { isPro, refresh } = useEntitlement();
  const nudge = usePaywallNudge();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [restoredNote, setRestoredNote] = useState<string | null>(null);
  const [passBusy, setPassBusy] = useState(false);
  const [passNote, setPassNote] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentPackages()
      .then(setPackages)
      .catch(() => setPackages([]));
  }, []);

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
      await purchasePackage(target);
      await refresh();
      navigation.goBack();
    } catch (err) {
      setError(toApiError(err));
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
      if (ok) await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleFreeProHour() {
    setError(null);
    setPassNote(null);
    setPassBusy(true);
    try {
      const txId = await showRewardedAd('pro-pass');
      const claim = await claimProPass(txId);
      if (claim.granted && claim.proPassUntil) {
        await refresh();
        setPassNote(
          `You've got Pro free until ${new Date(claim.proPassUntil).toLocaleTimeString()}.`,
        );
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
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close paywall"
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>

        <Text style={[typography.title, styles.headline]}>Meal Rescue Pro</Text>
        <Text style={[typography.body, styles.tagline]}>Rescue every meal, skip every ad.</Text>
        <Image
          source={require('../../assets/pro-cat.png')}
          style={styles.cat}
          resizeMode="contain"
          accessible
          accessibilityLabel="Scraps the pro rescue cat"
        />
        {nudge ? <Text style={styles.nudge}>{nudge}</Text> : null}

        <View style={styles.propsCard}>
          {VALUE_PROPS.map((prop) => (
            <View key={prop} style={styles.propRow}>
              <Text style={styles.propBullet}>-</Text>
              <Text style={styles.propText}>{prop}</Text>
            </View>
          ))}
        </View>

        {(packages.length > 0 ? packages : STATIC_PRICING).map((item) => {
          const pkg = item as PurchasesPackage;
          const id = pkg.identifier ?? (item as { id: string }).id;
          const title = pkg.product?.title ?? (item as { title: string }).title;
          const price = pkg.product?.priceString ?? (item as { price: string }).price;
          return (
            <TouchableOpacity
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${title} plan`}
              style={styles.planCard}
              activeOpacity={0.85}
              disabled={busy || isPro || !hasRevenueCatKeys()}
              onPress={() => void handlePurchase(pkg, id)}
            >
              <Text style={styles.planTitle}>{title}</Text>
              <Text style={styles.planPrice}>{price}</Text>
            </TouchableOpacity>
          );
        })}

        {passNote ? <Text style={styles.passNote}>{passNote}</Text> : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Try Pro free for 1 hour"
          onPress={() => void handleFreeProHour()}
          disabled={passBusy || isPro}
          style={styles.passButton}
          activeOpacity={0.7}
        >
          <Text style={styles.passText}>
            {isPro
              ? 'You have Pro right now'
              : passBusy
                ? 'Loading…'
                : 'Not sure yet? Taste it free for 1 hour'}
          </Text>
        </TouchableOpacity>

        {!hasRevenueCatKeys() && (
          <Text style={styles.devNote}>Configure RevenueCat keys to enable purchases.</Text>
        )}
        {isPro && <Text style={styles.devNote}>You are already Pro.</Text>}

        <ErrorBanner error={error} />
        {restoredNote ? <Text style={styles.restoredNote}>{restoredNote}</Text> : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
          onPress={() => void handleRestore()}
          disabled={busy}
          style={styles.restoreButton}
        >
          <Text style={styles.restoreText}>Restore purchases</Text>
        </TouchableOpacity>
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
  },
  tagline: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  cat: {
    width: 180,
    height: 180,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  nudge: {
    textAlign: 'center',
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  propsCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  propRow: {
    flexDirection: 'row',
  },
  propBullet: {
    color: colors.primary,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  propText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  planCard: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 68,
    justifyContent: 'center',
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
    color: colors.primary,
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
